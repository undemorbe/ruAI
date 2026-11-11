import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatStreamEvent } from '../types'
import { mockChat } from '../mocks'

describe('mock chat stream', () => {
  beforeEach(() => localStorage.clear())

  it('streams chat → deltas → done and persists the dialog', async () => {
    const events: ChatStreamEvent[] = []
    for await (const e of mockChat.send({ chatId: null, content: 'Привет', model: 'ruai-lite' })) events.push(e)

    expect(events[0]!.type).toBe('chat')
    expect(events.at(-1)!.type).toBe('done')
    const deltas = events.filter((e) => e.type === 'delta')
    expect(deltas.length).toBeGreaterThan(1)

    const chatId = events[0]!.type === 'chat' ? events[0]!.chat.id : ''
    const saved = await mockChat.messages(chatId)
    expect(saved.map((m) => m.role)).toEqual(['user', 'assistant'])
    const done = events.at(-1)!
    expect(done.type === 'done' && done.message.content).toBe(saved[1]!.content)
    expect((await mockChat.list()).map((c) => c.id)).toContain(chatId)
  }, 20000)

  it('ends without done when aborted', async () => {
    const ac = new AbortController()
    const events: ChatStreamEvent[] = []
    try {
      for await (const e of mockChat.send({ chatId: null, content: 'Длинный ответ', model: 'ruai-lite' }, ac.signal)) {
        events.push(e)
        if (e.type === 'delta') ac.abort()
      }
    } catch {
      // an AbortError is also an acceptable way to end
    }
    expect(events.filter((e) => e.type === 'delta').length).toBeLessThanOrEqual(2)
    expect(events.some((e) => e.type === 'done')).toBe(false)
  }, 20000)
})
