import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/api/mocks'
import { getPlans, PRICES } from '@/content/plans'
import { apiReport, buildDataset, defaultAdminSettings, DEMO_PLANS, DEMO_PRICES, financeReport, imagesReport, overview, paymentsReport, usersPage } from '../demo/dataset'

const NOW = Date.UTC(2026, 10, 14, 12)
const ds = buildDataset(NOW)
const s = defaultAdminSettings()

describe('демо-данные админки', () => {
  it('цены и лимиты совпадают с витриной', () => {
    expect(DEMO_PRICES).toEqual(PRICES)
    for (const p of getPlans('text')) expect(DEMO_PLANS[p.id].requests).toBe(p.requestsTotal)
    // мок чата и админка стартуют с одинаковыми бюджетами и лимитами
    expect(defaultSettings()).toEqual(defaultAdminSettings())
  })

  it('детерминированы', () => {
    expect(buildDataset(NOW).payments.length).toBe(ds.payments.length)
    expect(overview(buildDataset(NOW), 30, s)).toEqual(overview(ds, 30, s))
  })

  it('отчёты согласованы между собой', () => {
    for (const d of [7, 30, 90, 365] as const) {
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

  it('API: расход по статьям складывается в итог, генерации — только у тарифа с фото', () => {
    const a = apiReport(ds, 90, s)
    const sum = a.byModel.reduce((n, m) => n + m.usd, 0)
    expect(Math.abs(sum - a.totalUsd)).toBeLessThan(0.02)
    const img = imagesReport(ds, 90, s)
    expect(a.byModel.find((m) => m.key === 'image')!.requests).toBe(img.generations)
    expect(Math.abs(img.spendUsd - a.byModel.find((m) => m.key === 'image')!.usd)).toBeLessThan(0.02)
    expect(a.topUsers.length).toBeLessThanOrEqual(10)
  })

  it('пользователи: поиск, сортировка, страницы', () => {
    const all = usersPage(ds, { sort: 'spend' }, s)
    expect(all.total).toBe(ds.users.length)
    expect(all.items.length).toBe(25)
    expect(all.items[0]!.spendUsd).toBeGreaterThanOrEqual(all.items[1]!.spendUsd)
    const one = usersPage(ds, { q: all.items[0]!.email }, s)
    expect(one.items[0]!.id).toBe(all.items[0]!.id)
    const last = usersPage(ds, { page: Math.ceil(all.total / 25) }, s)
    expect(last.items.length).toBeGreaterThan(0)
    for (const u of all.items) if (!u.tier) expect(u.budgetLeftRub).toBeNull()
  })
})
