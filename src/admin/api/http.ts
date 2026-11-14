import type { AdminService } from './contract'

/** Ошибка API админки (сообщение уже на русском). */
export class AdminError extends Error {
  readonly status: number
  readonly retryAfter?: number
  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.name = 'AdminError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

/** API живёт рядом со сборкой админки: `/<ADMIN_PATH>/api/`. */
const BASE = `${import.meta.env.BASE_URL}api/`

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      // CSRF: сервер принимает изменяющие запросы только с этим заголовком и своим Origin
      'X-Requested-With': 'ruai-admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new AdminError(data.message ?? 'Ошибка сервера', res.status, Number(res.headers.get('Retry-After')) || undefined)
  }
  return data as T
}

const get = <T>(p: string) => call<T>(p)
const send = <T>(p: string, method: string, body?: unknown) => call<T>(p, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const httpAdmin: AdminService = {
  async session() {
    try {
      return await get('session')
    } catch (e) {
      if (e instanceof AdminError && e.status === 401) return null
      throw e
    }
  },
  login: (input) => send('login', 'POST', input),
  logout: () => send('logout', 'POST'),
  overview: (d) => get(`reports/overview?days=${d}`),
  payments: (d) => get(`reports/payments?days=${d}`),
  api: (d) => get(`reports/api?days=${d}`),
  images: (d) => get(`reports/images?days=${d}`),
  users: (q) => get(`users?${new URLSearchParams({ q: q.q ?? '', sort: q.sort ?? 'registered', page: String(q.page ?? 1) })}`),
  finance: (d) => get(`reports/finance?days=${d}`),
  settings: () => get('settings'),
  saveSettings: (s) => send('settings', 'PUT', s),
  audit: () => get('audit'),
}
