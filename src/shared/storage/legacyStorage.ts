import { log } from "@/shared/utils/logger";

const LEGACY_KEY_PREFIX = "liner_";
const KEY_PREFIX = "wave_";
const COPY_BATCH = 50;

interface IndexShape {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
}

interface StoreShape {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: IndexShape[];
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Renames the keys the app kept under its former name Liner; a key already present under the new name wins.
 * Runs synchronously, so it has to finish before any module reads its settings.
 */
export function migrateLegacyKeys(storage: Storage | undefined = globalThis.localStorage): void {
  if (!storage) return;
  try {
    const legacyKeys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
      (key): key is string => key?.startsWith(LEGACY_KEY_PREFIX) ?? false,
    );
    for (const legacyKey of legacyKeys) {
      const key = KEY_PREFIX + legacyKey.slice(LEGACY_KEY_PREFIX.length);
      const value = storage.getItem(legacyKey);
      if (value !== null && storage.getItem(key) === null) storage.setItem(key, value);
      storage.removeItem(legacyKey);
    }
  } catch (error) {
    log("red", "storage", "legacy settings could not be moved", error);
  }
}

/** Opening a missing database would create it, so the creation is aborted and reported as null. */
function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => {
      event.preventDefault();
      if (request.error?.name === "AbortError") resolve(null);
      else reject(request.error);
    };
  });
}

function shapesOf(db: IDBDatabase): StoreShape[] {
  const names = Array.from(db.objectStoreNames);
  if (names.length === 0) return [];
  const transaction = db.transaction(names, "readonly");
  return names.map((name) => {
    const store = transaction.objectStore(name);
    const indexes = Array.from(store.indexNames, (indexName) => {
      const index = store.index(indexName);
      return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
    });
    return { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes };
  });
}

function openCopy(factory: IDBFactory, name: string, version: number, shapes: StoreShape[]): Promise<IDBDatabase> {
  const request = factory.open(name, version);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const shape of shapes) {
      if (db.objectStoreNames.contains(shape.name)) continue;
      const store = db.createObjectStore(shape.name, { keyPath: shape.keyPath, autoIncrement: shape.autoIncrement });
      shape.indexes.forEach(({ name: indexName, keyPath, unique, multiEntry }) =>
        store.createIndex(indexName, keyPath, { unique, multiEntry }),
      );
    }
  };
  return settle(request);
}

function writeBatch(target: IDBDatabase, shape: StoreShape, keys: IDBValidKey[], values: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = target.transaction(shape.name, "readwrite");
    const store = transaction.objectStore(shape.name);
    values.forEach((value, i) => (shape.keyPath === null ? store.put(value, keys[i]) : store.put(value)));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error(`${shape.name} copy aborted`));
  });
}

/** Copies in batches, so a store of downloaded audio never has to fit in memory at once. */
async function copyStore(source: IDBDatabase, target: IDBDatabase, shape: StoreShape): Promise<void> {
  let after: IDBValidKey | undefined;
  for (;;) {
    const store = source.transaction(shape.name, "readonly").objectStore(shape.name);
    const range = after === undefined ? undefined : IDBKeyRange.lowerBound(after, true);
    const [keys, values] = await Promise.all([settle(store.getAllKeys(range, COPY_BATCH)), settle(store.getAll(range, COPY_BATCH))]);
    if (keys.length === 0) return;
    await writeBatch(target, shape, keys, values);
    after = keys[keys.length - 1];
  }
}

async function copyDatabase(factory: IDBFactory, legacyName: string, name: string): Promise<void> {
  const source = await openExisting(factory, legacyName);
  if (!source) return;
  try {
    const shapes = shapesOf(source);
    const target = await openCopy(factory, name, source.version, shapes);
    try {
      for (const shape of shapes) await copyStore(source, target, shape);
    } finally {
      target.close();
    }
  } finally {
    source.close();
  }
  await settle(factory.deleteDatabase(legacyName));
}

const moves = new WeakMap<IDBFactory, Map<string, Promise<void>>>();

/**
 * Moves a database of the former app name under its new one before the app first opens it.
 * The legacy copy is deleted only after everything was copied, so an interrupted move is simply repeated.
 * Failures are logged, not thrown: the app then starts with an empty database instead of not starting.
 */
export function moveLegacyDatabase(legacyName: string, name: string, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
  if (!factory) return Promise.resolve();
  const started = moves.get(factory) ?? new Map<string, Promise<void>>();
  moves.set(factory, started);
  let move = started.get(legacyName);
  if (!move) {
    move = copyDatabase(factory, legacyName, name).catch((error: unknown) =>
      log("red", "storage", `${legacyName} could not be moved to ${name}`, error),
    );
    started.set(legacyName, move);
  }
  return move;
}
