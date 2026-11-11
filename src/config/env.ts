/** Typed, validated access to build-time environment. */
const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export const env = {
  apiUrl,
  /** Mocks are on when explicitly requested or when no backend URL is configured. */
  useMocks: import.meta.env.VITE_USE_MOCKS === 'true' || !apiUrl,
  base: import.meta.env.BASE_URL,
  isDev: import.meta.env.DEV,
} as const
