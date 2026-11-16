/**
 * Скользящее окно: не больше `limit` событий за `windowMs` на ключ.
 * Первое превышение — 'warn' (одно предупреждение), дальше — 'drop' до освобождения окна.
 * Отброшенные события в окно не засчитываются, иначе блок продлевался бы бесконечно.
 */

export type Verdict = 'ok' | 'warn' | 'drop'

interface Bucket {
  hits: number[]
  warned: boolean
}

export class RateLimiter {
  private readonly limit: number
  private readonly windowMs: number
  private readonly buckets = new Map<string, Bucket>()
  private calls = 0

  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  hit(key: string, now: number): Verdict {
    if (++this.calls % 1000 === 0) this.sweep(now)
    let b = this.buckets.get(key)
    if (!b) {
      b = { hits: [], warned: false }
      this.buckets.set(key, b)
    }
    const from = now - this.windowMs
    while (b.hits.length && (b.hits[0] ?? 0) <= from) b.hits.shift()
    if (b.hits.length < this.limit) {
      b.hits.push(now)
      b.warned = false
      return 'ok'
    }
    if (b.warned) return 'drop'
    b.warned = true
    return 'warn'
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  /** Убрать ключи, у которых окно опустело, — чтобы память не росла от разовых пользователей. */
  sweep(now: number): void {
    const from = now - this.windowMs
    for (const [key, b] of this.buckets) {
      if (!b.hits.length || (b.hits[b.hits.length - 1] ?? 0) <= from) this.buckets.delete(key)
    }
  }

  get size(): number {
    return this.buckets.size
  }
}
