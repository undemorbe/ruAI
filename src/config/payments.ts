import type { CheckoutConsent, PaymentMethod } from '@/api/types'

/**
 * Оплата через FreeKassa: разовые платежи, автосписаний у провайдера нет.
 * Общие для сайта, мока и сервера (сервер берёт файл через register.ts).
 */
export const PAYMENT_PROVIDER = 'freekassa'

/** Автопродление: false, пока провайдер не умеет списывать с сохранённой карты. */
export const AUTO_RENEW = false

/** Какие согласия обязательны при оплате. */
export const CHECKOUT_CONSENTS: readonly ('terms' | 'recurring')[] = AUTO_RENEW ? ['terms', 'recurring'] : ['terms']

export const checkoutConsentOk = (c: Partial<CheckoutConsent> | undefined, version: string): c is CheckoutConsent =>
  !!c && c.version === version && CHECKOUT_CONSENTS.every((k) => c[k] === true)

/**
 * Способ оплаты, который FreeKassa предложит первым (параметр i): 36 карта RUB, 42 СБП.
 * null: покупатель выбирает на странице FreeKassa.
 */
export const FK_METHOD: Record<PaymentMethod, number | null> = { card: 36, sbp: 42, sberpay: null }

/** Ключ sessionStorage: номер последнего платежа, если FreeKassa вернёт на сайт без него. */
export const LAST_PAYMENT_KEY = 'ruai.lastPayment'

const PAY_ID = /^pay_[A-Za-z0-9_-]{20}$/

/** Номер платежа для страницы результата: из адреса (наш paymentId или MERCHANT_ORDER_ID от FreeKassa), иначе последний сохранённый. */
export function resultPaymentId(query: Record<string, unknown>, stored: string | null): string | null {
  for (const v of [query.paymentId, query.MERCHANT_ORDER_ID, stored]) if (typeof v === 'string' && PAY_ID.test(v)) return v
  return null
}
