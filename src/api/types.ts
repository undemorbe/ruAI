/**
 * Data contracts shared between frontend and the future backend.
 * Keep these in sync with the OpenAPI schema once backend exists.
 */

export type ID = string
export type ISODate = string

// ---------- Auth / user ----------
export interface User {
  id: ID
  email: string | null
  name: string
  isGuest: boolean
  /** Последняя подписка. Может быть истёкшей — история чатов при этом сохраняется. */
  subscription: Subscription | null
}

/** Счётчики запросов. Считает только сервер; фронт лишь показывает. */
export interface Usage {
  /** Запросов на весь оплаченный период (общий лимит по всем чатам). */
  totalLimit: number
  totalUsed: number
  /** Суточный лимит; сбрасывается в 00:00 по Москве. */
  dailyLimit: number
  dailyUsed: number
  /** Момент следующего суточного сброса (полночь МСК). */
  dailyResetAt: ISODate
}

export interface Subscription {
  planId: PlanId
  startedAt: ISODate
  expiresAt: ISODate
  autoRenew: boolean
  usage: Usage
}

// ---------- Chat ----------
export type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: ID
  chatId: ID
  role: Role
  content: string
  createdAt: ISODate
  status?: 'streaming' | 'done' | 'error'
  /** Ответ упёрся в лимит выходных токенов — можно написать «Продолжи». */
  truncated?: boolean
}

export interface ChatSummary {
  id: ID
  title: string
  updatedAt: ISODate
  model: string
}

/** Только текст: загрузки файлов и изображений нет. */
export interface SendMessagePayload {
  chatId: ID | null
  content: string
  model: string
}

/**
 * Коды отказа сервера. Приходят в JSON-теле ошибки (`{ message, code, retryAfter? }`)
 * до начала стрима или в событии `error` внутри стрима.
 */
export type LimitCode =
  | 'no_subscription' // нет активной подписки
  | 'daily_limit' // исчерпан суточный лимит
  | 'total_limit' // исчерпан лимит периода
  | 'budget' // исчерпан внутренний бюджет API подписки
  | 'rate_limit' // > 5 запросов в минуту или > 50 в час
  | 'busy' // у пользователя уже выполняется запрос
  | 'too_long' // сообщение длиннее лимита входных токенов
  | 'upstream' // ошибка OpenRouter

/** Server-sent stream events (SSE `data:` lines carry JSON of this union). */
export type ChatStreamEvent =
  | { type: 'chat'; chat: ChatSummary }
  | { type: 'delta'; messageId: ID; text: string }
  | { type: 'done'; message: Message; usage?: Usage }
  | { type: 'error'; error: string; code?: LimitCode; retryAfter?: number }

// ---------- Billing ----------
export type PlanId = 'week' | 'month' | 'quarter'

export interface Plan {
  id: PlanId
  title: string
  periodDays: number
  price: number
  currency: 'RUB'
  /** Запросов на весь период. */
  requestsTotal: number
  /** Запросов в сутки. */
  requestsPerDay: number
  tagline: string
  features: { icon: string; text: string }[]
  popular?: boolean
}

export type PaymentMethod = 'card' | 'sbp' | 'sberpay'

export interface CheckoutRequest {
  planId: PlanId
  email: string
  method: PaymentMethod
}

export interface CheckoutSession {
  paymentId: ID
  /** URL of the payment provider page (YooKassa / CloudPayments / etc.) */
  confirmationUrl: string
}

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled'

export interface PaymentInfo {
  paymentId: ID
  status: PaymentStatus
  planId: PlanId
  amount: number
}
