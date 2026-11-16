import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { PRICES } from '@/content/plans'
import { FREEKASSA_IPS, fkAmount, freeKassaProvider } from './freekassa.ts'
import { ORIGIN, setup } from './testkit.ts'

const md5 = (s: string) => createHash('md5').update(s).digest('hex')
const CFG = { merchantId: '12345', secret1: 'first-secret-word', secret2: 'second-secret-word', ipCheck: true }
const FK_IP = FREEKASSA_IPS[0]!
const ORDER = 'pay_' + 'A'.repeat(20)

/** Оповещение, подписанное так, как это делает FreeKassa. */
const notice = (o: { order?: string; amount?: string; merchant?: string; secret?: string } = {}) => {
  const MERCHANT_ID = o.merchant ?? CFG.merchantId
  const AMOUNT = o.amount ?? '299'
  const MERCHANT_ORDER_ID = o.order ?? ORDER
  return { MERCHANT_ID, AMOUNT, intid: '777', MERCHANT_ORDER_ID, P_EMAIL: 'buyer@example.ru', CUR_ID: '36', SIGN: md5(`${MERCHANT_ID}:${AMOUNT}:${o.secret ?? CFG.secret2}:${MERCHANT_ORDER_ID}`) }
}

test('ссылка на оплату: подпись secret1, email для чека, способ оплаты, сумма без копеек', async () => {
  const fk = freeKassaProvider(CFG)
  const r = await fk.create({ paymentId: ORDER, amount: 299, description: 'x', email: 'buyer@example.ru', method: 'sbp', returnUrl: '', recurring: false })
  assert.equal(r.providerId, ORDER, 'номер заказа FreeKassa = наш paymentId')
  const u = new URL(r.confirmationUrl)
  assert.equal(u.origin + u.pathname, 'https://pay.fk.money/')
  const q = Object.fromEntries(u.searchParams)
  assert.deepEqual(
    { m: q.m, oa: q.oa, currency: q.currency, o: q.o, em: q.em, i: q.i, lang: q.lang },
    { m: '12345', oa: '299', currency: 'RUB', o: ORDER, em: 'buyer@example.ru', i: '42', lang: 'ru' },
  )
  assert.equal(q.s, md5(`12345:299:${CFG.secret1}:RUB:${ORDER}`))
  assert.ok(!r.confirmationUrl.includes(CFG.secret1) && !r.confirmationUrl.includes(CFG.secret2), 'секреты в ссылку не попадают')
  const sber = new URL((await fk.create({ paymentId: ORDER, amount: 299, description: 'x', email: 'a@b.ru', method: 'sberpay', returnUrl: '', recurring: false })).confirmationUrl)
  assert.equal(sber.searchParams.get('i'), null, 'SberPay выбирается на странице FreeKassa')
  assert.equal(fkAmount(299), '299')
  assert.equal(fkAmount(299.5), '299.50')
})

test('оповещение: принимается только с верной подписью, своим магазином, номером заказа и IP FreeKassa', async () => {
  const fk = freeKassaProvider(CFG)
  const parse = (body: unknown, ip = FK_IP, query?: unknown) => fk.parseWebhook({ headers: {}, body, query, ip })
  assert.deepEqual(await parse(notice()), { providerId: ORDER, status: 'succeeded', amount: 299 })
  assert.deepEqual(await parse({}, FK_IP, notice()), { providerId: ORDER, status: 'succeeded', amount: 299 }, 'GET: параметры в query')
  assert.equal(fk.ack, 'YES')

  assert.equal(await parse(notice({ secret: CFG.secret1 })), null, 'подпись не тем секретом')
  assert.equal(await parse({ ...notice(), AMOUNT: '1' }), null, 'подменённая сумма ломает подпись')
  assert.equal(await parse({ ...notice(), SIGN: '' }), null, 'без подписи')
  assert.equal(await parse(notice({ merchant: '999' })), null, 'чужой магазин')
  assert.equal(await parse(notice({ order: 'pay_short' })), null, 'не наш формат номера')
  assert.equal(await parse(notice({ amount: '-5' })), null, 'отрицательная сумма')
  assert.equal(await parse(notice(), '203.0.113.9'), null, 'не IP FreeKassa')
  assert.equal(await parse('MERCHANT_ID=1'), null, 'тело не объект')
  assert.deepEqual(await freeKassaProvider({ ...CFG, ipCheck: false }).parseWebhook({ headers: {}, body: notice(), ip: '203.0.113.9' }), { providerId: ORDER, status: 'succeeded', amount: 299 }, 'проверку IP можно выключить')
})

test('FreeKassa целиком: оплата → форма-оповещение → «YES» и подписка, повтор идемпотентен, автопродления нет', async () => {
  const t = setup({ deps: { provider: freeKassaProvider(CFG) } })
  const userId = await t.register('buyer')
  const r = await t.req('POST', '/api/billing/checkout', {
    planId: 'month',
    tier: 'media',
    method: 'card',
    email: ' Buyer@Example.RU ',
    consent: { version: t.consent.version, terms: true, recurring: false },
  })
  assert.equal(r.statusCode, 200)
  const { paymentId, confirmationUrl } = r.json() as { paymentId: string; confirmationUrl: string }
  const q = new URL(confirmationUrl).searchParams
  assert.equal(q.get('o'), paymentId)
  assert.equal(q.get('em'), 'buyer@example.ru', 'чек уйдёт на email из формы оплаты')
  assert.equal(q.get('oa'), String(PRICES.media.month), 'сумма с сервера')
  assert.equal(t.db.get<{ provider: string; provider_id: string }>('SELECT provider, provider_id FROM payments')!.provider_id, paymentId)

  const form = (n: Record<string, string>, ip = FK_IP) =>
    t.app.inject({ method: 'POST', url: '/api/billing/webhook/freekassa', remoteAddress: ip, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(n).toString() })

  const fake = await form(notice({ order: paymentId, amount: String(PRICES.media.month), secret: 'guess-guess' }))
  assert.equal(fake.statusCode, 400)
  assert.equal(t.db.get('SELECT * FROM subscriptions WHERE user_id = ?', userId), undefined)

  const ok = await form(notice({ order: paymentId, amount: String(PRICES.media.month) }))
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body, 'YES')
  const pay = t.db.get<{ status: string; auto_renew: number }>('SELECT status, auto_renew FROM payments')!
  assert.deepEqual({ ...pay }, { status: 'succeeded', auto_renew: 0 })
  const sub = t.db.get<{ tier: string; auto_renew: number }>('SELECT tier, auto_renew FROM subscriptions WHERE user_id = ?', userId)!
  assert.deepEqual({ ...sub }, { tier: 'media', auto_renew: 0 })

  const again = await form(notice({ order: paymentId, amount: String(PRICES.media.month) }))
  assert.equal(again.body, 'YES', 'повтор подтверждаем, чтобы FreeKassa перестала слать')
  assert.equal(t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM subscriptions')!.n, 1)

  // GET-оповещение (если в кабинете выбран GET) идёт тем же путём
  const viaGet = await t.app.inject({ method: 'GET', url: `/api/billing/webhook/freekassa?${new URLSearchParams(notice({ order: paymentId, amount: String(PRICES.media.month) }))}`, remoteAddress: FK_IP })
  assert.equal(viaGet.body, 'YES')

  // страница результата видит оплату
  assert.equal((await t.req('GET', `/api/billing/payments/${paymentId}`)).json().status, 'succeeded')
})

test('форма принимается только на оповещениях: на остальных путях 415, CSRF не обойти', async () => {
  const t = setup({ deps: { provider: freeKassaProvider(CFG) } })
  await t.register('victim')
  const r = await t.app.inject({
    method: 'POST',
    url: '/api/auth/password',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, 'x-requested-with': 'ruai' },
    payload: 'current=a&password=b',
  })
  assert.equal(r.statusCode, 415)
  const csrf = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, payload: 'x=1' })
  assert.equal(csrf.statusCode, 403)
})
