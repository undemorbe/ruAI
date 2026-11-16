import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, http } from '../http'
import { httpAuth } from '../services/http'

afterEach(() => vi.unstubAllGlobals())

function stub(res: Response) {
  const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => res)
  vi.stubGlobal('fetch', f)
  return f
}

describe('http client', () => {
  it('шлёт CSRF-заголовок и cookie только своему origin', async () => {
    const f = stub(new Response('{"ok":true}', { status: 200 }))
    await http.post('/auth/login', { login: 'boris', password: 'x' })
    const init = f.mock.calls[0]![1]
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('ruai')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(init.credentials).toBe('same-origin')
  })

  it('пустой ответ и 204 не ломают разбор', async () => {
    stub(new Response(null, { status: 204 }))
    await expect(http.post('/auth/logout')).resolves.toBeUndefined()
    stub(new Response('', { status: 200 }))
    await expect(http.patch('/chats/x', { title: 'a' })).resolves.toBeUndefined()
  })

  it('ошибка сервера → ApiError с кодом и retryAfter', async () => {
    stub(new Response(JSON.stringify({ message: 'Подождите', code: 'rate_limit', retryAfter: 42 }), { status: 429 }))
    const e = await http.get('/chats').catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 429, code: 'rate_limit', retryAfter: 42, message: 'Подождите' })
  })

  it('auth: логин и пароль POST JSON; challenge без кода не шлёт code; привязка без тела', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response('{"status":"pending"}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    await httpAuth.login('boris', 'pw')
    await httpAuth.challenge('x'.repeat(22))
    await httpAuth.challenge('x'.repeat(22), '123456')
    expect(f.mock.calls.map((c) => [c[0].replace(/^.*\/api/, ''), c[1].body])).toEqual([
      ['/auth/login', JSON.stringify({ login: 'boris', password: 'pw' })],
      ['/auth/challenge', JSON.stringify({ id: 'x'.repeat(22) })],
      ['/auth/challenge', JSON.stringify({ id: 'x'.repeat(22), code: '123456' })],
    ])
    const g = stub(new Response('{"url":"https://t.me/b?start=t"}', { status: 200 }))
    await httpAuth.linkTelegram()
    const init = g.mock.calls[0]![1]
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).get('Content-Type')).toBeNull()
  })
})
