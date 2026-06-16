type EntryState = 'pending' | 'committed';

export type NonceKey = string;

export type NonceEntry<T> = {
  state: EntryState;
  createdAtMs: number;
  expiresAtMs: number;
  value?: T; // set when committed
};

export class LruTtlMap<T> {
  private map = new Map<NonceKey, NonceEntry<T>>();
  private maxEntries: number;
  private ttlMs: number;

  constructor(options: { maxEntries: number; ttlMs: number }) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
  }

  size(): number {
    this.gc();
    return this.map.size;
  }

  private gc(): void {
    const now = Date.now();
    // Remove expired
    for (const [k, v] of this.map) {
      if (v.expiresAtMs <= now) {
        this.map.delete(k);
      } else {
        // Map is in insertion order; can't break due to non-monotonic inserts, keep scanning lightly
      }
    }
    // Enforce max
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.map.delete(oldestKey);
    }
  }

  get(key: NonceKey): NonceEntry<T> | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU bump
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  setPending(key: NonceKey): NonceEntry<T> {
    const now = Date.now();
    const entry: NonceEntry<T> = {
      state: 'pending',
      createdAtMs: now,
      expiresAtMs: now + this.ttlMs,
    };
    this.map.delete(key);
    this.map.set(key, entry);
    this.gc();
    return entry;
  }

  commit(key: NonceKey, value: T): NonceEntry<T> {
    const now = Date.now();
    const entry: NonceEntry<T> = {
      state: 'committed',
      createdAtMs: now,
      expiresAtMs: now + this.ttlMs,
      value,
    };
    this.map.delete(key);
    this.map.set(key, entry);
    this.gc();
    return entry;
  }
}

