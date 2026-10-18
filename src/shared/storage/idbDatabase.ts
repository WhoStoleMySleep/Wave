import { log } from "@/shared/utils/logger";
import { moveLegacyDatabase } from "./legacyStorage";

export type StoreName = "tracks" | "audio" | "audioPlays" | "lyrics" | "artists" | "downloads" | "snapshots" | "covers";

interface StoreSchema {
  name: StoreName;
  keyPath: string;
  indexes: readonly string[];
}

const DB_NAME = "wave_db_v1";
const LEGACY_DB_NAME = "liner_db_v1";
const DB_VERSION = 8;
const LYRICS_RESHAPED_IN = 4;
const ATTEMPTS = 2;

const SCHEMA: readonly StoreSchema[] = [
  { name: "tracks", keyPath: "id", indexes: ["savedAt"] },
  { name: "audio", keyPath: "trackId", indexes: ["savedAt", "byteSize", "lastPlayedAt"] },
  { name: "audioPlays", keyPath: "trackId", indexes: [] },
  { name: "lyrics", keyPath: "trackId", indexes: ["lastCheckedAt", "syncLevel"] },
  { name: "artists", keyPath: "id", indexes: ["lastCheckedAt"] },
  { name: "downloads", keyPath: "trackId", indexes: ["downloadedAt"] },
  { name: "snapshots", keyPath: "key", indexes: [] },
  { name: "covers", keyPath: "url", indexes: ["savedAt"] },
];

export const UNAVAILABLE = new Error("IndexedDB is not available");

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function ensureStore(db: IDBDatabase, upgrade: IDBTransaction, schema: StoreSchema): void {
  const exists = db.objectStoreNames.contains(schema.name);
  const store = exists ? upgrade.objectStore(schema.name) : db.createObjectStore(schema.name, { keyPath: schema.keyPath });
  for (const index of schema.indexes) {
    if (!store.indexNames.contains(index)) store.createIndex(index, index, { unique: false });
  }
}

function upgradeSchema(request: IDBOpenDBRequest, oldVersion: number): void {
  const upgrade = request.transaction;
  if (!upgrade) return;
  SCHEMA.forEach((schema) => ensureStore(request.result, upgrade, schema));
  if (oldVersion > 0 && oldVersion < LYRICS_RESHAPED_IN) upgrade.objectStore("lyrics").clear();
}

function inTransaction<T>(db: IDBDatabase, name: StoreName, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    let result: T;
    operation(transaction.objectStore(name)).then((value) => (result = value), reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error(`${name} transaction aborted`));
  });
}

export class IdbDatabase {
  private connection: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | undefined) {}

  public get available(): boolean {
    return this.factory !== undefined;
  }

  /**
   * Runs `operation` in a transaction; a stale connection is reopened and the operation tried once more.
   * @returns the operation's result, or the error once both attempts failed
   */
  public async run<T>(name: StoreName, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T | Error> {
    if (!this.factory) return UNAVAILABLE;
    let failure: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        return await inTransaction(await this.connect(this.factory), name, mode, operation);
      } catch (error) {
        failure = error;
        this.connection = null;
      }
    }
    log("red", "storage", `${name} ${mode} failed`, failure);
    return failure instanceof Error ? failure : new Error(String(failure));
  }

  public async close(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (!connection) return;
    try {
      (await connection).close();
    } catch (error) {
      log("yellow", "storage", "closing a connection that never opened", error);
    }
  }

  private connect(factory: IDBFactory): Promise<IDBDatabase> {
    this.connection ??= moveLegacyDatabase(LEGACY_DB_NAME, DB_NAME, factory).then(() => this.open(factory));
    return this.connection;
  }

  private open(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => upgradeSchema(request, event.oldVersion);
      request.onsuccess = () => resolve(this.watch(request.result));
      request.onerror = () => reject(request.error);
      request.onblocked = () => log("yellow", "storage", "upgrade waits for another tab to close the database");
    });
  }

  private watch(db: IDBDatabase): IDBDatabase {
    const forget = () => (this.connection = null);
    db.onclose = forget;
    db.onversionchange = () => {
      db.close();
      forget();
    };
    return db;
  }
}
