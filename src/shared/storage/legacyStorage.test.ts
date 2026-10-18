import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyKeys, moveLegacyDatabase } from "./legacyStorage";

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openWith(factory: IDBFactory, name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const request = factory.open(name, version);
  request.onupgradeneeded = () => upgrade(request.result);
  return settle(request);
}

async function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return settle(db.transaction(store, "readonly").objectStore(store).getAll());
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map(({ name }) => name ?? "");
}

describe("migrateLegacyKeys", () => {
  beforeEach(() => localStorage.clear());

  it("renames every liner_ key to wave_ and leaves other keys alone", () => {
    localStorage.setItem("liner_auth_session", "session");
    localStorage.setItem("liner_lyrics_v2_item_1", "lyrics");
    localStorage.setItem("theme", "dark");
    migrateLegacyKeys(localStorage);
    expect(localStorage.getItem("wave_auth_session")).toBe("session");
    expect(localStorage.getItem("wave_lyrics_v2_item_1")).toBe("lyrics");
    expect(localStorage.getItem("liner_auth_session")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("keeps a value already saved under the new name", () => {
    localStorage.setItem("liner_locale", "en");
    localStorage.setItem("wave_locale", "ru");
    migrateLegacyKeys(localStorage);
    expect(localStorage.getItem("wave_locale")).toBe("ru");
    expect(localStorage.getItem("liner_locale")).toBeNull();
  });
});

describe("moveLegacyDatabase", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("copies stores, indexes and records, then deletes the legacy database", async () => {
    const legacy = await openWith(factory, "liner_db_v1", 8, (db) => {
      db.createObjectStore("tracks", { keyPath: "id" }).createIndex("savedAt", "savedAt");
      db.createObjectStore("wallpapers");
    });
    const write = legacy.transaction(["tracks", "wallpapers"], "readwrite");
    for (let i = 0; i < 120; i++) write.objectStore("tracks").put({ id: `t${String(i).padStart(3, "0")}`, savedAt: i });
    write.objectStore("wallpapers").put({ image: "data" }, "active_wallpaper");
    await new Promise((resolve) => (write.oncomplete = resolve));
    legacy.close();

    await moveLegacyDatabase("liner_db_v1", "wave_db_v1", factory);

    const moved = await openWith(factory, "wave_db_v1", 8, () => {});
    expect(moved.version).toBe(8);
    expect(await readAll(moved, "tracks")).toHaveLength(120);
    expect(moved.transaction("tracks").objectStore("tracks").indexNames.contains("savedAt")).toBe(true);
    expect(await settle(moved.transaction("wallpapers").objectStore("wallpapers").get("active_wallpaper"))).toEqual({ image: "data" });
    moved.close();
    expect(await databaseNames(factory)).not.toContain("liner_db_v1");
  });

  it("creates nothing when there is no legacy database", async () => {
    await moveLegacyDatabase("liner_db_v1", "wave_db_v1", factory);
    expect(await databaseNames(factory)).toEqual([]);
  });
});
