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
  DateRange,
  DayPoint,
  FinanceReport,
  FinanceTotals,
  ImagesReport,
  Overview,
  OverviewTotals,
  PaymentRow,
  PaymentsReport,
  PlanId,
  PlanTier,
  UsersPage,
  UsersQuery,
} from '../api/types'
import { bounds, prevRange } from '../range'

/** Цены и лимиты (копия content/plans - сверяется тестом). */
export const DEMO_PLANS: Record<PlanId, { days: number; requests: number; perDay: number }> = {
  week: { days: 7, requests: 500, perDay: 100 },
  month: { days: 30, requests: 1500, perDay: 200 },
  quarter: { days: 90, requests: 4500, perDay: 200 },
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

export interface DemoUser {
  id: string
  login: string
  /** Email для чеков: только у тех, кто платил. */
  email: string | null
  /** Подключён Telegram-бот входа. */
  telegram: boolean
  registeredAt: number
  blocked?: boolean
  /** Заметка администратора. */
  note?: string
  /** Открытые сессии. */
  sessions?: number
}
export interface DemoPayment {
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
  /** 'admin' - выдано из панели (0 ₽). */
  provider?: string
}
/** Суточный агрегат расходов пользователя. */
export interface DemoUsage {
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
export interface DemoCancel {
  userId: string
  at: number
}

export interface Dataset {
  now: number
  users: DemoUser[]
  payments: DemoPayment[]
  usage: DemoUsage[]
  cancels: DemoCancel[]
  /** Периоды подписок (с переносом дней и выдачей из админки). */
  subs: SubSpan[]
}

export interface SubSpan {
  id: string
  userId: string
  tier: PlanTier
  planId: PlanId
  startAt: number
  expiresAt: number
  autoRenew: boolean
  source?: 'payment' | 'admin'
  /** Счётчики периода (в базе - живые, в демо - из расходов). */
  totalLimit?: number
  totalUsed?: number
  dailyLimit?: number
  dailyUsed?: number
  genUsed?: number
  budgetRub?: number
  spentUsd?: number
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
  const subs: SubSpan[] = []
  const budgets = defaultAdminSettings().budgetsRub

  for (let i = 0; i < 260; i++) {
    // новые пользователи приходят чаще ближе к сегодняшнему дню
    const ago = Math.floor(Math.pow(r(), 1.6) * 180)
    const registeredAt = today - ago * DAY + Math.floor(r() * DAY * 0.9)
    const id = `u_${(1000 + i).toString(36)}${Math.floor(r() * 1e6).toString(36)}`
    const login = `${pick(NAMES)}.${100 + i}`
    // домен выбирается всегда: так последовательность случайных чисел (и остальные демо-данные) не меняется
    const domain = pick(DOMAINS)
    const user: DemoUser = {
      id,
      login,
      email: null,
      // без вызова r(): около 45% с Telegram, детерминированно по номеру
      telegram: (i * 37) % 100 < 45,
      registeredAt,
      sessions: Math.floor(r() * 3),
    }
    users.push(user)
    if (r() > 0.58) continue // не купили
    user.email = `${login}@${domain}`

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
      const refunded = r() < 0.02
      payments.push({ id: `p_${payments.length}`, userId: user.id, at, tier, planId, amount: DEMO_PRICES[tier][planId], status: 'succeeded', refunded, repeat, autoRenew })

      const end = at + DEMO_PLANS[planId].days * DAY
      const sub: SubSpan = {
        id: `s_${subs.length}`,
        userId: user.id,
        tier,
        planId,
        startAt: at,
        expiresAt: end,
        autoRenew,
        source: 'payment',
        totalLimit: DEMO_PLANS[planId].requests,
        totalUsed: 0,
        dailyLimit: DEMO_PLANS[planId].perDay,
        dailyUsed: 0,
        genUsed: 0,
        budgetRub: budgets[tier][planId],
        spentUsd: 0,
      }
      // возврат закрывает подписку
      if (!refunded) subs.push(sub)
      for (let d = Math.floor(at / DAY) * DAY; d < Math.min(end, now); d += DAY) {
        if (r() < 0.35) continue // неактивный день
        const requests = Math.min(Math.round(r() * 22 * heavy) + 1, planId === 'week' ? 100 : 200)
        const tokensIn = Math.round(requests * (700 + r() * 900))
        const tokensOut = Math.round(requests * (300 + r() * 500))
        const generations = tier === 'media' ? Math.round(requests * (0.08 + r() * 0.15)) : 0
        const errors: Record<string, number> = {}
        if (r() < 0.12) errors[pick(ERROR_CODES)] = 1 + Math.floor(r() * 2)
        const p = COST[tier]
        const u: DemoUsage = { userId: user.id, day: d, tier, requests, tokensIn, tokensOut, textUsd: (tokensIn * p.in + tokensOut * p.out) / 1e6, imageUsd: generations * COST.image * (0.8 + r() * 0.5), generations, errors }
        usage.push(u)
        sub.totalUsed! += requests
        sub.genUsed! += generations
        sub.spentUsd! += u.textUsd + u.imageUsd
        if (d === today) sub.dailyUsed = requests
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
  // email для чеков появляется только с первым платежом
  const payers = new Set(payments.map((p) => p.userId))
  for (const u of users) if (!payers.has(u.id)) u.email = null
  return { now, users, payments, usage, cancels, subs }
}

// ---------- отчёты ----------

const round = (n: number, k = 2) => Math.round(n * 10 ** k) / 10 ** k
export const ok = (p: DemoPayment) => p.status === 'succeeded'
export const net = (p: DemoPayment) => (ok(p) && !p.refunded ? p.amount : 0)

/** Окно отчёта [start, end): конец не позже текущего момента. */
export function windowOf(ds: Dataset, r: DateRange) {
  const b = bounds(r)
  return { start: b.start, end: Math.min(b.end, ds.now + 1) }
}

/** Дни окна (начала суток), не дальше сегодняшнего. */
export function daysOf(ds: Dataset, r: DateRange): number[] {
  const { start, end } = windowOf(ds, r)
  const out: number[] = []
  for (let d = Math.floor(start / DAY) * DAY; d < end; d += DAY) out.push(d)
  return out
}

function series(ds: Dataset, r: DateRange, usdRub: number): DayPoint[] {
  // те же границы окна, что и у итогов отчёта, - сумма точек равна итогу
  const { start, end } = windowOf(ds, r)
  const map = new Map<number, DayPoint>()
  for (const d of daysOf(ds, r)) map.set(d, { date: new Date(d).toISOString().slice(0, 10), revenueRub: 0, apiRub: 0 })
  for (const p of ds.payments) {
    const pt = p.at >= start && p.at < end ? map.get(Math.floor(p.at / DAY) * DAY) : undefined
    if (pt) pt.revenueRub += net(p)
  }
  for (const u of ds.usage) {
    const pt = u.day >= start && u.day < end ? map.get(u.day) : undefined
    if (pt) pt.apiRub += (u.textUsd + u.imageUsd) * usdRub
  }
  return [...map.values()].map((p) => ({ ...p, apiRub: Math.round(p.apiRub) }))
}

/** Подписка пользователя, действующая в момент at (по умолчанию - сейчас). */
export function currentSub(ds: Dataset, userId: string, at = ds.now) {
  const s = ds.subs.filter((x) => x.userId === userId && x.startAt <= at && x.expiresAt > at).sort((a, b) => b.startAt - a.startAt)[0]
  return s ?? null
}

/** Подписка, покрывающая день использования. */
function coverIndex(ds: Dataset): (userId: string, day: number) => SubSpan | null {
  const spans = new Map<string, SubSpan[]>()
  for (const x of ds.subs) spans.set(x.userId, [...(spans.get(x.userId) ?? []), x])
  return (userId, day) => spans.get(userId)?.find((x) => day >= Math.floor(x.startAt / DAY) * DAY && day < x.expiresAt) ?? null
}

export const loginsOf = (ds: Dataset) => new Map(ds.users.map((u) => [u.id, u.login]))

function overviewTotals(ds: Dataset, r: DateRange, s: AdminSettings): OverviewTotals {
  const { start, end } = windowOf(ds, r)
  const pays = ds.payments.filter((p) => p.at >= start && p.at < end && ok(p))
  const use = ds.usage.filter((u) => u.day >= start && u.day < end)
  const usd = use.reduce((n, u) => n + u.textUsd + u.imageUsd, 0)
  const at = Math.max(start, end - 1)
  const active = new Set(ds.subs.filter((x) => x.startAt <= at && x.expiresAt > at).map((x) => x.userId))
  return {
    revenueRub: pays.reduce((n, p) => n + net(p), 0),
    registrations: ds.users.filter((u) => u.registeredAt >= start && u.registeredAt < end).length,
    newSubscriptions: pays.filter((p) => !p.repeat && p.provider !== 'admin').length,
    activeSubscriptions: active.size,
    renewals: pays.filter((p) => p.repeat).length,
    cancellations: ds.cancels.filter((c) => c.at >= start && c.at < end).length,
    openrouterUsd: round(usd),
    openrouterRub: Math.round(usd * s.usdRub),
    activeUsers: new Set(use.filter((u) => u.requests).map((u) => u.userId)).size,
    requests: use.reduce((n, u) => n + u.requests, 0),
  }
}

export function overview(ds: Dataset, r: DateRange, s: AdminSettings): Overview {
  return { ...overviewTotals(ds, r, s), series: series(ds, r, s.usdRub), compare: overviewTotals(ds, prevRange(r), s) }
}

const paymentRow = (p: DemoPayment, logins: Map<string, string>): PaymentRow => ({
  id: p.id,
  userId: p.userId,
  login: logins.get(p.userId) ?? 'удалён',
  at: new Date(p.at).toISOString(),
  tier: p.tier,
  planId: p.planId,
  amount: p.amount,
  status: p.status,
  refunded: p.refunded,
  repeat: p.repeat,
})

export function paymentsReport(ds: Dataset, r: DateRange): PaymentsReport {
  const { start, end } = windowOf(ds, r)
  const inRange = ds.payments.filter((p) => p.at >= start && p.at < end)
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
  const logins = loginsOf(ds)
  const expiring = ds.users
    .map((u) => ({ u, s: currentSub(ds, u.id) }))
    .filter((x) => x.s && x.s.expiresAt - ds.now < 14 * DAY)
    .map(({ u, s }) => ({ userId: u.id, login: u.login, tier: s!.tier, planId: s!.planId, expiresAt: new Date(s!.expiresAt).toISOString(), autoRenew: s!.autoRenew }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  return {
    byPlan,
    first: sum(good.filter((p) => !p.repeat)),
    repeat: sum(good.filter((p) => p.repeat)),
    succeeded: sum(good),
    failed: { count: failed.length, amountRub: failed.reduce((n, p) => n + p.amount, 0) },
    refunds: { count: refunds.length, amountRub: refunds.reduce((n, p) => n + p.amount, 0) },
    recent: [...inRange].sort((a, b) => b.at - a.at).slice(0, 50).map((p) => paymentRow(p, logins)),
    expiring,
  }
}

export { paymentRow }

export function apiReport(ds: Dataset, r: DateRange, s: AdminSettings): ApiReport {
  const { start, end } = windowOf(ds, r)
  const list = ds.usage.filter((u) => u.day >= start && u.day < end)
  const requests = list.reduce((n, u) => n + u.requests, 0)
  const textUsd = list.filter((u) => u.tier === 'text').reduce((n, u) => n + u.textUsd, 0)
  const mediaUsd = list.filter((u) => u.tier === 'media').reduce((n, u) => n + u.textUsd, 0)
  const imageUsd = list.reduce((n, u) => n + u.imageUsd, 0)
  const totalUsd = textUsd + mediaUsd + imageUsd
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
  const logins = loginsOf(ds)
  return {
    requests,
    tokensIn: list.reduce((n, u) => n + u.tokensIn, 0),
    tokensOut: list.reduce((n, u) => n + u.tokensOut, 0),
    avgCostUsd: requests ? round(totalUsd / requests, 5) : 0,
    totalUsd: round(totalUsd),
    totalRub: Math.round(totalUsd * s.usdRub),
    byModel: [
      { key: 'text', label: 'Текстовый тариф', usd: round(textUsd), requests: list.filter((u) => u.tier === 'text').reduce((n, u) => n + u.requests, 0) },
      { key: 'media', label: 'Тариф с фото (GPT-5.6 Luna)', usd: round(mediaUsd), requests: list.filter((u) => u.tier === 'media').reduce((n, u) => n + u.requests, 0) },
      { key: 'image', label: 'Генерация изображений', usd: round(imageUsd), requests: list.reduce((n, u) => n + u.generations, 0) },
    ],
    errors: {
      count: errCount,
      rate: requests ? round((errCount / requests) * 100, 2) : 0,
      byCode: [...codes].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    },
    topUsers: [...perUser]
      .map(([userId, x]) => ({ userId, login: logins.get(userId) ?? userId, usd: round(x.usd, 3), requests: x.requests }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 10),
  }
}

export function imagesReport(ds: Dataset, r: DateRange, s: AdminSettings): ImagesReport {
  const { start, end } = windowOf(ds, r)
  const list = ds.usage.filter((u) => u.day >= start && u.day < end && u.tier === 'media')
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

/** Строка таблицы пользователей (её же показывает карточка). */
export function userRow(ds: Dataset, u: DemoUser, s: AdminSettings, own = ds.usage.filter((x) => x.userId === u.id)): AdminUser {
  const sub = currentSub(ds, u.id)
  const inSub = sub ? own.filter((x) => x.day >= Math.floor(sub.startAt / DAY) * DAY) : []
  const used = sub?.totalUsed ?? inSub.reduce((n, x) => n + x.requests, 0)
  const subUsd = sub?.spentUsd ?? inSub.reduce((n, x) => n + x.textUsd + x.imageUsd, 0)
  const limit = sub?.totalLimit ?? (sub ? DEMO_PLANS[sub.planId].requests : 0)
  const budget = sub?.budgetRub ?? (sub ? s.budgetsRub[sub.tier][sub.planId] : 0)
  const lastDay = own.reduce((m, x) => Math.max(m, x.day), 0)
  return {
    id: u.id,
    login: u.login,
    email: u.email,
    telegram: u.telegram,
    registeredAt: new Date(u.registeredAt).toISOString(),
    tier: sub?.tier ?? null,
    planId: sub?.planId ?? null,
    expiresAt: sub ? new Date(sub.expiresAt).toISOString() : null,
    requestsUsed: sub ? used : 0,
    requestsLeft: sub ? Math.max(0, limit - used) : 0,
    generations: sub?.genUsed ?? inSub.reduce((n, x) => n + x.generations, 0),
    paidTotalRub: ds.payments.filter((p) => p.userId === u.id).reduce((n, p) => n + net(p), 0),
    spendUsd: round(own.reduce((n, x) => n + x.textUsd + x.imageUsd, 0), 3),
    budgetLeftRub: sub ? Math.round(budget - subUsd * s.usdRub) : null,
    lastActiveAt: lastDay ? new Date(lastDay).toISOString() : null,
    ...(u.blocked ? { blocked: true } : {}),
  }
}

export function usersPage(ds: Dataset, q: UsersQuery, s: AdminSettings): UsersPage {
  const pageSize = 25
  const page = Math.max(1, q.page ?? 1)
  const needle = q.q?.trim().toLowerCase()
  const byUser = new Map<string, DemoUsage[]>()
  for (const x of ds.usage) byUser.set(x.userId, [...(byUser.get(x.userId) ?? []), x])
  const keep: Record<NonNullable<UsersQuery['filter']>, (u: AdminUser) => boolean> = {
    all: () => true,
    active: (u) => !!u.tier,
    none: (u) => !u.tier,
    expiring: (u) => !!u.expiresAt && Date.parse(u.expiresAt) - ds.now < 7 * DAY,
    blocked: (u) => !!u.blocked,
    no_tg: (u) => !u.telegram,
  }
  const rows: AdminUser[] = ds.users
    .filter((u) => !needle || u.login.includes(needle) || (u.email ?? '').includes(needle) || u.id.toLowerCase().includes(needle))
    .map((u) => userRow(ds, u, s, byUser.get(u.id) ?? []))
    .filter(keep[q.filter ?? 'all'])
  const key: Record<NonNullable<UsersQuery['sort']>, (u: AdminUser) => number> = {
    spend: (u) => u.spendUsd,
    paid: (u) => u.paidTotalRub,
    registered: (u) => Date.parse(u.registeredAt),
    active: (u) => (u.lastActiveAt ? Date.parse(u.lastActiveAt) : 0),
  }
  rows.sort((a, b) => key[q.sort ?? 'registered'](b) - key[q.sort ?? 'registered'](a))
  return { total: rows.length, page, pageSize, items: rows.slice((page - 1) * pageSize, page * pageSize) }
}

function financeTotals(ds: Dataset, r: DateRange, s: AdminSettings): FinanceTotals {
  const { start, end } = windowOf(ds, r)
  const good = ds.payments.filter((p) => p.at >= start && p.at < end && ok(p))
  const revenueRub = good.reduce((n, p) => n + net(p), 0)
  const refundsRub = good.filter((p) => p.refunded).reduce((n, p) => n + p.amount, 0)
  const apiRub = Math.round(ds.usage.filter((u) => u.day >= start && u.day < end).reduce((n, u) => n + u.textUsd + u.imageUsd, 0) * s.usdRub)
  const paid = good.filter((p) => !p.refunded && p.amount > 0)
  const payers = new Set(paid.map((p) => p.userId))
  const grossRub = revenueRub - apiRub
  return {
    revenueRub,
    refundsRub,
    apiRub,
    grossRub,
    marginPct: revenueRub ? round((grossRub / revenueRub) * 100, 1) : 0,
    avgCheckRub: paid.length ? Math.round(revenueRub / paid.length) : 0,
    arpuRub: payers.size ? Math.round(revenueRub / payers.size) : 0,
    payingUsers: payers.size,
  }
}

export function financeReport(ds: Dataset, r: DateRange, s: AdminSettings): FinanceReport {
  const { start, end } = windowOf(ds, r)
  const good = ds.payments.filter((p) => p.at >= start && p.at < end && ok(p))
  const usage = ds.usage.filter((u) => u.day >= start && u.day < end)
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
  return { ...financeTotals(ds, r, s), compare: financeTotals(ds, prevRange(r), s), byPlan, series: series(ds, r, s.usdRub) }
}
