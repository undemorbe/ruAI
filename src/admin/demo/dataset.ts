/**
 * Демо-данные админки и расчёт отчётов. Самодостаточный модуль (только относительные
 * импорты типов): его используют и мок админки, и server/ в режиме ADMIN_DEMO=1.
 *
 * Отчёты считаются из «сырых» записей так же, как их должен считать сервер из БД:
 * пользователи, платежи, суточная агрегация расходов OpenRouter.
 */
import type {
  AdminSettings,
  AdminUser,
  ApiReport,
  DayPoint,
  FinanceReport,
  ImagesReport,
  Overview,
  PaymentsReport,
  PlanId,
  PlanTier,
  RangeDays,
  UsersPage,
  UsersQuery,
} from '../api/types'

/** Цены и лимиты (копия content/plans — сверяется тестом). */
export const DEMO_PLANS: Record<PlanId, { days: number; requests: number }> = {
  week: { days: 7, requests: 500 },
  month: { days: 30, requests: 1500 },
  quarter: { days: 90, requests: 4500 },
}
export const DEMO_PRICES: Record<PlanTier, Record<PlanId, number>> = {
  text: { week: 388, month: 988, quarter: 1880 },
  media: { week: 788, month: 1988, quarter: 3880 },
}
const PLAN_IDS: PlanId[] = ['week', 'month', 'quarter']
const DAY = 86_400_000

export const defaultAdminSettings = (): AdminSettings => ({
  generationEnabled: true,
  generationLimits: { week: null, month: null, quarter: null },
  budgetsRub: {
    text: { week: 155, month: 395, quarter: 752 },
    media: { week: 315, month: 795, quarter: 1552 },
  },
  usdRub: 95,
})

interface DemoUser {
  id: string
  email: string
  registeredAt: number
}
interface DemoPayment {
  id: string
  userId: string
  at: number
  tier: PlanTier
  planId: PlanId
  amount: number
  status: 'succeeded' | 'failed'
  refunded: boolean
  repeat: boolean
  autoRenew: boolean
}
/** Суточный агрегат расходов пользователя. */
interface DemoUsage {
  userId: string
  day: number
  tier: PlanTier
  requests: number
  tokensIn: number
  tokensOut: number
  textUsd: number
  imageUsd: number
  generations: number
  errors: Record<string, number>
}
interface DemoCancel {
  userId: string
  at: number
}

export interface Dataset {
  now: number
  users: DemoUser[]
  payments: DemoPayment[]
  usage: DemoUsage[]
  cancels: DemoCancel[]
}

/** Детерминированный ГСЧ: одинаковые демо-данные при каждом запуске. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = ['anna', 'dmitry', 'maria', 'igor', 'elena', 'artem', 'olga', 'pavel', 'kate', 'sergey', 'nikita', 'irina', 'max', 'alina', 'roman', 'vera']
const DOMAINS = ['mail.ru', 'yandex.ru', 'gmail.com', 'bk.ru', 'inbox.ru']
const ERROR_CODES = ['upstream', 'timeout', 'moderation', 'too_long']
const COST = { text: { in: 0.03, out: 0.15 }, media: { in: 1.25, out: 10 }, image: 0.04 }

export function buildDataset(now = Date.now(), seed = 42): Dataset {
  const r = rng(seed)
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)]!
  const today = Math.floor(now / DAY) * DAY
  const users: DemoUser[] = []
  const payments: DemoPayment[] = []
  const usage: DemoUsage[] = []
  const cancels: DemoCancel[] = []

  for (let i = 0; i < 260; i++) {
    // новые пользователи приходят чаще ближе к сегодняшнему дню
    const ago = Math.floor(Math.pow(r(), 1.6) * 180)
    const registeredAt = today - ago * DAY + Math.floor(r() * DAY * 0.9)
    const user = { id: `u_${(1000 + i).toString(36)}${Math.floor(r() * 1e6).toString(36)}`, email: `${pick(NAMES)}.${100 + i}@${pick(DOMAINS)}`, registeredAt }
    users.push(user)
    if (r() > 0.58) continue // не купили

    const tier: PlanTier = r() < 0.32 ? 'media' : 'text'
    const heavy = 0.4 + r() * 1.4
    let planId: PlanId = r() < 0.47 ? 'week' : r() < 0.78 ? 'month' : 'quarter'
    let at = registeredAt + Math.floor(r() * 3 * DAY)
    let repeat = false

    while (at <= now) {
      const autoRenew = r() > 0.35
      if (r() < 0.08) {
        payments.push({ id: `p_${payments.length}`, userId: user.id, at, tier, planId, amount: DEMO_PRICES[tier][planId], status: 'failed', refunded: false, repeat, autoRenew })
        at += Math.floor(r() * DAY)
        if (at > now) break
      }
      payments.push({ id: `p_${payments.length}`, userId: user.id, at, tier, planId, amount: DEMO_PRICES[tier][planId], status: 'succeeded', refunded: r() < 0.02, repeat, autoRenew })

      const end = at + DEMO_PLANS[planId].days * DAY
      for (let d = Math.floor(at / DAY) * DAY; d < Math.min(end, now); d += DAY) {
        if (r() < 0.35) continue // неактивный день
        const requests = Math.min(Math.round(r() * 22 * heavy) + 1, planId === 'week' ? 100 : 200)
        const tokensIn = Math.round(requests * (700 + r() * 900))
        const tokensOut = Math.round(requests * (300 + r() * 500))
        const generations = tier === 'media' ? Math.round(requests * (0.08 + r() * 0.15)) : 0
        const errors: Record<string, number> = {}
        if (r() < 0.12) errors[pick(ERROR_CODES)] = 1 + Math.floor(r() * 2)
        const p = COST[tier]
        usage.push({ userId: user.id, day: d, tier, requests, tokensIn, tokensOut, textUsd: (tokensIn * p.in + tokensOut * p.out) / 1e6, imageUsd: generations * COST.image * (0.8 + r() * 0.5), generations, errors })
      }

      if (end > now) break
      if (!autoRenew || r() < 0.4) {
        cancels.push({ userId: user.id, at: end })
        break
      }
      at = end
      repeat = true
      if (r() < 0.15) planId = pick(PLAN_IDS)
    }
  }
  return { now, users, payments, usage, cancels }
}

// ---------- отчёты ----------

const since = (ds: Dataset, days: RangeDays) => ds.now - days * DAY
const round = (n: number, k = 2) => Math.round(n * 10 ** k) / 10 ** k
const ok = (p: DemoPayment) => p.status === 'succeeded'
const net = (p: DemoPayment) => (ok(p) && !p.refunded ? p.amount : 0)

function series(ds: Dataset, days: RangeDays, usdRub: number): DayPoint[] {
  // те же границы окна, что и у итогов отчёта, — сумма точек равна итогу
  const start = since(ds, days)
  const map = new Map<number, DayPoint>()
  for (let d = Math.floor(start / DAY) * DAY; d <= ds.now; d += DAY) map.set(d, { date: new Date(d).toISOString().slice(0, 10), revenueRub: 0, apiRub: 0 })
  for (const p of ds.payments) {
    const pt = p.at >= start ? map.get(Math.floor(p.at / DAY) * DAY) : undefined
    if (pt) pt.revenueRub += net(p)
  }
  for (const u of ds.usage) {
    const pt = u.day >= start ? map.get(u.day) : undefined
    if (pt) pt.apiRub += (u.textUsd + u.imageUsd) * usdRub
  }
  return [...map.values()].map((p) => ({ ...p, apiRub: Math.round(p.apiRub) }))
}

/** Текущая подписка пользователя (последний успешный платёж, период которого ещё идёт). */
function currentSub(ds: Dataset, userId: string) {
  const last = ds.payments.filter((p) => p.userId === userId && ok(p) && !p.refunded).sort((a, b) => b.at - a.at)[0]
  if (!last) return null
  const expiresAt = last.at + DEMO_PLANS[last.planId].days * DAY
  return expiresAt > ds.now ? { ...last, expiresAt } : null
}

/** Подписка (успешный платёж), покрывающая день использования. */
function coverIndex(ds: Dataset) {
  const byUser = new Map<string, DemoPayment[]>()
  for (const p of ds.payments) if (ok(p)) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p])
  return (userId: string, day: number) =>
    byUser.get(userId)?.find((p) => day >= Math.floor(p.at / DAY) * DAY && day < p.at + DEMO_PLANS[p.planId].days * DAY) ?? null
}

export function overview(ds: Dataset, days: RangeDays, s: AdminSettings): Overview {
  const from = since(ds, days)
  const pays = ds.payments.filter((p) => p.at >= from && ok(p))
  const usd = ds.usage.filter((u) => u.day >= from).reduce((n, u) => n + u.textUsd + u.imageUsd, 0)
  return {
    revenueRub: pays.reduce((n, p) => n + net(p), 0),
    registrations: ds.users.filter((u) => u.registeredAt >= from).length,
    newSubscriptions: pays.filter((p) => !p.repeat).length,
    activeSubscriptions: ds.users.filter((u) => currentSub(ds, u.id)).length,
    renewals: pays.filter((p) => p.repeat).length,
    cancellations: ds.cancels.filter((c) => c.at >= from && c.at <= ds.now).length,
    openrouterUsd: round(usd),
    openrouterRub: Math.round(usd * s.usdRub),
    series: series(ds, days, s.usdRub),
  }
}

export function paymentsReport(ds: Dataset, days: RangeDays): PaymentsReport {
  const from = since(ds, days)
  const inRange = ds.payments.filter((p) => p.at >= from)
  const good = inRange.filter(ok)
  const byPlan = (['text', 'media'] as PlanTier[]).flatMap((tier) =>
    PLAN_IDS.map((planId) => {
      const list = good.filter((p) => p.tier === tier && p.planId === planId)
      return { tier, planId, price: DEMO_PRICES[tier][planId], count: list.length, revenueRub: list.reduce((n, p) => n + net(p), 0) }
    }),
  )
  const sum = (l: DemoPayment[]) => ({ count: l.length, revenueRub: l.reduce((n, p) => n + net(p), 0) })
  const failed = inRange.filter((p) => !ok(p))
  const refunds = good.filter((p) => p.refunded)
  const emails = new Map(ds.users.map((u) => [u.id, u.email]))
  const expiring = ds.users
    .map((u) => ({ u, s: currentSub(ds, u.id) }))
    .filter((x) => x.s && x.s.expiresAt - ds.now < 14 * DAY)
    .map(({ u, s }) => ({ userId: u.id, email: emails.get(u.id)!, tier: s!.tier, planId: s!.planId, expiresAt: new Date(s!.expiresAt).toISOString(), autoRenew: s!.autoRenew }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  return {
    byPlan,
    first: sum(good.filter((p) => !p.repeat)),
    repeat: sum(good.filter((p) => p.repeat)),
    succeeded: sum(good),
    failed: { count: failed.length, amountRub: failed.reduce((n, p) => n + p.amount, 0) },
    refunds: { count: refunds.length, amountRub: refunds.reduce((n, p) => n + p.amount, 0) },
    expiring,
  }
}

export function apiReport(ds: Dataset, days: RangeDays, s: AdminSettings): ApiReport {
  const from = since(ds, days)
  const list = ds.usage.filter((u) => u.day >= from)
  const requests = list.reduce((n, u) => n + u.requests, 0)
  const textUsd = list.filter((u) => u.tier === 'text').reduce((n, u) => n + u.textUsd, 0)
  const lunaUsd = list.filter((u) => u.tier === 'media').reduce((n, u) => n + u.textUsd, 0)
  const imageUsd = list.reduce((n, u) => n + u.imageUsd, 0)
  const totalUsd = textUsd + lunaUsd + imageUsd
  const codes = new Map<string, number>()
  for (const u of list) for (const [c, k] of Object.entries(u.errors)) codes.set(c, (codes.get(c) ?? 0) + k)
  const errCount = [...codes.values()].reduce((a, b) => a + b, 0)
  const perUser = new Map<string, { usd: number; requests: number }>()
  for (const u of list) {
    const x = perUser.get(u.userId) ?? { usd: 0, requests: 0 }
    x.usd += u.textUsd + u.imageUsd
    x.requests += u.requests
    perUser.set(u.userId, x)
  }
  const emails = new Map(ds.users.map((u) => [u.id, u.email]))
  return {
    requests,
    tokensIn: list.reduce((n, u) => n + u.tokensIn, 0),
    tokensOut: list.reduce((n, u) => n + u.tokensOut, 0),
    avgCostUsd: requests ? round(totalUsd / requests, 5) : 0,
    totalUsd: round(totalUsd),
    totalRub: Math.round(totalUsd * s.usdRub),
    byModel: [
      { key: 'text', label: 'Текстовый тариф', usd: round(textUsd), requests: list.filter((u) => u.tier === 'text').reduce((n, u) => n + u.requests, 0) },
      { key: 'media', label: 'GPT-5.6 Luna', usd: round(lunaUsd), requests: list.filter((u) => u.tier === 'media').reduce((n, u) => n + u.requests, 0) },
      { key: 'image', label: 'Генерация изображений', usd: round(imageUsd), requests: list.reduce((n, u) => n + u.generations, 0) },
    ],
    errors: {
      count: errCount,
      rate: requests ? round((errCount / requests) * 100, 2) : 0,
      byCode: [...codes].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    },
    topUsers: [...perUser]
      .map(([userId, x]) => ({ userId, email: emails.get(userId) ?? userId, usd: round(x.usd, 3), requests: x.requests }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 10),
  }
}

export function imagesReport(ds: Dataset, days: RangeDays, s: AdminSettings): ImagesReport {
  const from = since(ds, days)
  const list = ds.usage.filter((u) => u.day >= from && u.tier === 'media')
  const generations = list.reduce((n, u) => n + u.generations, 0)
  const spendUsd = list.reduce((n, u) => n + u.imageUsd, 0)
  const cover = coverIndex(ds)
  return {
    generations,
    spendUsd: round(spendUsd),
    spendRub: Math.round(spendUsd * s.usdRub),
    avgCostUsd: generations ? round(spendUsd / generations, 4) : 0,
    activeUsers: new Set(list.filter((u) => u.generations).map((u) => u.userId)).size,
    byPlan: PLAN_IDS.map((planId) => {
      // генерации относим к подписке, которая покрывала день использования
      const own = list.map((u) => ({ u, p: cover(u.userId, u.day) })).filter((x) => x.p?.planId === planId)
      const g = own.reduce((k, x) => k + x.u.generations, 0)
      const n = new Set(own.map((x) => x.p!.id)).size
      return { planId, generations: g, perSubscription: n ? Math.round(g / n) : 0 }
    }),
  }
}

export function usersPage(ds: Dataset, q: UsersQuery, s: AdminSettings): UsersPage {
  const pageSize = 25
  const page = Math.max(1, q.page ?? 1)
  const needle = q.q?.trim().toLowerCase()
  const rows: AdminUser[] = ds.users
    .filter((u) => !needle || u.email.includes(needle) || u.id.includes(needle))
    .map((u) => {
      const sub = currentSub(ds, u.id)
      const own = ds.usage.filter((x) => x.userId === u.id)
      const inSub = sub ? own.filter((x) => x.day >= Math.floor(sub.at / DAY) * DAY) : []
      const used = inSub.reduce((n, x) => n + x.requests, 0)
      const subUsd = inSub.reduce((n, x) => n + x.textUsd + x.imageUsd, 0)
      const lastDay = own.reduce((m, x) => Math.max(m, x.day), 0)
      return {
        id: u.id,
        email: u.email,
        registeredAt: new Date(u.registeredAt).toISOString(),
        tier: sub?.tier ?? null,
        planId: sub?.planId ?? null,
        expiresAt: sub ? new Date(sub.expiresAt).toISOString() : null,
        requestsUsed: used,
        requestsLeft: sub ? Math.max(0, DEMO_PLANS[sub.planId].requests - used) : 0,
        generations: inSub.reduce((n, x) => n + x.generations, 0),
        paidTotalRub: ds.payments.filter((p) => p.userId === u.id).reduce((n, p) => n + net(p), 0),
        spendUsd: round(own.reduce((n, x) => n + x.textUsd + x.imageUsd, 0), 3),
        budgetLeftRub: sub ? Math.round(s.budgetsRub[sub.tier][sub.planId] - subUsd * s.usdRub) : null,
        lastActiveAt: lastDay ? new Date(lastDay).toISOString() : null,
      }
    })
  const key: Record<NonNullable<UsersQuery['sort']>, (u: AdminUser) => number> = {
    spend: (u) => u.spendUsd,
    paid: (u) => u.paidTotalRub,
    registered: (u) => Date.parse(u.registeredAt),
    active: (u) => (u.lastActiveAt ? Date.parse(u.lastActiveAt) : 0),
  }
  rows.sort((a, b) => key[q.sort ?? 'registered'](b) - key[q.sort ?? 'registered'](a))
  return { total: rows.length, page, pageSize, items: rows.slice((page - 1) * pageSize, page * pageSize) }
}

export function financeReport(ds: Dataset, days: RangeDays, s: AdminSettings): FinanceReport {
  const from = since(ds, days)
  const good = ds.payments.filter((p) => p.at >= from && ok(p))
  const revenueRub = good.reduce((n, p) => n + net(p), 0)
  const refundsRub = good.filter((p) => p.refunded).reduce((n, p) => n + p.amount, 0)
  const usage = ds.usage.filter((u) => u.day >= from)
  const apiRub = Math.round(usage.reduce((n, u) => n + u.textUsd + u.imageUsd, 0) * s.usdRub)
  const payers = new Set(good.filter((p) => !p.refunded).map((p) => p.userId))
  const grossRub = revenueRub - apiRub
  // расход относим к подписке, покрывавшей день использования
  const cover = coverIndex(ds)
  const tagged = usage.map((u) => ({ u, p: cover(u.userId, u.day) }))
  const byPlan = (['text', 'media'] as PlanTier[]).flatMap((tier) =>
    PLAN_IDS.map((planId) => {
      const rev = good.filter((p) => p.tier === tier && p.planId === planId).reduce((n, p) => n + net(p), 0)
      const api = Math.round(
        tagged.filter((x) => x.p?.tier === tier && x.p.planId === planId).reduce((n, x) => n + x.u.textUsd + x.u.imageUsd, 0) * s.usdRub,
      )
      return { tier, planId, revenueRub: rev, apiRub: api, marginPct: rev ? round(((rev - api) / rev) * 100, 1) : 0 }
    }),
  )
  return {
    revenueRub,
    refundsRub,
    apiRub,
    grossRub,
    marginPct: revenueRub ? round((grossRub / revenueRub) * 100, 1) : 0,
    avgCheckRub: good.length ? Math.round(revenueRub / good.length) : 0,
    arpuRub: payers.size ? Math.round(revenueRub / payers.size) : 0,
    payingUsers: payers.size,
    byPlan,
    series: series(ds, days, s.usdRub),
  }
}
