import { describe, expect, it } from 'vitest'
import { analyticsReport, userDetail } from '../demo/analytics'
import { apiReport, buildDataset, defaultAdminSettings, overview, usersPage } from '../demo/dataset'
import { lastDays } from '../range'

const NOW = Date.UTC(2026, 10, 14, 12)
const ds = buildDataset(NOW)
const s = defaultAdminSettings()

describe('аналитика', () => {
  it('дни сходятся с главной, воронка не расширяется', () => {
    for (const n of [7, 30, 180]) {
      const r = lastDays(n, NOW)
      const a = analyticsReport(ds, r, s)
      const o = overview(ds, r, s)
      expect(a.days.length).toBe(n)
      expect(a.days.reduce((k, d) => k + d.revenueRub, 0)).toBe(o.revenueRub)
      expect(a.days.reduce((k, d) => k + d.registrations, 0)).toBe(o.registrations)
      expect(a.days.reduce((k, d) => k + d.requests, 0)).toBe(o.requests)
      expect(a.activity.activeUsers).toBe(o.activeUsers)
      const f = a.funnel
      expect(f.registered).toBeGreaterThanOrEqual(f.active)
      expect(f.registered).toBeGreaterThanOrEqual(f.paid)
      expect(f.paid).toBeGreaterThanOrEqual(f.repeat)
      expect(a.activity.peakDau).toBeGreaterThanOrEqual(a.activity.avgDau)
    }
  })

  it('когорты: недели для коротких периодов, месяцы для длинных; будущее пусто', () => {
    const w = analyticsReport(ds, lastDays(60, NOW), s).cohorts
    expect(w.unit).toBe('week')
    expect(w.rows.length).toBeLessThanOrEqual(12)
    const last = w.rows.at(-1)!
    expect(last.retention[0]).not.toBeNull()
    expect(last.retention.at(-1)).toBeNull()
    for (const row of w.rows) for (const v of row.retention) if (v !== null) expect(v).toBeLessThanOrEqual(100)
    expect(analyticsReport(ds, lastDays(365, NOW), s).cohorts.unit).toBe('month')
  })

  it('дни недели: 7 значений, понедельник первый', () => {
    const wd = analyticsReport(ds, lastDays(28, NOW), s).weekday
    expect(wd.map((x) => x.day)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('карточка совпадает со строкой списка', () => {
    const row = usersPage(ds, { sort: 'paid' }, s).items[0]!
    const d = userDetail(ds, row.id, s)!
    expect(d.user).toEqual(row)
    expect(d.payments.every((p) => p.userId === row.id)).toBe(true)
    expect(d.days.length).toBe(60)
    // дни подряд, без пропусков: график показывает и дни без запросов
    for (let i = 1; i < d.days.length; i++) expect(Date.parse(d.days[i]!.date) - Date.parse(d.days[i - 1]!.date)).toBe(86_400_000)
    expect(d.days.at(-1)!.date).toBe(new Date(NOW).toISOString().slice(0, 10))
    if (d.sub) expect(d.sub.totalUsed).toBe(row.requestsUsed)
    expect(userDetail(ds, 'u_nope', s)).toBeNull()
  })
})

describe('доля ошибок API', () => {
  it('считается от всех попыток и не превышает 100 %', () => {
    const now = Date.UTC(2026, 10, 14, 12)
    const day = Math.floor(now / 86_400_000) * 86_400_000
    const one = { ...buildDataset(now), usage: [{ userId: 'u1', day, tier: 'text' as const, requests: 1, tokensIn: 0, tokensOut: 0, textUsd: 0, imageUsd: 0, generations: 0, errors: { upstream: 3 } }] }
    const a = apiReport(one, lastDays(7, now), s)
    expect(a.errors.count).toBe(3)
    expect(a.errors.rate).toBe(75)
  })
})
