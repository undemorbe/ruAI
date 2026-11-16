import { describe, expect, it } from 'vitest'
import { analyticsReport } from '../demo/analytics'
import { apiReport, buildDataset, DELETED, financeReport, imagesReport, overview, paymentsReport, defaultAdminSettings, type Dataset } from '../demo/dataset'
import { ERROR_LABEL } from '../format'
import { lastDays } from '../range'

describe('подписи кодов ошибок', () => {
  // полноту относительно кодов сервера сверяет server/src/reports.test.ts
  it('демо-данные используют только коды с подписью', () => {
    const ds = buildDataset(Date.parse('2026-11-16T09:00:00Z'))
    const used = new Set(ds.usage.flatMap((u) => Object.keys(u.errors)))
    expect(used.size).toBeGreaterThan(0)
    for (const c of used) expect(ERROR_LABEL[c], c).toBeTruthy()
  })
})

describe('отчёты: выдачи из панели и удалённые пользователи', () => {
  const NOW = Date.parse('2026-11-16T09:00:00Z')
  const DAY = 86_400_000
  const s = defaultAdminSettings()
  const r = lastDays(30, NOW)
  const day = Math.floor((NOW - 2 * DAY) / DAY) * DAY
  const ds: Dataset = {
    now: NOW,
    users: [{ id: 'u_live', login: 'live', email: null, telegram: false, registeredAt: NOW - 10 * DAY }],
    payments: [
      { id: 'p1', userId: DELETED, at: NOW - 3 * DAY, tier: 'text', planId: 'week', amount: 388, status: 'succeeded', refunded: false, repeat: false, autoRenew: false },
      { id: 'p2', userId: DELETED, at: NOW - 3 * DAY, tier: 'text', planId: 'month', amount: 988, status: 'succeeded', refunded: false, repeat: false, autoRenew: false },
      { id: 'g1', userId: 'u_live', at: NOW - 2 * DAY, tier: 'media', planId: 'week', amount: 0, status: 'succeeded', refunded: false, repeat: false, autoRenew: false, provider: 'admin' },
    ],
    usage: [
      { userId: DELETED, day, tier: 'text', requests: 5, tokensIn: 1, tokensOut: 1, textUsd: 1, imageUsd: 0, generations: 0, errors: {} },
      { userId: 'u_live', day, tier: 'media', requests: 2, tokensIn: 1, tokensOut: 1, textUsd: 0.5, imageUsd: 0.2, generations: 1, errors: {} },
      { userId: DELETED, day, tier: 'media', requests: 1, tokensIn: 1, tokensOut: 1, textUsd: 0, imageUsd: 0.1, generations: 1, errors: {} },
    ],
    cancels: [],
    subs: [{ id: 's1', userId: 'u_live', tier: 'media', planId: 'week', startAt: NOW - 2 * DAY, expiresAt: NOW + 5 * DAY, autoRenew: false, source: 'admin' }],
  }

  it('выдача не продажа; удалённые в суммах, но не в числе людей', () => {
    const o = overview(ds, r, s)
    expect(o.revenueRub).toBe(388 + 988)
    expect(o.requests).toBe(8)
    expect(o.activeUsers).toBe(1)
    expect(o.newSubscriptions).toBe(2)

    const p = paymentsReport(ds, r)
    expect(p.succeeded.count).toBe(2)
    expect(p.byPlan.find((x) => x.tier === 'media')!.count).toBe(0)
    expect(p.recent.map((x) => x.id)).toContain('g1')

    expect(apiReport(ds, r, s).topUsers.map((u) => u.userId)).toEqual(['u_live'])
    expect(imagesReport(ds, r, s).activeUsers).toBe(1)
    const f = financeReport(ds, r, s)
    expect(f.payingUsers).toBe(0)
    expect(f.revenueRub).toBe(388 + 988)

    const a = analyticsReport(ds, r, s)
    expect(a.activity.activeUsers).toBe(1)
    expect(a.payback.payingUsers).toBe(0)
    expect(a.days.find((d) => d.requests)!.activeUsers).toBe(1)
  })

  it('последняя активность: точное время захода важнее дня запроса', async () => {
    const { usersPage } = await import('../demo/dataset')
    const seen = day + 7 * 3_600_000
    const withSeen = { ...ds, users: [{ ...ds.users[0]!, lastActiveAt: seen }] }
    expect(usersPage(withSeen, {}, s).items[0]!.lastActiveAt).toBe(new Date(seen).toISOString())
    expect(usersPage(ds, {}, s).items[0]!.lastActiveAt).toBe(new Date(day).toISOString())
  })
})
