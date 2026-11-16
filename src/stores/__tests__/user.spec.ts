import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { me, login, challenge, register } = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), challenge: vi.fn(), register: vi.fn() }))
vi.mock('@/api', async (orig) => {
  const real = await orig<typeof import('@/api')>()
  return { ...real, api: { ...real.api, auth: { ...real.api.auth, me, login, challenge, register } } }
})

const U = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: false, tgEnabled: true, subscription: null }

const { useUserStore } = await import('../user')

describe('user store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const f of [me, login, challenge, register]) f.mockReset()
  })

  it('до первой загрузки гость и «ещё не знаем» различимы: ready', async () => {
    me.mockResolvedValue(U)
    const user = useUserStore()
    expect(user.ready).toBe(false)
    await user.ensure()
    expect(user.ready).toBe(true)
    expect(user.isGuest).toBe(false)
  })

  it('ensure запрашивает профиль один раз, даже при параллельных вызовах', async () => {
    me.mockResolvedValue({ ...U, id: 'guest', login: null, name: 'Гость', isGuest: true })
    const user = useUserStore()
    await Promise.all([user.ensure(), user.ensure()])
    await user.ensure()
    expect(me).toHaveBeenCalledTimes(1)
    expect(user.isGuest).toBe(true)
  })

  it('ошибка сети: ready, пользователь считается гостем', async () => {
    me.mockRejectedValue(new Error('offline'))
    const user = useUserStore()
    await user.ensure()
    expect(user.ready).toBe(true)
    expect(user.isGuest).toBe(true)
  })

  it('вход без 2FA: пользователь сразу, токен сервера не хранится', async () => {
    login.mockResolvedValue({ user: U, token: '' })
    const user = useUserStore()
    expect(await user.login('boris', 'pw')).toEqual({ done: true })
    expect(user.displayName).toBe('boris')
    expect(user.token).toBeNull()
    expect(user.showUnprotected).toBe(true)
  })

  it('вход с 2FA: сначала заявка, пользователь только после finishChallenge', async () => {
    const ch = { challenge: 'c'.repeat(22), expiresAt: '2026-11-16T09:05:00Z', sent: true }
    login.mockResolvedValue(ch)
    const user = useUserStore()
    expect(await user.login('boris', 'pw')).toEqual({ done: false, ...ch })
    expect(user.user).toBeNull()
    challenge.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ user: { ...U, telegram: true }, token: '' })
    expect(await user.finishChallenge(ch.challenge)).toBe(false)
    expect(await user.finishChallenge(ch.challenge, '123456')).toBe(true)
    expect(challenge).toHaveBeenLastCalledWith(ch.challenge, '123456')
    expect(user.isProtected).toBe(true)
    expect(user.showUnprotected).toBe(false)
  })

  it('плашка не показывается гостю и при выключенном боте', async () => {
    const user = useUserStore()
    register.mockResolvedValue({ user: { ...U, tgEnabled: false }, token: 'mock-token' })
    await user.register('boris', 'correct horse', { version: 'v', terms: true, personalData: true })
    expect(user.showUnprotected).toBe(false)
    expect(user.token).toBe('mock-token')
    user.user = { ...U, isGuest: true }
    expect(user.showUnprotected).toBe(false)
  })
})
