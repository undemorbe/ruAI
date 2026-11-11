/** localStorage wrapper that never throws (private mode, blocked storage, SSR). */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore quota / access errors */
    }
  },
  remove(key: string) {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}
