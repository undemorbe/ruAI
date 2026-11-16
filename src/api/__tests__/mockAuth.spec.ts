import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGAL_VERSION } from '@/content/legal/operator'
import type { ApiError } from '../http'
import { MOCK_CODE, MOCK_TG_DELAY, mockAuth, mockBilling } from '../mocks'

const consent = { version: LEGAL_VERSION, terms: true as const, personalData: true as const }

async function code(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    return (e as ApiError).code
  }
  return 'ok'
}

describe('mock auth', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('регистрация: согласия, правила логина и пароля, занятый логин', async () => {
    expect(await code(() => mockAuth.register('boris', 'correct horse', { ...consent, version: '2000-01-01' }))).toBe('consent')
    expect(await code(() => mockAuth.register('bo', 'correct horse', consent))).toBe('bad_login')
    expect(await code(() => mockAuth.register('boris', 'short', consent))).toBe('weak_password')
    const s = await mockAuth.register(' Boris ', 'correct horse', consent)
    expect(s.user).toMatchObject({ login: 'boris', isGuest: false, telegram: false, tgEnabled: true, email: null })
    expect(await code(() => mockAuth.register('BORIS', 'correct horse', consent))).toBe('login_taken')
    expect(localStorage.getItem('ruai.mock.accounts')).not.toContain('correct horse')
  })

  it('вход: неверный пароль и чужой логин неотличимы, верный пароль даёт сессию', async () => {
    await mockAuth.register('boris', 'correct horse', consent)
    await mockAuth.logout()
    const e1 = await mockAuth.login('boris', 'nope nope').catch((e) => e)
    const e2 = await mockAuth.login('nobody', 'nope nope').catch((e) => e)
    expect([e1.code, e1.message]).toEqual([e2.code, e2.message])
    expect(e1.code).toBe('bad_credentials')
    const ok = await mockAuth.login('Boris', 'correct horse')
    expect('user' in ok && ok.user.login).toBe('boris')
  })

  it('Telegram: привязка через бота, потом вход с подтверждением; код из демо работает сразу', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mockAuth.register('boris', 'correct horse', consent)
    expect((await mockAuth.linkTelegram()).url).toMatch(/^https:\/\/t\.me\//)
    await vi.advanceTimersByTimeAsync(MOCK_TG_DELAY + 100)
    expect((await mockAuth.me()).telegram).toBe(true)
    await mockAuth.logout()
    const r = await mockAuth.login('boris', 'correct horse')
    expect('challenge' in r).toBe(true)
    if (!('challenge' in r)) return
    expect(await mockAuth.challenge(r.challenge)).toEqual({ status: 'pending' })
    expect(await code(() => mockAuth.challenge(r.challenge, '123456'))).toBe('bad_code')
    const s = await mockAuth.challenge(r.challenge, MOCK_CODE)
    expect('user' in s && s.user.telegram).toBe(true)
    expect(await code(() => mockAuth.challenge(r.challenge))).toBe('challenge_gone')
    // «бот» подтверждает и сам
    await mockAuth.logout()
    const r2 = await mockAuth.login('boris', 'correct horse')
    await vi.advanceTimersByTimeAsync(MOCK_TG_DELAY + 100)
    const s2 = 'challenge' in r2 ? await mockAuth.challenge(r2.challenge) : null
    expect(s2 && 'user' in s2).toBe(true)
  })

  it('отвязка выкидывает из аккаунта; смена пароля требует текущий', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mockAuth.register('boris', 'correct horse', consent)
    expect(await code(() => mockAuth.unlinkTelegram())).toBe('no_tg')
    expect(await code(() => mockAuth.changePassword('wrong one', 'new password 1'))).toBe('bad_credentials')
    await mockAuth.changePassword('correct horse', 'new password 1')
    await mockAuth.linkTelegram()
    await vi.advanceTimersByTimeAsync(MOCK_TG_DELAY + 100)
    await mockAuth.unlinkTelegram()
    await vi.advanceTimersByTimeAsync(MOCK_TG_DELAY + 100)
    expect((await mockAuth.me()).isGuest).toBe(true)
    const r = await mockAuth.login('boris', 'new password 1')
    expect('user' in r && r.user.telegram).toBe(false)
  })

  it('пользователь из старого мока без логина входит заново', async () => {
    localStorage.setItem('ruai.mock.user', JSON.stringify({ id: 'u1', email: 'a@b.ru', name: 'a', isGuest: false, subscription: null }))
    expect((await mockAuth.me()).isGuest).toBe(true)
  })

  it('сброс пароля по ссылке из «бота»', async () => {
    await mockAuth.register('boris', 'correct horse', consent)
    await mockAuth.requestReset('boris')
    expect(await code(() => mockAuth.confirmReset('mock-nobody', 'brand new pass'))).toBe('reset_gone')
    await mockAuth.confirmReset('mock-boris', 'brand new pass')
    expect((await mockAuth.me()).isGuest).toBe(true)
    expect(await code(() => mockAuth.login('boris', 'brand new pass'))).toBe('ok')
  })
})

describe('mock checkout', () => {
  beforeEach(() => localStorage.clear())
  const base = { planId: 'week' as const, tier: 'text' as const, method: 'card' as const, email: 'a@b.ru' }
  const ok = { version: LEGAL_VERSION, terms: true as const, recurring: true as const }

  it('guest cannot pay: 401 auth_required, no account is created', async () => {
    await expect(mockBilling.checkout({ ...base, consent: ok })).rejects.toMatchObject({ code: 'auth_required', status: 401 })
    expect(JSON.parse(localStorage.getItem('ruai.mock.user') ?? 'null')?.isGuest ?? true).toBe(true)
    expect(localStorage.getItem('ruai.mock.accounts')).toBeNull()
  })

  it('signed-in user needs terms and recurring; pays for their own account', async () => {
    const { user } = await mockAuth.register('boris', 'correct horse', consent)
    // @ts-expect-error: без согласия на автопродление нельзя
    expect(await code(() => mockBilling.checkout({ ...base, consent: { version: LEGAL_VERSION, terms: true } }))).toBe('consent_required')
    expect(await code(() => mockBilling.checkout({ ...base, consent: { ...ok, version: 'old' } }))).toBe('consent_required')
    expect(await code(() => mockBilling.checkout({ ...base, email: 'nope', consent: ok }))).toBe('bad_email')
    expect(await code(() => mockBilling.checkout({ ...base, email: ' A@B.ru ', consent: ok }))).toBe('ok')
    const after = JSON.parse(localStorage.getItem('ruai.mock.user')!)
    expect(after).toMatchObject({ id: user.id, login: 'boris', email: 'a@b.ru', isGuest: false })
    expect((await mockAuth.me()).email).toBe('a@b.ru')
    expect(after.subscription.planId).toBe('week')
  })
})
