/**
 * FreeKassa (docs.freekassa.net). Магазин и секреты свои у ruAI (env на сервере), не из ai_miniapp.
 *
 *   Ссылка на оплату (SCI): <payUrl>?m&oa&currency=RUB&o&s=md5(m:oa:secret1:RUB:o)&em&lang[&i]
 *     em: email покупателя, на него FreeKassa отправляет кассовый чек (фискализация включается в кабинете).
 *   Оповещение: POST (form) или GET на /api/billing/webhook/freekassa:
 *     MERCHANT_ID, AMOUNT, intid, MERCHANT_ORDER_ID, P_EMAIL, SIGN = md5(MERCHANT_ID:AMOUNT:secret2:MERCHANT_ORDER_ID).
 *     Ответ «YES», иначе FreeKassa повторяет оповещение.
 *
 * Номер заказа o = наш paymentId, поэтому providerId платежа совпадает с ним.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { FK_METHOD } from '@/config/payments'
import type { PaymentProvider, ProviderEvent } from './billing.ts'

/** IP, с которых FreeKassa присылает оповещения (документация, раздел «Проверка IP»). */
export const FREEKASSA_IPS = ['168.119.157.136', '168.119.60.227', '178.154.197.79', '51.250.54.238']

export interface FreeKassaConfig {
  merchantId: string
  /** «Секретное слово»: подпись ссылки на оплату. */
  secret1: string
  /** «Секретное слово 2»: подпись оповещений. */
  secret2: string
  payUrl?: string
  /** Принимать оповещения только с IP FreeKassa (нужен X-Real-IP от nginx и trustProxy). */
  ipCheck?: boolean
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex')

/** Сумма в формате FreeKassa: целые рубли без копеек, иначе два знака. */
export const fkAmount = (a: number) => (Number.isInteger(a) ? String(a) : a.toFixed(2))

const PAY_ID = /^pay_[A-Za-z0-9_-]{20}$/

function safeEqual(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** Параметры оповещения: из тела формы или из query (если в кабинете выбран GET). */
function paramsOf(body: unknown, query: unknown): Record<string, string> {
  const src = body && typeof body === 'object' && Object.keys(body).length ? body : query
  const out: Record<string, string> = {}
  if (src && typeof src === 'object') for (const [k, v] of Object.entries(src)) if (typeof v === 'string') out[k] = v
  return out
}

export function freeKassaProvider(c: FreeKassaConfig): PaymentProvider {
  const m = c.merchantId
  const payUrl = c.payUrl ?? 'https://pay.fk.money/'

  return {
    name: 'freekassa',
    enabled: true,
    ack: 'YES',

    async create(p) {
      const oa = fkAmount(p.amount)
      const q = new URLSearchParams({
        m,
        oa,
        currency: 'RUB',
        o: p.paymentId,
        s: md5(`${m}:${oa}:${c.secret1}:RUB:${p.paymentId}`),
        em: p.email,
        lang: 'ru',
      })
      const i = FK_METHOD[p.method]
      if (i) q.set('i', String(i))
      return { providerId: p.paymentId, confirmationUrl: `${payUrl}?${q}` }
    },

    async parseWebhook(req): Promise<ProviderEvent | null> {
      if (c.ipCheck && !FREEKASSA_IPS.includes(req.ip)) return null
      const p = paramsOf(req.body, req.query)
      if (p.MERCHANT_ID !== m) return null
      const order = p.MERCHANT_ORDER_ID ?? ''
      const amount = p.AMOUNT ?? ''
      if (!PAY_ID.test(order) || !/^\d{1,7}(\.\d{1,2})?$/.test(amount)) return null
      const expect = md5(`${p.MERCHANT_ID}:${amount}:${c.secret2}:${order}`)
      if (!safeEqual((p.SIGN ?? '').toLowerCase(), expect)) return null
      return { providerId: order, status: 'succeeded', amount: Number(amount) }
    },
  }
}
