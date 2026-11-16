import { getPlans } from './plans'

/**
 * Заголовки главной с ключевыми фразами. Общие для Vue-лендинга (WordsLanding) и
 * статической разметки для роботов (src/seo/static.ts), чтобы H1/H2 совпадали.
 */
const week = getPlans()[0]!

export const landingSeo = {
  h1: 'ChatGPT на русском без VPN',
  sub: `Чат GPT онлайн прямо в браузере. 7 дней: ${week.price} ₽ за ${week.requestsTotal} запросов, оплата российской картой МИР или через СБП.`,
  hWhat: 'Что умеет ChatGPT на русском',
  hReviews: 'Что говорят словами',
  hPrice: 'Цены в рублях',
  hFaq: 'Вопросы о ChatGPT',
}

/** Пункты навигации, которые поисковик может взять в быстрые ссылки. */
export const MAIN_NAV = [
  { to: '/pricing', label: 'Тарифы' },
  { to: '/payment', label: 'Оплата в рублях' },
  { to: '/faq', label: 'Вопросы' },
] as const

export const PRICING_INTRO = 'Выберите период. Все тарифы работают без VPN, на русском и с оплатой российскими картами.'
export const FAQ_INTRO = 'Коротко о доступе без VPN, оплате российской картой, тарифах и подписке.'
