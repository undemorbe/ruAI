import { describe, expect, it } from 'vitest'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { AUTO_RENEW, CHECKOUT_CONSENTS, FK_METHOD, checkoutConsentOk, resultPaymentId } from '../payments'

const ID = 'pay_' + 'a'.repeat(20)

describe('оплата FreeKassa', () => {
  it('автопродления нет: при оплате нужно только согласие с условиями', () => {
    expect(AUTO_RENEW).toBe(false)
    expect(CHECKOUT_CONSENTS).toEqual(['terms'])
    expect(checkoutConsentOk({ version: LEGAL_VERSION, terms: true, recurring: false }, LEGAL_VERSION)).toBe(true)
    expect(checkoutConsentOk({ version: LEGAL_VERSION, terms: true }, LEGAL_VERSION)).toBe(true)
    expect(checkoutConsentOk({ version: 'old', terms: true, recurring: true }, LEGAL_VERSION)).toBe(false)
    expect(checkoutConsentOk({ version: LEGAL_VERSION, recurring: true }, LEGAL_VERSION)).toBe(false)
    expect(checkoutConsentOk(undefined, LEGAL_VERSION)).toBe(false)
  })

  it('способ оплаты предлагается FreeKassa: карта 36, СБП 42, SberPay на её странице', () => {
    expect(FK_METHOD).toEqual({ card: 36, sbp: 42, sberpay: null })
  })

  it('страница результата находит платёж: из адреса, из ответа FreeKassa или из последнего сохранённого', () => {
    expect(resultPaymentId({ paymentId: ID }, null)).toBe(ID)
    expect(resultPaymentId({ MERCHANT_ORDER_ID: ID }, null)).toBe(ID)
    expect(resultPaymentId({}, ID)).toBe(ID)
    expect(resultPaymentId({ paymentId: '../admin' }, ID)).toBe(ID)
    expect(resultPaymentId({ paymentId: ['x'] }, 'garbage')).toBeNull()
    expect(resultPaymentId({}, null)).toBeNull()
  })
})
