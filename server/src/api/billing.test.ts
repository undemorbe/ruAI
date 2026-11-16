import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLAN_TABLE, PRICES } from '@/content/plans'
import { applyPaymentStatus, grantSubscription, type PaymentProvider, type ProviderEvent } from './billing.ts'
import { activateSubscription, readSettings, writeSettings } from './ledger.ts'
import { setup } from './testkit.ts'

const DAY = 86_400_000

function fakeProvider() {
  const created: { paymentId: string; amount: number; email: string }[] = []
  let next: ProviderEvent | null = null
  const p: PaymentProvider & { created: typeof created; push(ev: ProviderEvent | null): void } = {
    name: 'fake',
    enabled: true,
    created,
    push(ev) {
      next = ev
    },
    async create(a) {
      created.push({ paymentId: a.paymentId, amount: a.amount, email: a.email })
      return { providerId: `prov-${created.length}`, confirmationUrl: 'https://pay.example/confirm' }
    },
    async parseWebhook() {
      return next
    },
  }
  return p
}

const checkout = (over: object = {}) => ({
  planId: 'month',
  tier: 'media',
  method: 'card',
  email: 'buyer@example.ru',
  consent: { version: '', terms: true, recurring: true },
  ...over,
})

test('гость не оплачивает: 401 auth_required, аккаунт по email не создаётся, старое поле email отклоняется', async () => {
  const provider = fakeProvider()
  const t = setup({ deps: { provider } })
  const v = t.consent.version
  const r = await t.req('POST', '/api/billing/checkout', checkout({ consent: { version: v, terms: true, recurring: true } }))
  assert.equal(r.statusCode, 401)
  assert.equal(r.json().code, 'auth_required')
  assert.equal(t.db.get('SELECT * FROM users'), undefined)
  assert.equal(t.db.get('SELECT * FROM payments'), undefined)
  assert.equal(provider.created.length, 0)
  await t.register('payer')
  const noEmail: Record<string, unknown> = checkout({ consent: { version: v, terms: true, recurring: true } })
  delete noEmail.email
  assert.equal((await t.req('POST', '/api/billing/checkout', noEmail)).statusCode, 400, 'email для чека обязателен')
})

test('checkout: email для чека проверяется, нормализуется и сохраняется в платеже и профиле', async () => {
  const provider = fakeProvider()
  const t = setup({ deps: { provider } })
  await t.register()
  const consent = { version: t.consent.version, terms: true, recurring: true }
  const bad = await t.req('POST', '/api/billing/checkout', checkout({ email: 'nope', consent }))
  assert.equal(bad.json().code, 'bad_email')
  assert.equal(t.db.get('SELECT * FROM payments'), undefined)
  assert.equal((await t.req('GET', '/api/auth/me')).json().email, null)
  const r = await t.req('POST', '/api/billing/checkout', checkout({ email: ' Buyer@Example.RU ', consent }))
  assert.equal(r.statusCode, 200)
  assert.equal(t.db.get<{ receipt_email: string }>('SELECT receipt_email FROM payments')!.receipt_email, 'buyer@example.ru')
  assert.equal(provider.created[0]!.email, 'buyer@example.ru')
  assert.equal((await t.req('GET', '/api/auth/me')).json().email, 'buyer@example.ru')
})

test('оплата выключена: 503 payments_disabled, но согласия проверяются раньше', async () => {
  const t = setup()
  const v = t.consent.version
  await t.register('payer')
  assert.equal((await t.req('POST', '/api/billing/checkout', checkout({ consent: { version: v, terms: true, recurring: false } }))).json().code, 'consent', 'без согласия на автопродление')
  const r = await t.req('POST', '/api/billing/checkout', checkout({ consent: { version: v, terms: true, recurring: true } }))
  assert.equal(r.statusCode, 503)
  assert.equal(r.json().code, 'payments_disabled')
  assert.equal(t.db.get('SELECT * FROM payments'), undefined)
})

test('тарифы отдаёт сервер из общих правил', async () => {
  const t = setup()
  const plans = (await t.req('GET', '/api/billing/plans?tier=media')).json() as { id: string; price: number; tier: string }[]
  assert.deepEqual(
    plans.map((p) => [p.id, p.price, p.tier]),
    [
      ['week', PRICES.media.week, 'media'],
      ['month', PRICES.media.month, 'media'],
      ['quarter', PRICES.media.quarter, 'media'],
    ],
  )
})

test('провайдер: сумма с сервера, подписка только по уведомлению с верной суммой, повтор идемпотентен', async () => {
  const provider = fakeProvider()
  const t = setup({ deps: { provider } })
  const v = t.consent.version
  const userId = await t.register('buyer')
  const r = await t.req('POST', '/api/billing/checkout', checkout({ consent: { version: v, terms: true, recurring: true } }))
  assert.equal(r.statusCode, 200)
  const { paymentId } = r.json() as { paymentId: string }
  assert.equal(provider.created[0]!.amount, PRICES.media.month, 'цену клиент не передаёт')
  assert.equal(t.db.get<{ user_id: string }>('SELECT user_id FROM payments')!.user_id, userId, 'платёж на аккаунт из сессии')
  assert.equal((await t.req('GET', `/api/billing/payments/${paymentId}`)).json().status, 'pending')
  assert.equal(t.db.get('SELECT * FROM subscriptions WHERE user_id = ?', userId), undefined)
  // статус платежа видит только владелец
  await t.req('POST', '/api/auth/logout', {})
  assert.equal((await t.req('GET', `/api/billing/payments/${paymentId}`)).statusCode, 404, 'гостю как несуществующий')
  await t.register('stranger')
  assert.equal((await t.req('GET', `/api/billing/payments/${paymentId}`)).statusCode, 404, 'чужому как несуществующий')

  // поддельная сумма
  provider.push({ providerId: 'prov-1', status: 'succeeded', amount: 1 })
  await t.req('POST', '/api/billing/webhook/fake', { any: 1 }, { 'x-requested-with': '', origin: '' })
  assert.equal(t.db.get<{ status: string }>('SELECT status FROM payments')!.status, 'mismatch')
  assert.equal(t.db.get('SELECT * FROM subscriptions'), undefined)
})

test('applyPaymentStatus: активирует один раз, неизвестный платёж игнорирует', async () => {
  const provider = fakeProvider()
  const t = setup({ deps: { provider } })
  const userId = await t.register('payer')
  await t.req('POST', '/api/billing/checkout', checkout({ consent: { version: t.consent.version, terms: true, recurring: true } }))
  const ev: ProviderEvent = { providerId: 'prov-1', status: 'succeeded', amount: PRICES.media.month }
  assert.equal(applyPaymentStatus(t.db, 'fake', ev, t.clock.t), 'activated')
  assert.equal(applyPaymentStatus(t.db, 'fake', ev, t.clock.t), 'duplicate')
  assert.equal(applyPaymentStatus(t.db, 'fake', { ...ev, status: 'canceled' }, t.clock.t), 'duplicate', 'успешный платёж не откатывается уведомлением')
  assert.equal(applyPaymentStatus(t.db, 'fake', { ...ev, providerId: 'nope' }, t.clock.t), 'unknown')
  assert.equal(applyPaymentStatus(t.db, 'other', ev, t.clock.t), 'unknown', 'чужой провайдер')
  const subs = t.db.all<{ tier: string; plan_id: string; user_id: string }>('SELECT tier, plan_id, user_id FROM subscriptions')
  assert.equal(subs.length, 1)
  assert.deepEqual({ ...subs[0] }, { tier: 'media', plan_id: 'month', user_id: userId })
  const me = (await t.req('GET', '/api/auth/me')).json() as { subscription: { tier: string; usage: { totalLimit: number } } }
  assert.equal(me.subscription.usage.totalLimit, PLAN_TABLE.month.requestsTotal)
})

test('новый период переносит оставшиеся дни и обнуляет счётчики; бюджет из настроек админки', async () => {
  const t = setup()
  const userId = await t.register()
  const s = readSettings(t.db)
  writeSettings(t.db, { ...s, budgetsRub: { ...s.budgetsRub, text: { ...s.budgetsRub.text, week: 123 } } })
  const a = activateSubscription(t.db, { userId, tier: 'text', planId: 'week', source: 'admin', paymentId: null, autoRenew: false, now: t.clock.t })
  assert.equal(a.budget_rub, 123)
  t.db.run('UPDATE subscriptions SET total_used = 100')
  const later = t.clock.t + 2 * DAY
  const b = activateSubscription(t.db, { userId, tier: 'text', planId: 'month', source: 'admin', paymentId: null, autoRenew: false, now: later })
  assert.equal(b.expires_at, later + 30 * DAY + 5 * DAY)
  assert.equal(b.total_used, 0)
  assert.equal(t.db.get<{ expires_at: number }>('SELECT expires_at FROM subscriptions WHERE id = ?', a.id)!.expires_at, later)
})

test('выдача из админки: платёж 0 ₽ в отчётах и обычная подписка', async () => {
  const t = setup()
  const userId = await t.register()
  grantSubscription(t.db, { userId, tier: 'media', planId: 'quarter', now: t.clock.t })
  const p = t.db.get<{ provider: string; amount: number; status: string }>('SELECT provider, amount, status FROM payments')!
  assert.deepEqual({ ...p }, { provider: 'admin', amount: 0, status: 'succeeded' })
  const sub = t.db.get<{ source: string; total_limit: number }>('SELECT source, total_limit FROM subscriptions')!
  assert.equal(sub.source, 'admin')
  assert.equal(sub.total_limit, PLAN_TABLE.quarter.requestsTotal)
})

test('вебхук выключенного или чужого провайдера — 404', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/billing/webhook/none', {})).statusCode, 404)
  const t2 = setup({ deps: { provider: fakeProvider() } })
  assert.equal((await t2.req('POST', '/api/billing/webhook/yookassa', {})).statusCode, 404)
})
