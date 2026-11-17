/**
 * Аналитика и карточка пользователя поверх тех же «сырых» данных, что и отчёты (dataset.ts):
 * для демо и для боевой базы считается одинаково.
 */
import type { AdminSettings, AnalyticsReport, CohortRow, DateRange, DayStats, UserDetail } from '../api/types'
import { DAY, isoDay } from '../range'
import { currentSub, daysOf, DELETED, DEMO_PLANS, loginsOf, net, ok, paymentRow, userRow, windowOf, type Dataset } from './dataset'

const round = (n: number, k = 1) => Math.round(n * 10 ** k) / 10 ** k
const pctOf = (a: number, b: number) => (b ? round((a / b) * 100) : 0)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Понедельник = 0. */
const weekdayOf = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7

export function analyticsReport(ds: Dataset, r: DateRange, s: AdminSettings): AnalyticsReport {
  const { start, end } = windowOf(ds, r)
  const days = daysOf(ds, r)

  // ---------- по дням ----------
  const map = new Map<number, DayStats & { users: Set<string> }>()
  for (const d of days) map.set(d, { date: isoDay(d), revenueRub: 0, apiRub: 0, requests: 0, registrations: 0, activeUsers: 0, payments: 0, generations: 0, users: new Set() })
  const at = (ms: number) => (ms >= start && ms < end ? map.get(Math.floor(ms / DAY) * DAY) : undefined)
  for (const p of ds.payments) {
    const x = at(p.at)
    if (x && ok(p)) {
      x.revenueRub += net(p)
      if (p.amount > 0) x.payments++
    }
  }
  for (const u of ds.usage) {
    const x = at(u.day)
    if (!x) continue
    x.apiRub += (u.textUsd + u.imageUsd) * s.usdRub
    x.requests += u.requests
    x.generations += u.generations
    // обезличенные расходы удалённых считаются в суммах, но не как один «активный пользователь»
    if (u.requests && u.userId !== DELETED) x.users.add(u.userId)
  }
  for (const u of ds.users) {
    const x = at(u.registeredAt)
    if (x) x.registrations++
  }
  const stats: DayStats[] = [...map.values()].map(({ users, ...x }) => ({ ...x, apiRub: Math.round(x.apiRub), activeUsers: users.size }))

  // ---------- активность ----------
  const activeSet = new Set<string>()
  for (const x of map.values()) for (const id of x.users) activeSet.add(id)
  const dau = stats.map((x) => x.activeUsers)
  const peak = stats.reduce<DayStats | null>((m, x) => (!m || x.activeUsers > m.activeUsers ? x : m), null)
  const avgDau = dau.length ? dau.reduce((a, b) => a + b, 0) / dau.length : 0
  const requests = stats.reduce((n, x) => n + x.requests, 0)

  // ---------- воронка: зарегистрированные в периоде ----------
  const cohortUsers = ds.users.filter((u) => u.registeredAt >= start && u.registeredAt < end)
  const usedBy = new Set(ds.usage.filter((u) => u.requests).map((u) => u.userId))
  const paidCount = new Map<string, number>()
  const firstPaid = new Map<string, number>()
  for (const p of ds.payments) {
    if (!ok(p) || p.refunded || p.amount <= 0 || p.userId === DELETED) continue
    paidCount.set(p.userId, (paidCount.get(p.userId) ?? 0) + 1)
    firstPaid.set(p.userId, Math.min(firstPaid.get(p.userId) ?? Infinity, p.at))
  }
  const funnel = {
    registered: cohortUsers.length,
    active: cohortUsers.filter((u) => usedBy.has(u.id)).length,
    paid: cohortUsers.filter((u) => paidCount.has(u.id)).length,
    repeat: cohortUsers.filter((u) => (paidCount.get(u.id) ?? 0) > 1).length,
  }

  // ---------- дни недели: среднее за день ----------
  const wk = Array.from({ length: 7 }, (_, day) => ({ day, n: 0, requests: 0, revenueRub: 0, registrations: 0 }))
  for (const x of stats) {
    const w = wk[weekdayOf(Date.parse(x.date))]!
    w.n++
    w.requests += x.requests
    w.revenueRub += x.revenueRub
    w.registrations += x.registrations
  }
  const weekday = wk.map((w) => ({
    day: w.day,
    requests: w.n ? Math.round(w.requests / w.n) : 0,
    revenueRub: w.n ? Math.round(w.revenueRub / w.n) : 0,
    registrations: w.n ? round(w.registrations / w.n) : 0,
  }))

  // ---------- когорты по дате регистрации ----------
  const unit: 'week' | 'month' = days.length > 120 ? 'month' : 'week'
  const starts: number[] = []
  if (unit === 'week') for (let d = Math.floor(start / DAY) * DAY; d < end; d += 7 * DAY) starts.push(d)
  else {
    const f = new Date(start)
    for (let m = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1); m < end; ) {
      starts.push(Math.max(m, Math.floor(start / DAY) * DAY))
      const d = new Date(m)
      m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    }
  }
  const periodStart = (base: number, k: number) => {
    if (unit === 'week') return base + k * 7 * DAY
    const d = new Date(base)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1)
  }
  const activeDays = new Map<string, number[]>()
  for (const u of ds.usage) if (u.requests) activeDays.set(u.userId, [...(activeDays.get(u.userId) ?? []), u.day])
  const COLS = 8
  const rows: CohortRow[] = starts.slice(-12).map((c, i, arr) => {
    const next = arr[i + 1] ?? (unit === 'week' ? c + 7 * DAY : periodStart(c, 1))
    const members = ds.users.filter((u) => u.registeredAt >= c && u.registeredAt < Math.min(next, end))
    const base = unit === 'week' ? c : Date.UTC(new Date(c).getUTCFullYear(), new Date(c).getUTCMonth(), 1)
    const retention = Array.from({ length: COLS }, (_, k) => {
      const a = periodStart(base, k)
      if (a > ds.now) return null
      const b = periodStart(base, k + 1)
      const n = members.filter((m) => activeDays.get(m.id)?.some((d) => d >= a && d < b)).length
      return pctOf(n, members.length)
    })
    const label =
      unit === 'week'
        ? new Date(c).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
        : new Date(c).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    return { label, start: isoDay(c), size: members.length, paidPct: pctOf(members.filter((m) => paidCount.has(m.id)).length, members.length), retention }
  })

  // ---------- окупаемость: платящие в периоде ----------
  const payers = cohortUsers.filter((u) => firstPaid.has(u.id))
  const lifetime = new Map<string, number>()
  for (const p of ds.payments) lifetime.set(p.userId, (lifetime.get(p.userId) ?? 0) + net(p))
  const allPayers = [...paidCount.keys()]
  const payback = {
    medianDaysToPay: payers.length ? round(median(payers.map((u) => (firstPaid.get(u.id)! - u.registeredAt) / DAY))!, 1) : null,
    ltvRub: allPayers.length ? Math.round(allPayers.reduce((n, id) => n + (lifetime.get(id) ?? 0), 0) / allPayers.length) : 0,
    payingUsers: allPayers.length,
  }

  return {
    days: stats,
    funnel,
    activity: {
      activeUsers: activeSet.size,
      avgDau: round(avgDau),
      peakDau: peak?.activeUsers ?? 0,
      peakDate: peak && peak.activeUsers ? peak.date : null,
      requestsPerActive: activeSet.size ? round(requests / activeSet.size) : 0,
      stickiness: pctOf(avgDau, activeSet.size),
    },
    weekday,
    cohorts: { unit, rows },
    payback,
  }
}

export function userDetail(ds: Dataset, userId: string, s: AdminSettings): UserDetail | null {
  const u = ds.users.find((x) => x.id === userId)
  if (!u) return null
  const own = ds.usage.filter((x) => x.userId === userId)
  const sub = currentSub(ds, userId)
  const logins = loginsOf(ds)
  const from = Math.floor(ds.now / DAY) * DAY - 59 * DAY
  // все 60 дней, включая пустые: на графике видны перерывы в активности
  const byDay = new Map<number, UserDetail['days'][number]>()
  for (let day = from; day <= ds.now; day += DAY) byDay.set(day, { date: isoDay(day), requests: 0, usd: 0, generations: 0, errors: 0 })
  for (const x of own) {
    const d = byDay.get(x.day)
    if (!d) continue
    d.requests += x.requests
    d.usd += x.textUsd + x.imageUsd
    d.generations += x.generations
    d.errors += Object.values(x.errors).reduce((a, b) => a + b, 0)
  }
  return {
    user: userRow(ds, u, s, own),
    note: u.note ?? '',
    sessions: u.sessions ?? 0,
    sub: sub && {
      id: sub.id,
      tier: sub.tier,
      planId: sub.planId,
      source: sub.source ?? 'payment',
      startedAt: new Date(sub.startAt).toISOString(),
      expiresAt: new Date(sub.expiresAt).toISOString(),
      autoRenew: sub.autoRenew,
      totalLimit: sub.totalLimit ?? DEMO_PLANS[sub.planId].requests,
      totalUsed: sub.totalUsed ?? 0,
      dailyLimit: sub.dailyLimit ?? DEMO_PLANS[sub.planId].perDay,
      dailyUsed: sub.dailyUsed ?? 0,
      genUsed: sub.genUsed ?? 0,
      budgetRub: Math.round(sub.budgetRub ?? s.budgetsRub[sub.tier][sub.planId]),
      spentRub: Math.round((sub.spentUsd ?? 0) * s.usdRub),
    },
    history: ds.subs
      .filter((x) => x.userId === userId)
      .sort((a, b) => b.startAt - a.startAt)
      .slice(0, 30)
      .map((x) => ({ id: x.id, tier: x.tier, planId: x.planId, source: x.source ?? 'payment', startedAt: new Date(x.startAt).toISOString(), expiresAt: new Date(x.expiresAt).toISOString() })),
    payments: ds.payments
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((p) => paymentRow(p, logins)),
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, usd: Math.round(d.usd * 1000) / 1000 })),
  }
}
