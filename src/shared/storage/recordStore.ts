import { IdbDatabase, requestResult, type StoreName } from "./idbDatabase";

export class RecordStore<T> {
  private readonly fallback = new Map<string, T>();

  constructor(
    private readonly db: IdbDatabase,
    private readonly name: StoreName,
    private readonly keyOf: (record: T) => string,
  ) {}

  public async get(key: string): Promise<T | null> {
    const stored = await this.db.run(this.name, "readonly", (store) => requestResult<T | undefined>(store.get(key)));
    if (stored instanceof Error || stored === undefined) return this.fallback.get(key) ?? null;
    return stored;
  }

  public async all(): Promise<T[]> {
    const stored = await this.db.run(this.name, "readonly", (store) => requestResult<T[]>(store.getAll()));
    const byKey = new Map((stored instanceof Error ? [] : stored).map((record) => [this.keyOf(record), record]));
    this.fallback.forEach((record, key) => byKey.set(key, record));
    return [...byKey.values()];
  }

  /** Primary keys ordered by `index`, read without loading the records themselves. */
  public async keysBy(index: string): Promise<string[]> {
    const stored = await this.db.run(this.name, "readonly", (store) => requestResult(store.index(index).getAllKeys()));
    const keys = stored instanceof Error ? [] : stored.map(String);
    const storedKeys = new Set(keys);
    const memoryOnly = [...this.fallback.keys()].filter((key) => !storedKeys.has(key));
    return [...memoryOnly, ...keys];
  }

  public async has(key: string): Promise<boolean> {
    if (this.fallback.has(key)) return true;
    const count = await this.db.run(this.name, "readonly", (store) => requestResult(store.count(key)));
    return !(count instanceof Error) && count > 0;
  }

  public async put(record: T): Promise<void> {
    const key = this.keyOf(record);
    const result = await this.db.run(this.name, "readwrite", (store) => requestResult(store.put(record)));
    if (result instanceof Error) this.fallback.set(key, record);
    else this.fallback.delete(key);
  }

  public async delete(keys: string | readonly string[]): Promise<void> {
    const list = typeof keys === "string" ? [keys] : keys;
    list.forEach((key) => this.fallback.delete(key));
    if (list.length === 0) return;
    await this.db.run(this.name, "readwrite", (store) => Promise.all(list.map((key) => requestResult(store.delete(key)))));
  }

  public async clear(): Promise<void> {
    this.fallback.clear();
    await this.db.run(this.name, "readwrite", (store) => requestResult(store.clear()));
  }
}
