type CacheKey = string

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TTLCache<T> {
  private readonly entries = new Map<CacheKey, CacheEntry<T>>()
  private readonly defaultTtlMs: number

  constructor(defaultTtlMs: number) {
    if (defaultTtlMs <= 0 || Number.isNaN(defaultTtlMs)) {
      throw new Error('TTL must be a positive number')
    }
    this.defaultTtlMs = defaultTtlMs
  }

  get(key: CacheKey): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: CacheKey, value: T, ttlMs?: number): void {
    const ttl = ttlMs && ttlMs > 0 ? ttlMs : this.defaultTtlMs
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttl
    })
  }

  delete(key: CacheKey): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}
