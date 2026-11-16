/**
 * Отчёты админки из боевой базы. Строки из БД приводятся к тому же «сырому» виду, что и
 * демо-данные (Dataset), и считаются теми же функциями - отчёты демо и прода совпадают по смыслу.
 * Расходы агрегируются в SQL по пользователю и дню, поэтому объём в памяти ограничен.
 */
import type { SubEdit, UserEdit } from '../../src/admin/api/types.ts'
import type { PlanId, PlanTier } from '../../src/api/types.ts'
import { analyticsReport, userDetail } from '../../src/admin/demo/analytics.ts'
import {
  apiReport,
  financeReport,
  imagesReport,
  overview,
  paymentsReport,
  usersPage,
  type Dataset,
  type DemoPayment,
  type DemoUsage,
  type DemoUser,
  type SubSpan,
} from '../../src/admin/demo/dataset.ts'
import { cleanNote, expiryOf } from '../../src/admin/edits.ts'
import { bounds, prevRange, type DateRange } from '../../src/admin/range.ts'
import { mskDayKey } from '../../src/lib/limits.ts'
import { grantSubscription } from './api/billing.ts'
import type { Db } from './api/db.ts'
import type { ImageFiles } from './api/images.ts'
import { activeSub } from './api/ledger.ts'
import { deleteUser } from './api/sweep.ts'
import type { AdminRepo } from './store.ts'

const DAY = 86_400_000
/** Самый длинный тариф: подписка, начатая раньше окна, ещё может его покрывать. */
const LONGEST_PLAN = 120 * DAY
/** Для списка пользователей и карточки: год истории. */
const HORIZON = 365 * DAY + LONGEST_PLAN

/** С какого момента грузить данные для отчёта: окно + такой же период до него (сравнение). */
export const loadFrom = (r: DateRange) => bounds(prevRange(r)).start - LONGEST_PLAN

export function loadDataset(db: Db, now: number, from = now - HORIZON): Dataset {
  const sessions = new Map(
    db.all<{ user_id: string; n: number }>('SELECT user_id, COUNT(*) AS n FROM sessions WHERE expires_at > ? GROUP BY user_id', now).map((x) => [x.user_id, x.n]),
  )
  const users: DemoUser[] = db
    // tg_id и хэш пароля в панель не уходят: только признак «Telegram подключён»
    .all<{ id: string; login: string; email: string | null; telegram: number; created_at: number; blocked_at: number | null; admin_note: string | null }>(
      'SELECT id, login, email, tg_id IS NOT NULL AS telegram, created_at, blocked_at, admin_note FROM users',
    )
    .map((u) => ({
      id: u.id,
      login: u.login,
      email: u.email,
      telegram: !!u.telegram,
      registeredAt: u.created_at,
      sessions: sessions.get(u.id) ?? 0,
      ...(u.admin_note ? { note: u.admin_note } : {}),
      ...(u.blocked_at ? { blocked: true } : {}),
    }))

  const payments: DemoPayment[] = db
    .all<{ id: string; user_id: string | null; at: number; tier: PlanTier; plan_id: PlanId; amount: number; status: string; refunded_at: number | null; repeat: number; auto_renew: number; provider: string }>(
      "SELECT id, user_id, COALESCE(paid_at, created_at) AS at, tier, plan_id, amount, status, refunded_at, repeat, auto_renew, provider FROM payments WHERE status != 'pending' AND created_at >= ?",
      from,
    )
    .map((p) => ({
      id: p.id,
      userId: p.user_id ?? 'deleted',
      at: p.at,
      tier: p.tier,
      planId: p.plan_id,
      amount: p.amount,
      status: p.status === 'succeeded' ? 'succeeded' : 'failed',
      refunded: !!p.refunded_at,
      repeat: !!p.repeat,
      autoRenew: !!p.auto_renew,
      provider: p.provider,
    }))

  const usageRows = db.all<{
    user_id: string | null
    day: number
    tier: PlanTier
    requests: number
    tokens_in: number
    tokens_out: number
    text_usd: number
    image_usd: number
    generations: number
  }>(
    `SELECT user_id, (created_at / ${DAY}) * ${DAY} AS day, tier,
       SUM(status = 'ok') AS requests, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out,
       SUM(CASE WHEN kind != 'image' THEN cost_usd ELSE 0 END) AS text_usd,
       SUM(CASE WHEN kind = 'image' THEN cost_usd ELSE 0 END) AS image_usd,
       SUM(kind = 'image' AND status = 'ok') AS generations
     FROM usage_events WHERE created_at >= ? GROUP BY user_id, day, tier`,
    from,
  )
  const errRows = db.all<{ user_id: string | null; day: number; tier: PlanTier; code: string; n: number }>(
    `SELECT user_id, (created_at / ${DAY}) * ${DAY} AS day, tier, error_code AS code, COUNT(*) AS n
     FROM usage_events WHERE created_at >= ? AND status = 'error' AND error_code NOT IN ('aborted') GROUP BY user_id, day, tier, error_code`,
    from,
  )
  const key = (u: string | null, d: number, t: string) => `${u ?? 'deleted'}|${d}|${t}`
  const usage = new Map<string, DemoUsage>()
  for (const r of usageRows) {
    usage.set(key(r.user_id, r.day, r.tier), {
      userId: r.user_id ?? 'deleted',
      day: r.day,
      tier: r.tier,
      requests: r.requests,
      tokensIn: r.tokens_in,
      tokensOut: r.tokens_out,
      textUsd: r.text_usd,
      imageUsd: r.image_usd,
      generations: r.generations,
      errors: {},
    })
  }
  for (const e of errRows) {
    const u = usage.get(key(e.user_id, e.day, e.tier))
    if (u) u.errors[e.code] = e.n
  }

  const today = mskDayKey(new Date(now))
  const subs: SubSpan[] = db
    .all<{
      id: string
      user_id: string
      source: 'payment' | 'admin'
      tier: PlanTier
      plan_id: PlanId
      started_at: number
      expires_at: number
      auto_renew: number
      total_limit: number
      total_used: number
      daily_limit: number
      daily_used: number
      daily_key: string
      gen_used: number
      budget_rub: number
      spent_usd: number
    }>('SELECT * FROM subscriptions WHERE expires_at >= ? AND expires_at > started_at', from)
    .map((s) => ({
      id: s.id,
      userId: s.user_id,
      tier: s.tier,
      planId: s.plan_id,
      startAt: s.started_at,
      expiresAt: s.expires_at,
      autoRenew: !!s.auto_renew,
      source: s.source,
      totalLimit: s.total_limit,
      totalUsed: s.total_used,
      dailyLimit: s.daily_limit,
      dailyUsed: s.daily_key === today ? s.daily_used : 0,
      genUsed: s.gen_used,
      budgetRub: s.budget_rub,
      spentUsd: s.spent_usd,
    }))

  const cancels = db
    .all<{ user_id: string; canceled_at: number }>('SELECT user_id, canceled_at FROM subscriptions WHERE canceled_at IS NOT NULL AND canceled_at >= ?', from)
    .map((c) => ({ userId: c.user_id, at: c.canceled_at }))

  return { now, users, payments, usage: [...usage.values()], cancels, subs }
}

/** Результат правки: ok, нет пользователя, нет подписки. */
export type EditResult = 'ok' | 'no_user' | 'no_sub'

export interface AdminActions {
  grant(userId: string, tier: PlanTier, planId: PlanId): Promise<boolean>
  setBlocked(userId: string, blocked: boolean): Promise<boolean>
  removeUser(userId: string): Promise<boolean>
  /** Значения уже проверены (JSON-схема + checkSubEdit). */
  editSubscription(userId: string, e: SubEdit): Promise<EditResult>
  editUser(userId: string, e: UserEdit): Promise<EditResult>
  logoutUser(userId: string): Promise<boolean>
}

export function sqlRepo(db: Db, files: ImageFiles, now: () => number = Date.now): AdminRepo & AdminActions {
  const ds = (r?: DateRange) => loadDataset(db, now(), r ? Math.min(loadFrom(r), now() - HORIZON) : undefined)
  const exists = (id: string) => !!db.get('SELECT 1 FROM users WHERE id = ?', id)
  return {
    overview: async (r, s) => overview(ds(r), r, s),
    analytics: async (r, s) => analyticsReport(ds(r), r, s),
    payments: async (r) => paymentsReport(ds(r), r),
    api: async (r, s) => apiReport(ds(r), r, s),
    images: async (r, s) => imagesReport(ds(r), r, s),
    users: async (q, s) => usersPage(ds(), q, s),
    user: async (id, s) => (exists(id) ? userDetail(ds(), id, s) : null),
    finance: async (r, s) => financeReport(ds(r), r, s),
    async grant(userId, tier, planId) {
      if (!exists(userId)) return false
      grantSubscription(db, { userId, tier, planId, now: now() })
      return true
    },
    async setBlocked(userId, blocked) {
      return db.tx(() => {
        const r = db.run('UPDATE users SET blocked_at = ? WHERE id = ?', blocked ? now() : null, userId)
        // блокировка сразу закрывает все сессии пользователя
        if (blocked) db.run('DELETE FROM sessions WHERE user_id = ?', userId)
        return r.changes > 0
      })
    },
    async removeUser(userId) {
      return deleteUser(db, files, userId)
    },
    async editSubscription(userId, e) {
      return db.tx(() => {
        if (!exists(userId)) return 'no_user'
        const t = now()
        const sub = activeSub(db, userId, t)
        if (!sub) return 'no_sub'
        if (e.end) db.run('UPDATE subscriptions SET expires_at = ?, auto_renew = 0 WHERE id = ?', t, sub.id)
        if (e.expiresOn !== undefined) db.run('UPDATE subscriptions SET expires_at = ? WHERE id = ?', Math.max(t + 1, expiryOf(e.expiresOn)), sub.id)
        // лимит не ниже уже потраченного, бюджет не ниже нуля
        if (e.totalLimitDelta) db.run('UPDATE subscriptions SET total_limit = MAX(total_used, total_limit + ?) WHERE id = ?', e.totalLimitDelta, sub.id)
        if (e.budgetDeltaRub) db.run('UPDATE subscriptions SET budget_rub = MAX(0, budget_rub + ?) WHERE id = ?', e.budgetDeltaRub, sub.id)
        if (e.autoRenew !== undefined) db.run('UPDATE subscriptions SET auto_renew = ? WHERE id = ?', e.autoRenew ? 1 : 0, sub.id)
        if (e.resetDaily) db.run('UPDATE subscriptions SET daily_used = 0 WHERE id = ?', sub.id)
        return 'ok'
      })
    },
    async editUser(userId, e) {
      return db.tx(() => {
        if (!exists(userId)) return 'no_user'
        // email только для чеков: во входе не участвует, поэтому не уникален и сессии не закрывает
        if (e.email !== undefined) db.run('UPDATE users SET email = ? WHERE id = ?', e.email.trim().toLowerCase(), userId)
        if (e.note !== undefined) {
          const note = cleanNote(e.note)
          db.run('UPDATE users SET admin_note = ? WHERE id = ?', note || null, userId)
        }
        return 'ok'
      })
    },
    async logoutUser(userId) {
      return db.tx(() => {
        if (!exists(userId)) return false
        db.run('DELETE FROM sessions WHERE user_id = ?', userId)
        return true
      })
    },
  }
}
