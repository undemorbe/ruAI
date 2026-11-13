import { beforeEach, describe, expect, it } from 'vitest'
import { MODEL } from '@/config/app'
import { ApiError } from '../http'
import type { ChatStreamEvent, LimitCode, PlanId } from '../types'
import { mockBilling, mockChat, newSubscription } from '../mocks'

const USER_KEY = 'ruai.mock.user'

function subscribe(planId: PlanId = 'week', patch: Partial<ReturnType<typeof newSubscription>['usage']> = {}) {
  const sub = newSubscription(planId)
  Object.assign(sub.usage, patch)
  localStorage.setItem(USER_KEY, JSON.stringify({ id: 'u1', email: 'a@b.ru', name: 'a', isGuest: false, subscription: sub }))
}

async function collect(content: string, signal?: AbortSignal) {
  const events: ChatStreamEvent[] = []
  for await (const e of mockChat.send({ chatId: null, content, model: MODEL.id }, signal)) events.push(e)
  return events
}

async function refusal(content = 'Привет'): Promise<LimitCode | undefined> {
  try {
    await collect(content)
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
  }, 20000)

  it('ends without done when aborted', async () => {
    subscribe()
    const ac = new AbortController()
    const events: ChatStreamEvent[] = []
    try {
      for await (const e of mockChat.send({ chatId: null, content: 'Длинный ответ', model: MODEL.id }, ac.signal)) {
        events.push(e)
        if (e.type === 'delta') ac.abort()
      }
    } catch {
      // an AbortError is also an acceptable way to end
    }
    expect(events.filter((e) => e.type === 'delta').length).toBeLessThanOrEqual(2)
    expect(events.some((e) => e.type === 'done')).toBe(false)
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
    const first = mockChat.send({ chatId: null, content: 'Привет', model: MODEL.id })[Symbol.asyncIterator]()
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
    await mockBilling.checkout({ planId: 'month', email: 'a@b.ru', method: 'card' })
    const sub = JSON.parse(localStorage.getItem(USER_KEY)!).subscription
    expect(sub.planId).toBe('month')
    expect(sub.usage).toMatchObject({ totalUsed: 0, totalLimit: 1500, dailyLimit: 200, dailyUsed: 40 })
  })
})
