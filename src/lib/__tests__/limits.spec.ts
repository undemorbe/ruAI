import { describe, expect, it } from 'vitest'
import { buildContext, freshUsage, mskDayKey, nextMskMidnight, rateWait, remaining } from '../limits'

describe('limits', () => {
  it('daily reset is midnight Moscow time (UTC+3)', () => {
    // 20:59 UTC = 23:59 МСК → сброс через минуту
    expect(nextMskMidnight(new Date('2026-11-13T20:59:00Z')).toISOString()).toBe('2026-11-13T21:00:00.000Z')
    // 21:00 UTC = 00:00 МСК следующего дня → следующий сброс через сутки
    expect(nextMskMidnight(new Date('2026-11-13T21:00:00Z')).toISOString()).toBe('2026-11-14T21:00:00.000Z')
    expect(mskDayKey(new Date('2026-11-13T21:30:00Z'))).toBe('2026-11-14')
  })

  it('freshUsage zeroes the daily counter after the reset moment only', () => {
    const u = { totalLimit: 500, totalUsed: 120, dailyLimit: 100, dailyUsed: 100, dailyResetAt: '2026-11-13T21:00:00.000Z' }
    expect(freshUsage(u, new Date('2026-11-13T20:00:00Z'))).toBe(u)
    const next = freshUsage(u, new Date('2026-11-13T21:00:01Z'))
    expect(next.dailyUsed).toBe(0)
    expect(next.totalUsed).toBe(120)
    expect(next.dailyResetAt).toBe('2026-11-14T21:00:00.000Z')
  })

  it('remaining is the smaller of daily and total', () => {
    expect(remaining({ totalLimit: 500, totalUsed: 470, dailyLimit: 100, dailyUsed: 10, dailyResetAt: '' })).toBe(30)
    expect(remaining({ totalLimit: 500, totalUsed: 0, dailyLimit: 100, dailyUsed: 100, dailyResetAt: '' })).toBe(0)
  })

  it('context keeps the last 20 messages and drops the oldest over 16k tokens', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ content: `m${i}` }))
    const ctx = buildContext(msgs)
    expect(ctx).toHaveLength(20)
    expect(ctx[0]!.content).toBe('m10')

    const big = 'я'.repeat(3 * 6000) // ≈ 6000 токенов
    const heavy = [{ content: big }, { content: big }, { content: big }, { content: 'вопрос' }]
    const trimmed = buildContext(heavy)
    expect(trimmed).toHaveLength(3)
    expect(trimmed.at(-1)!.content).toBe('вопрос')
  })

  it('rate limit: 5 per minute, 50 per hour', () => {
    const now = 10_000_000
    expect(rateWait([now - 1000, now - 2000, now - 3000, now - 4000], now)).toBe(0)
    expect(rateWait([now - 10_000, now - 2000, now - 3000, now - 4000, now - 5000], now)).toBe(50)
    const hour = Array.from({ length: 50 }, (_, i) => now - 3_000_000 + i * 60_000)
    expect(rateWait(hour, now)).toBe(600)
  })
})
