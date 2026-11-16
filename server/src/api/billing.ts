/**
 * Оплата. Провайдер подключается реализацией PaymentProvider: FreeKassa (freekassa.ts),
 * если в /etc/ruai-api.env заданы её ключи; иначе disabledProvider и checkout отвечает 503.
 *
 * Правила, которые уже действуют для любого провайдера:
 * - сумма платежа берётся с сервера (PRICES), клиент её не передаёт;
 * - подписка выдаётся только по уведомлению провайдера (webhook), проверенному провайдером,
 *   и только если сумма совпала с ценой; повтор уведомления ничего не меняет (идемпотентно);
 * - платёж только из аккаунта; email нужен лишь для кассового чека и сессию не даёт.
 */
import type { CheckoutRequest, PaymentInfo, PaymentMethod, PaymentStatus, PlanId, PlanTier } from '@/api/types'
import { PRICES } from '@/content/plans'
import { newId, type Db } from './db.ts'
import { activateSubscription } from './ledger.ts'

export interface ProviderEvent {
  providerId: string
  status: PaymentStatus
  /** Сумма в рублях по данным провайдера. */
  amount: number
}

export interface PaymentProvider {
  readonly name: string
  readonly enabled: boolean
  /** Текст ответа на принятое оповещение (FreeKassa ждёт «YES»); без него ответ { ok: true }. */
  readonly ack?: string
  create(p: { paymentId: string; amount: number; description: string; email: string; method: PaymentMethod; returnUrl: string; recurring: boolean }): Promise<{
    providerId: string
    confirmationUrl: string
  }>
  /** Проверяет подпись/IP уведомления и достаёт статус. null: не наше или подделка. */
  parseWebhook(req: { headers: Record<string, string | string[] | undefined>; body: unknown; query?: unknown; ip: string }): Promise<ProviderEvent | null>
}

export const disabledProvider: PaymentProvider = {
  name: 'none',
  enabled: false,
  async create() {
    throw new Error('payments disabled')
  },
  async parseWebhook() {
    return null
  },
}

interface PaymentRow {
  id: string
  user_id: string | null
  provider: string
  provider_id: string | null
  tier: PlanTier
  plan_id: PlanId
  amount: number
  status: string
  auto_renew: number
}

export function createPendingPayment(db: Db, a: { userId: string; provider: string; req: CheckoutRequest; now: number; autoRenew?: boolean }) {
  const id = newId('pay')
  const amount = PRICES[a.req.tier][a.req.planId]
  const repeat = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'succeeded' AND amount > 0", a.userId)!.n > 0
  db.run(
    `INSERT INTO payments (id, user_id, provider, tier, plan_id, amount, status, repeat, auto_renew, consent, receipt_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    id,
    a.userId,
    a.provider,
    a.req.tier,
    a.req.planId,
    amount,
    repeat ? 1 : 0,
    a.autoRenew ? 1 : 0,
    JSON.stringify(a.req.consent),
    a.req.email,
    a.now,
  )
  return { id, amount }
}

export function attachProviderId(db: Db, paymentId: string, providerId: string) {
  db.run('UPDATE payments SET provider_id = ? WHERE id = ?', providerId, paymentId)
}

export type ApplyResult = 'activated' | 'updated' | 'duplicate' | 'unknown' | 'mismatch'

/** Идемпотентное применение статуса от провайдера. */
export function applyPaymentStatus(db: Db, provider: string, ev: ProviderEvent, now: number): ApplyResult {
  return db.tx(() => {
    const p = db.get<PaymentRow>('SELECT * FROM payments WHERE provider = ? AND provider_id = ?', provider, ev.providerId)
    if (!p) return 'unknown'
    if (p.status === 'succeeded' || p.status === 'mismatch') return 'duplicate' // финальные статусы не меняются
    if (p.status === ev.status) return 'duplicate'
    if (ev.status === 'succeeded') {
      if (Math.round(ev.amount * 100) !== p.amount * 100) {
        db.run("UPDATE payments SET status = 'mismatch' WHERE id = ?", p.id)
        return 'mismatch'
      }
      db.run("UPDATE payments SET status = 'succeeded', paid_at = ? WHERE id = ?", now, p.id)
      if (p.user_id) activateSubscription(db, { userId: p.user_id, tier: p.tier, planId: p.plan_id, source: 'payment', paymentId: p.id, autoRenew: !!p.auto_renew, now })
      return 'activated'
    }
    db.run('UPDATE payments SET status = ? WHERE id = ?', ev.status, p.id)
    return 'updated'
  })
}

/** Выдача подписки из админки: платёж на 0 ₽ для отчётов + та же активация. */
export function grantSubscription(db: Db, a: { userId: string; tier: PlanTier; planId: PlanId; now: number }) {
  return db.tx(() => {
    const id = newId('pay')
    db.run(
      `INSERT INTO payments (id, user_id, provider, provider_id, tier, plan_id, amount, status, created_at, paid_at)
       VALUES (?, ?, 'admin', ?, ?, ?, 0, 'succeeded', ?, ?)`,
      id,
      a.userId,
      id,
      a.tier,
      a.planId,
      a.now,
      a.now,
    )
    return activateSubscription(db, { ...a, source: 'admin', paymentId: id, autoRenew: false })
  })
}

export function paymentInfo(db: Db, id: string, userId: string): PaymentInfo | null {
  const p = db.get<PaymentRow>('SELECT * FROM payments WHERE id = ? AND user_id = ?', id, userId)
  if (!p) return null
  const status: PaymentStatus = p.status === 'succeeded' ? 'succeeded' : p.status === 'pending' ? 'pending' : 'canceled'
  return { paymentId: p.id, status, planId: p.plan_id, tier: p.tier, amount: p.amount }
}
