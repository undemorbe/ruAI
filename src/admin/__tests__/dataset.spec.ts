import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/api/mocks'
import { getPlans, PRICES } from '@/content/plans'
import { lastDays, prevRange } from '../range'
import { apiReport, buildDataset, defaultAdminSettings, DEMO_PLANS, DEMO_PRICES, financeReport, imagesReport, overview, paymentsReport, usersPage } from '../demo/dataset'

const NOW = Date.UTC(2026, 10, 14, 12)
const ds = buildDataset(NOW)
const s = defaultAdminSettings()
const R = (n: number) => lastDays(n, NOW)

describe('демо-данные админки', () => {
  it('цены и лимиты совпадают с витриной', () => {
    expect(DEMO_PRICES).toEqual(PRICES)
    for (const p of getPlans('text')) expect(DEMO_PLANS[p.id].requests).toBe(p.requestsTotal)
    // мок чата и админка стартуют с одинаковыми бюджетами и лимитами
    expect(defaultSettings()).toEqual(defaultAdminSettings())
  })

  it('детерминированы', () => {
    expect(buildDataset(NOW).payments.length).toBe(ds.payments.length)
    expect(overview(buildDataset(NOW), R(30), s)).toEqual(overview(ds, R(30), s))
  })

  it('отчёты согласованы между собой', () => {
    for (const d of [7, 30, 90, 365].map(R)) {
      const o = overview(ds, d, s)
      const f = financeReport(ds, d, s)
      const p = paymentsReport(ds, d)
      expect(f.revenueRub).toBe(o.revenueRub)
      expect(p.succeeded.revenueRub).toBe(o.revenueRub)
      expect(p.first.count + p.repeat.count).toBe(p.succeeded.count)
      expect(p.byPlan.reduce((n, x) => n + x.revenueRub, 0)).toBe(o.revenueRub)
      expect(f.grossRub).toBe(f.revenueRub - f.apiRub)
      expect(o.series.reduce((n, x) => n + x.revenueRub, 0)).toBe(o.revenueRub)
      // расход по тарифам не больше общего (дни без подписки не относятся ни к одному тарифу)
      expect(f.byPlan.reduce((n, x) => n + x.apiRub, 0)).toBeLessThanOrEqual(f.apiRub + f.byPlan.length)
    }
  })

  it('API: расход по статьям складывается в итог, генерации - только у тарифа с фото', () => {
    const a = apiReport(ds, R(90), s)
    const sum = a.byModel.reduce((n, m) => n + m.usd, 0)
    expect(Math.abs(sum - a.totalUsd)).toBeLessThan(0.02)
    const img = imagesReport(ds, R(90), s)
    expect(a.byModel.find((m) => m.key === 'image')!.requests).toBe(img.generations)
    expect(Math.abs(img.spendUsd - a.byModel.find((m) => m.key === 'image')!.usd)).toBeLessThan(0.02)
    expect(a.topUsers.length).toBeLessThanOrEqual(10)
  })

  it('пользователи: поиск, сортировка, страницы', () => {
    const all = usersPage(ds, { sort: 'spend' }, s)
    expect(all.total).toBe(ds.users.length)
    expect(all.items.length).toBe(25)
    expect(all.items[0]!.spendUsd).toBeGreaterThanOrEqual(all.items[1]!.spendUsd)
    const one = usersPage(ds, { q: all.items[0]!.login }, s)
    expect(one.items[0]!.id).toBe(all.items[0]!.id)
    const last = usersPage(ds, { page: Math.ceil(all.total / 25) }, s)
    expect(last.items.length).toBeGreaterThan(0)
    for (const u of all.items) if (!u.tier) expect(u.budgetLeftRub).toBeNull()
  })

  it('пользователи: логин у всех, email только у плативших, фильтр «без Telegram»', () => {
    const all = usersPage(ds, { page: 1 }, s)
    const noTg = usersPage(ds, { filter: 'no_tg' }, s)
    expect(noTg.total).toBeGreaterThan(0)
    expect(noTg.items.every((u) => !u.telegram)).toBe(true)
    const share = ds.users.filter((u) => u.telegram).length / ds.users.length
    expect(share).toBeGreaterThan(0.2)
    expect(share).toBeLessThan(0.8)
    expect(ds.users.every((u) => /^[a-z0-9._-]{3,32}$/.test(u.login))).toBe(true)
    const payers = new Set(ds.payments.map((p) => p.userId))
    for (const u of ds.users) expect(u.email !== null).toBe(payers.has(u.id))
    expect(all.total).toBe(ds.users.length)
    const byEmail = ds.users.find((u) => u.email)!
    expect(usersPage(ds, { q: byEmail.email! }, s).items.map((u) => u.id)).toContain(byEmail.id)
  })

  it('фильтры пользователей делят список без пересечений', () => {
    const n = (filter: 'active' | 'none') => usersPage(ds, { filter }, s).total
    expect(n('active') + n('none')).toBe(ds.users.length)
    const exp = usersPage(ds, { filter: 'expiring' }, s)
    for (const u of exp.items) expect(Date.parse(u.expiresAt!) - NOW).toBeLessThan(7 * 86_400_000)
  })

  it('сравнение: compare равен отчёту за предыдущий период', () => {
    const r = R(30)
    const o = overview(ds, r, s)
    const prev = overview(ds, prevRange(r), s)
    for (const k of Object.keys(o.compare) as (keyof typeof o.compare)[]) expect(o.compare[k], k).toEqual(prev[k])
    expect(financeReport(ds, r, s).compare.revenueRub).toBe(prev.revenueRub)
  })

  it('произвольный диапазон: точки по дням складываются в итог, будущее не считается', () => {
    const r = { from: '2026-09-03', to: '2026-10-17' }
    const o = overview(ds, r, s)
    expect(o.series.length).toBe(45)
    expect(o.series.reduce((n, x) => n + x.revenueRub, 0)).toBe(o.revenueRub)
    const future = overview(ds, { from: '2026-11-14', to: '2026-11-15' }, s)
    expect(future.series.length).toBe(1)
  })
})
