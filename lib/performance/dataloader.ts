// DataLoader pattern for batch loading and caching

type Loader<K, V> = (keys: K[]) => Promise<Map<K, V>>;

export class DataLoader<K, V> {
  private loader: Loader<K, V>;
  private cache: Map<K, V>;
  private pending: Map<K, Promise<V>>;
  private batch: Set<K> | null = null;
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchDelay: number;

  constructor(loader: Loader<K, V>, batchDelay: number = 10) {
    this.loader = loader;
    this.cache = new Map();
    this.pending = new Map();
    this.batchDelay = batchDelay;
  }

  async load(key: K): Promise<V> {
    // Check cache
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Check if already pending
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    // Create promise
    const promise = this.scheduleLoad(key);
    this.pending.set(key, promise);

    return promise;
  }

  private async scheduleLoad(key: K): Promise<V> {
    // Add to batch
    if (!this.batch) {
      this.batch = new Set();
    }
    this.batch.add(key);

    // Schedule batch load
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.executeBatch();
      }, this.batchDelay);
    }

    // Wait for batch to execute
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.cache.has(key)) {
          clearInterval(checkInterval);
          resolve(this.cache.get(key)!);
        } else if (!this.pending.has(key)) {
          clearInterval(checkInterval);
          reject(new Error('Load failed'));
        }
      }, 10);
    });
  }

  private async executeBatch(): Promise<void> {
    if (!this.batch || this.batch.size === 0) {
      this.batch = null;
      this.batchTimeout = null;
      return;
    }

    const keys = Array.from(this.batch);
    this.batch = null;
    this.batchTimeout = null;

    try {
      const results = await this.loader(keys);

      // Cache results
      for (const [key, value] of results.entries()) {
        this.cache.set(key, value);
        this.pending.delete(key);
      }

      // Clear pending for keys that weren't found
      for (const key of keys) {
        if (!results.has(key)) {
          this.pending.delete(key);
        }
      }
    } catch (error) {
      // Clear pending on error
      for (const key of keys) {
        this.pending.delete(key);
      }
      throw error;
    }
  }

  clear(key: K): void {
    this.cache.delete(key);
  }

  clearAll(): void {
    this.cache.clear();
    this.pending.clear();
  }

  prime(key: K, value: V): void {
    this.cache.set(key, value);
  }
}
