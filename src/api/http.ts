import { env } from '@/config/env'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type TokenProvider = () => string | null
let getToken: TokenProvider = () => null

/** Auth store registers how to read the current access token. */
export function setTokenProvider(fn: TokenProvider) {
  getToken = fn
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  timeoutMs?: number
}

function buildInit(opts: RequestOptions): RequestInit {
  const headers = new Headers(opts.headers)
  headers.set('Accept', 'application/json')
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return {
    ...opts,
    headers,
    credentials: 'include',
    body:
      opts.body === undefined
        ? undefined
        : opts.body instanceof FormData
          ? opts.body
          : JSON.stringify(opts.body),
  }
}

async function raw(path: string, opts: RequestOptions = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000)
  opts.signal?.addEventListener('abort', () => controller.abort())

  try {
    const res = await fetch(`${env.apiUrl}${path}`, { ...buildInit(opts), signal: controller.signal })
    if (!res.ok) {
      let message = res.statusText
      let code: string | undefined
      try {
        const data = await res.json()
        message = data.message ?? message
        code = data.code
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(message, res.status, code)
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

export const http = {
  raw,
  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return (await raw(path, { ...opts, method: 'GET' })).json()
  },
  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return (await raw(path, { ...opts, method: 'POST', body })).json()
  },
  async patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return (await raw(path, { ...opts, method: 'PATCH', body })).json()
  },
  async del(path: string, opts?: RequestOptions): Promise<void> {
    await raw(path, { ...opts, method: 'DELETE' })
  },
}

/** Parses a `text/event-stream` body into JSON events. */
export async function* readSSE<T>(res: Response): AsyncGenerator<T> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (data && data !== '[DONE]') yield JSON.parse(data) as T
    }
  }
}
