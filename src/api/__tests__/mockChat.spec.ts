import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../http'
import type { ChatStreamEvent, LimitCode, PlanId, PlanTier, SendMessagePayload } from '../types'
import { K, mockBilling, mockChat, newSubscription } from '../mocks'

const USER_KEY = 'ruai.mock.user'

function subscribe(planId: PlanId = 'week', patch: Partial<ReturnType<typeof newSubscription>['usage']> = {}, tier: PlanTier = 'text') {
  const sub = newSubscription(planId, tier)
  Object.assign(sub.usage, patch)
  localStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1', email: 'a@b.ru', name: 'a', isGuest: false, subscription: sub }))
}

async function collect(content: string, signal?: AbortSignal, extra: Partial<SendMessagePayload> = {}) {
  const events: ChatStreamEvent[] = []
  for await (const e of mockChat.send({ chatId: null, content, ...extra }, signal)) events.push(e)
  return events
}

async function refusal(content = 'Привет', extra: Partial<SendMessagePayload> = {}): Promise<LimitCode | undefined> {
  try {
    await collect(content, undefined, extra)
  } catch (e) {
    return (e as ApiError).code as LimitCode
  }
  return undefined
}

describe('mock chat stream', () => {
  beforeEach(() => localStorage.clear())

  it('streams chat → deltas → done, persists the dialog and counts the request', async () => {
    subscribe()
    const events = await collect('Привет')

    expect(events[0]!.type).toBe('chat')
    const done = events.at(-1)!
    expect(done.type).toBe('done')
    expect(events.filter((e) => e.type === 'delta').length).toBeGreaterThan(1)

    const chatId = events[0]!.type === 'chat' ? events[0]!.chat.id : ''
    const saved = await mockChat.messages(chatId)
    expect(saved.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(done.type === 'done' && done.message.content).toBe(saved[1]!.content)
    expect(done.type === 'done' && done.usage).toMatchObject({ totalUsed: 1, dailyUsed: 1, totalLimit: 500, dailyLimit: 100 })
    const ledger = JSON.parse(localStorage.getItem(K.ledger)!)
    expect(ledger.spentTextUsd).toBeGreaterThan(0)
    expect(ledger.spentImageUsd).toBe(0)
  }, 20000)

  it('ends without done when aborted', async () => {
    subscribe()
    const ac = new AbortController()
    const events: ChatStreamEvent[] = []
    try {
      for await (const e of mockChat.send({ chatId: null, content: 'Длинный ответ' }, ac.signal)) {
        events.push(e)
        if (e.type === 'delta') ac.abort()
      }
    } catch {
      // an AbortError is also an acceptable way to end
    }
    expect(events.filter((e) => e.type === 'delta').length).toBeLessThanOrEqual(2)
    expect(events.some((e) => e.type === 'done')).toBe(false)
  }, 20000)

  it('does not charge a request that produced nothing', async () => {
    subscribe()
    const ac = new AbortController()
    ac.abort()
    try {
      await collect('Привет', ac.signal)
    } catch {
      // aborted before the first token
    }
    expect(JSON.parse(localStorage.getItem(USER_KEY)!).subscription.usage.totalUsed).toBe(0)
  }, 20000)

  it('marks a cut-off answer as truncated', async () => {
    subscribe()
    const done = (await collect('Расскажи подробно')).at(-1)!
    expect(done.type === 'done' && done.message.truncated).toBe(true)
  }, 20000)
})

describe('mock limits', () => {
  beforeEach(() => localStorage.clear())

  it('refuses without a subscription', async () => {
    expect(await refusal()).toBe('no_subscription')
  })

  it('refuses after the subscription expired, but keeps history readable', async () => {
    subscribe()
    const events = await collect('Привет')
    const chatId = events[0]!.type === 'chat' ? events[0]!.chat.id : ''
    const user = JSON.parse(localStorage.getItem(USER_KEY)!)
    user.subscription.expiresAt = new Date(Date.now() - 1000).toISOString()
    localStorage.setItem(USER_KEY, JSON.stringify(user))

    expect(await refusal()).toBe('no_subscription')
    expect(await mockChat.messages(chatId)).toHaveLength(2)
  }, 20000)

  it('refuses at the daily and total limits', async () => {
    subscribe('week', { dailyUsed: 100 })
    expect(await refusal()).toBe('daily_limit')
    subscribe('week', { totalUsed: 500 })
    expect(await refusal()).toBe('total_limit')
  })

  it('allows one request at a time', async () => {
    subscribe()
    const first = mockChat.send({ chatId: null, content: 'Привет' })[Symbol.asyncIterator]()
    await first.next() // запрос принят и выполняется
    expect(await refusal()).toBe('busy')
    while (!(await first.next()).done);
  }, 20000)

  it('rate-limits the sixth request in a minute', async () => {
    subscribe()
    localStorage.setItem('ruai.mock.rate', JSON.stringify(Array.from({ length: 5 }, () => Date.now() - 1000)))
    expect(await refusal()).toBe('rate_limit')
  })

  it('payment opens a new period with the total counter reset', async () => {
    subscribe('week', { totalUsed: 500, dailyUsed: 40 })
    await mockBilling.checkout({ planId: 'month', tier: 'media', email: 'a@b.ru', method: 'card' })
    const sub = JSON.parse(localStorage.getItem(USER_KEY)!).subscription
    expect(sub.planId).toBe('month')
    expect(sub.tier).toBe('media')
    expect(sub.usage).toMatchObject({ totalUsed: 0, totalLimit: 1500, dailyLimit: 200, dailyUsed: 40, generationsUsed: 0 })
  })

  it('images and generation require the media tier', async () => {
    subscribe()
    expect(await refusal('Нарисуй кота', { mode: 'image' })).toBe('media_required')
    expect(await refusal('Что на фото?', { images: ['up_1'] })).toBe('media_required')
  })

  it('refuses when the subscription budget is spent', async () => {
    subscribe()
    localStorage.setItem(K.ledger, JSON.stringify({ tier: 'text', planId: 'week', budgetRub: 10, spentTextUsd: 1, spentImageUsd: 0, tokensIn: 0, tokensOut: 0, generations: 0, errors: 0 }))
    expect(await refusal()).toBe('budget')
  })
})

describe('mock image generation', () => {
  beforeEach(() => localStorage.clear())

  it('generates an image, counts it separately and keeps it in history', async () => {
    subscribe('week', {}, 'media')
    const events = await collect('Нарисуй кота в космосе', undefined, { mode: 'image' })
    expect(events.some((e) => e.type === 'image')).toBe(true)
    const done = events.at(-1)!
    expect(done.type === 'done' && done.usage).toMatchObject({ totalUsed: 1, generationsUsed: 1 })

    const chatId = events[0]!.type === 'chat' ? events[0]!.chat.id : ''
    const saved = await mockChat.messages(chatId)
    expect(saved[1]!.images?.[0]?.source).toBe('generated')
    const ledger = JSON.parse(localStorage.getItem(K.ledger)!)
    expect(ledger.generations).toBe(1)
    expect(ledger.spentImageUsd).toBeGreaterThan(0)
  }, 20000)

  it('respects the admin switch and the generation limit', async () => {
    subscribe('week', {}, 'media')
    localStorage.setItem(K.settings, JSON.stringify({ generationEnabled: false }))
    expect(await refusal('Нарисуй', { mode: 'image' })).toBe('generation_disabled')

    localStorage.setItem(K.settings, JSON.stringify({ generationEnabled: true, generationLimits: { week: 1, month: null, quarter: null } }))
    subscribe('week', { generationsUsed: 1 }, 'media')
    expect(await refusal('Нарисуй', { mode: 'image' })).toBe('generation_limit')
    // обычный текст при исчерпанных генерациях работает
    expect(await refusal('Привет')).toBeUndefined()
  }, 20000)
})
