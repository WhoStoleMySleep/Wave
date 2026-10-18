import { describe, it, expect, vi } from "vitest";
import { IdbDatabase, UNAVAILABLE } from "./idbDatabase";
import { RecordStore } from "./recordStore";

interface Item {
  id: string;
  value: number;
}

function storeOver(db: IdbDatabase): RecordStore<Item> {
  return new RecordStore<Item>(db, "tracks", (item) => item.id);
}

function dbRejectingFirstWrite() {
  const run = vi.fn().mockResolvedValueOnce(new Error("quota exceeded"));
  return { db: { run } as unknown as IdbDatabase, run };
}

describe("RecordStore", () => {
  it("keeps records in memory when IndexedDB is unavailable", async () => {
    const store = storeOver(new IdbDatabase(undefined));
    await store.put({ id: "a", value: 1 });
    await store.put({ id: "b", value: 2 });

    expect(await store.get("a")).toEqual({ id: "a", value: 1 });
    expect(await store.has("b")).toBe(true);
    expect(await store.all()).toHaveLength(2);

    await store.delete(["a"]);
    expect(await store.get("a")).toBeNull();
    await store.clear();
    expect(await store.all()).toEqual([]);
  });

  it("forgets the memory copy once IndexedDB accepts the write", async () => {
    const { db, run } = dbRejectingFirstWrite();
    const store = storeOver(db);
    await store.put({ id: "a", value: 1 });
    expect(await store.has("a")).toBe(true);

    run.mockResolvedValueOnce("a").mockResolvedValueOnce(undefined);
    await store.put({ id: "a", value: 2 });
    expect(await store.get("a")).toBeNull();
  });

  it("lets a record IndexedDB refused override the stored one in listings", async () => {
    const { db, run } = dbRejectingFirstWrite();
    const store = storeOver(db);
    await store.put({ id: "a", value: 2 });

    run.mockResolvedValueOnce([{ id: "a", value: 1 }, { id: "b", value: 1 }]);
    expect(await store.all()).toEqual([{ id: "a", value: 2 }, { id: "b", value: 1 }]);
  });

  it("lists memory-only keys before the stored ones when ordering by an index", async () => {
    const { db, run } = dbRejectingFirstWrite();
    const store = storeOver(db);
    await store.put({ id: "fresh", value: 1 });

    run.mockResolvedValueOnce(["old", "newer"]);
    expect(await store.keysBy("savedAt")).toEqual(["fresh", "old", "newer"]);
  });
});

describe("IdbDatabase", () => {
  it("reports IndexedDB as unavailable without a factory", async () => {
    const db = new IdbDatabase(undefined);
    expect(db.available).toBe(false);
    expect(await db.run("tracks", "readonly", async () => 1)).toBe(UNAVAILABLE);
  });

  it("retries a failed open once and returns the error", async () => {
    const open = vi.fn((_name: string) => {
      throw new Error("open failed");
    });
    const db = new IdbDatabase({ open } as unknown as IDBFactory);
    const result = await db.run("tracks", "readonly", async () => 1);

    expect(result).toBeInstanceOf(Error);
    expect(open.mock.calls.filter(([name]) => name === "wave_db_v1")).toHaveLength(2);
  });
});
