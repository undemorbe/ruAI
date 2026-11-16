/**
 * Подписки и учёт запросов. Всё, что касается денег и лимитов, — в транзакциях БД:
 * проверка и списание атомарны, два параллельных запроса не проскочат лимит.
 *
 * Запрос резервируется до вызова модели (счётчики +1, событие pending) и потом
 * закрывается: ok — с фактической стоимостью, refund — без результата (счётчики −1).
 */
import type { AdminSettings, LimitCode, PlanId, PlanTier, Subscription, Usage } from '@/api/types'
import { LIMITS } from '@/config/app'
import { PLAN_TABLE } from '@/content/plans'
import { mskDayKey, nextMskMidnight, rateWait } from '@/lib/limits'
import { defaultAdminSettings } from '../../../src/admin/demo/dataset.ts'
import { newId, type Db } from './db.ts'

const DAY = 86_400_000

export interface SubRow {
  id: string
  user_id: string
  payment_id: string | null
  source: 'payment' | 'admin'
  tier: PlanTier
  plan_id: PlanId
  started_at: number
  expires_at: number
  total_limit: number
  daily_limit: number
  total_used: number
  daily_used: number
  daily_key: string
  gen_used: number
  spent_usd: number
  budget_rub: number
  auto_renew: number
}

// ---------- настройки админки (общие с ruai-admin) ----------

export function readSettings(db: Db): AdminSettings {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'admin')
  const def = defaultAdminSettings()
  if (!row) return def
  try {
    return { ...def, ...(JSON.parse(row.value) as Partial<AdminSettings>) }
  } catch {
    return def
  }
}
export function writeSettings(db: Db, s: AdminSettings) {
  db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'admin', JSON.stringify(s))
}

// ---------- подписка ----------

export const activeSub = (db: Db, userId: string, now: number) =>
  db.get<SubRow>('SELECT * FROM subscriptions WHERE user_id = ? AND started_at <= ? AND expires_at > ? ORDER BY started_at DESC LIMIT 1', userId, now, now)

const lastSub = (db: Db, userId: string) =>
  db.get<SubRow>('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1', userId)

export function usageOf(sub: SubRow, s: AdminSettings, now: number): Usage {
  const today = mskDayKey(new Date(now))
  const media = sub.tier === 'media'
  return {
    totalLimit: sub.total_limit,
    totalUsed: sub.total_used,
    dailyLimit: sub.daily_limit,
    dailyUsed: sub.daily_key === today ? sub.daily_used : 0,
    dailyResetAt: nextMskMidnight(new Date(now)).toISOString(),
    generationsUsed: sub.gen_used,
    generationsLimit: media ? s.generationLimits[sub.plan_id] : 0,
    generationEnabled: media && s.generationEnabled,
  }
}

export function subscriptionView(db: Db, userId: string, s: AdminSettings, now: number): Subscription | null {
  const sub = activeSub(db, userId, now) ?? lastSub(db, userId)
  if (!sub) return null
  return {
    planId: sub.plan_id,
    tier: sub.tier,
    startedAt: new Date(sub.started_at).toISOString(),
    expiresAt: new Date(sub.expires_at).toISOString(),
    autoRenew: !!sub.auto_renew,
    usage: usageOf(sub, s, now),
  }
}

/**
 * Новый период: начинается сейчас, неиспользованные дни текущей подписки переносятся,
 * счётчики — с нуля по лимитам нового тарифа. Общая точка для оплаты и выдачи из админки.
 */
export function activateSubscription(
  db: Db,
  a: { userId: string; tier: PlanTier; planId: PlanId; source: SubRow['source']; paymentId: string | null; autoRenew: boolean; now: number },
): SubRow {
  return db.tx(() => {
    const plan = PLAN_TABLE[a.planId]
    const cur = activeSub(db, a.userId, a.now)
    const carry = cur ? Math.max(0, cur.expires_at - a.now) : 0
    if (cur) db.run('UPDATE subscriptions SET expires_at = ? WHERE id = ?', a.now, cur.id)
    const s = readSettings(db)
    const id = newId('sub')
    db.run(
      `INSERT INTO subscriptions (id, user_id, payment_id, source, tier, plan_id, started_at, expires_at, total_limit, daily_limit, budget_rub, auto_renew)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      a.userId,
      a.paymentId,
      a.source,
      a.tier,
      a.planId,
      a.now,
      a.now + plan.periodDays * DAY + carry,
      plan.requestsTotal,
      plan.requestsPerDay,
      s.budgetsRub[a.tier][a.planId],
      a.autoRenew ? 1 : 0,
    )
    return db.get<SubRow>('SELECT * FROM subscriptions WHERE id = ?', id)!
  })
}

// ---------- резерв и закрытие запроса ----------

export type Kind = 'text' | 'vision' | 'image'

export class Refusal extends Error {
  readonly code: LimitCode
  readonly retryAfter?: number
  constructor(code: LimitCode, retryAfter?: number, message?: string) {
    super(message ?? code)
    this.code = code
    this.retryAfter = retryAfter
  }
}

export interface Reservation {
  eventId: number
  sub: SubRow
  kind: Kind
}

/** Проверки в порядке мока (src/api/mocks): лимиты → бюджет → тариф → генерация → частота → предохранитель. */
export function reserve(db: Db, a: { userId: string; kind: Kind; model: string; now: number; dailyUsdCap: number }): Reservation {
  return db.tx(() => {
    const s = readSettings(db)
    const sub = activeSub(db, a.userId, a.now)
    if (!sub) throw new Refusal('no_subscription')
    const today = mskDayKey(new Date(a.now))
    const u = usageOf(sub, s, a.now)
    if (u.totalUsed >= u.totalLimit) throw new Refusal('total_limit')
    if (u.dailyUsed >= u.dailyLimit) throw new Refusal('daily_limit', Math.ceil((Date.parse(u.dailyResetAt) - a.now) / 1000))
    if (sub.spent_usd * s.usdRub >= sub.budget_rub) throw new Refusal('budget')
    if (a.kind !== 'text' && sub.tier !== 'media') throw new Refusal('media_required')
    if (a.kind === 'image') {
      if (!u.generationEnabled) throw new Refusal('generation_disabled')
      if (u.generationsLimit !== null && u.generationsUsed >= u.generationsLimit) throw new Refusal('generation_limit')
    }
    const recent = db
      .all<{ created_at: number }>('SELECT created_at FROM usage_events WHERE user_id = ? AND created_at > ?', a.userId, a.now - 3_600_000)
      .map((r) => r.created_at)
    const wait = rateWait(recent, a.now)
    if (wait > 0) throw new Refusal('rate_limit', wait)
    const spentToday = db.get<{ usd: number | null }>('SELECT SUM(cost_usd) AS usd FROM usage_events WHERE day_key = ?', today)?.usd ?? 0
    if (spentToday >= a.dailyUsdCap) throw new Refusal('upstream', undefined, 'cap')

    db.run(
      'UPDATE subscriptions SET total_used = total_used + 1, daily_used = ?, daily_key = ?, gen_used = gen_used + ? WHERE id = ?',
      u.dailyUsed + 1,
      today,
      a.kind === 'image' ? 1 : 0,
      sub.id,
    )
    const r = db.run(
      `INSERT INTO usage_events (user_id, sub_id, kind, tier, plan_id, model, day_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      a.userId,
      sub.id,
      a.kind,
      sub.tier,
      sub.plan_id,
      a.model,
      today,
      a.now,
    )
    return { eventId: Number(r.lastInsertRowid), sub, kind: a.kind }
  })
}

export interface Outcome {
  /** Пользователь что-то получил: запрос списан. Иначе — возврат счётчиков. */
  produced: boolean
  tokensIn: number
  tokensOut: number
  costUsd: number
  errorCode?: string
  /**
   * Картинка создана инструментом генерации. Задан: генерация считается по факту
   * (сообщение без картинки возвращает зарезервированную генерацию, ответ с картинкой
   * учитывается как генерация). Не задан: как зарезервировано.
   */
  generated?: boolean
}

/** Закрывает резерв. Фактические расходы пишутся всегда — даже при возврате запроса. */
export function settle(db: Db, eventId: number, o: Outcome) {
  db.tx(() => {
    const ev = db.get<{ sub_id: string | null; status: string; day_key: string; kind: Kind }>('SELECT sub_id, status, day_key, kind FROM usage_events WHERE id = ?', eventId)
    if (!ev || ev.status !== 'pending') return
    const cost = Number.isFinite(o.costUsd) && o.costUsd > 0 ? o.costUsd : 0
    db.run(
      'UPDATE usage_events SET status = ?, tokens_in = ?, tokens_out = ?, cost_usd = ?, error_code = ? WHERE id = ?',
      o.produced ? 'ok' : o.errorCode ? 'error' : 'refunded',
      Math.max(0, Math.round(o.tokensIn)),
      Math.max(0, Math.round(o.tokensOut)),
      cost,
      o.errorCode ?? null,
      eventId,
    )
    if (!ev.sub_id) return
    db.run('UPDATE subscriptions SET spent_usd = spent_usd + ? WHERE id = ?', cost, ev.sub_id)
    if (!o.produced) {
      db.run(
        `UPDATE subscriptions SET total_used = MAX(0, total_used - 1),
           daily_used = CASE WHEN daily_key = ? THEN MAX(0, daily_used - 1) ELSE daily_used END,
           gen_used = MAX(0, gen_used - ?) WHERE id = ?`,
        ev.day_key,
        ev.kind === 'image' ? 1 : 0,
        ev.sub_id,
      )
    } else if (o.generated !== undefined && o.generated !== (ev.kind === 'image')) {
      // kind = 'image' в отчётах означает состоявшуюся генерацию
      db.run('UPDATE usage_events SET kind = ? WHERE id = ?', o.generated ? 'image' : 'text', eventId)
      db.run('UPDATE subscriptions SET gen_used = MAX(0, gen_used + ?) WHERE id = ?', o.generated ? 1 : -1, ev.sub_id)
    }
  })
}

/** После падения процесса незакрытые резервы возвращаются (ответ пользователь не получил). */
export function releaseStale(db: Db, now: number, olderThanMs = 10 * 60_000) {
  const stale = db.all<{ id: number }>("SELECT id FROM usage_events WHERE status = 'pending' AND created_at < ?", now - olderThanMs)
  for (const e of stale) settle(db, e.id, { produced: false, tokensIn: 0, tokensOut: 0, costUsd: 0, errorCode: 'interrupted' })
  return stale.length
}

export const CONCURRENT = LIMITS.concurrent
