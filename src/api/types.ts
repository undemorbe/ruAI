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
  /** Генерации изображений — отдельный счётчик (только тариф с изображениями). */
  generationsUsed: number
  /** Лимит генераций на период; null — без отдельного лимита. Задаётся в админке. */
  generationsLimit: number | null
  /** Генерация временно отключена в админке. */
  generationEnabled: boolean
}

export interface Subscription {
  planId: PlanId
  tier: PlanTier
  startedAt: ISODate
  expiresAt: ISODate
  autoRenew: boolean
  usage: Usage
}

// ---------- Chat ----------
export type Role = 'user' | 'assistant' | 'system'

/** Фото пользователя или сгенерированная картинка. Хранится в истории чата. */
export interface ImageRef {
  id: ID
  url: string
  mime: string
  width?: number
  height?: number
  source: 'upload' | 'generated'
}

export interface Message {
  id: ID
  chatId: ID
  role: Role
  content: string
  createdAt: ISODate
  images?: ImageRef[]
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

/**
 * Модель выбирает сервер по тарифу подписки — клиент её не передаёт.
 * `images` — id фото, загруженных через POST /uploads (только тариф с изображениями).
 * `mode: 'image'` — сгенерировать картинку; вместе с фото — отредактировать его.
 */
export interface SendMessagePayload {
  chatId: ID | null
  content: string
  images?: ID[]
  mode?: 'chat' | 'image'
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
  | 'media_required' // фото и картинки — только в тарифе с изображениями
  | 'generation_limit' // исчерпан лимит генераций
  | 'generation_disabled' // генерация отключена в админке
  | 'bad_image' // файл не изображение или слишком большой
  | 'upstream' // ошибка OpenRouter

/** Server-sent stream events (SSE `data:` lines carry JSON of this union). */
export type ChatStreamEvent =
  | { type: 'chat'; chat: ChatSummary }
  | { type: 'delta'; messageId: ID; text: string }
  | { type: 'image'; messageId: ID; image: ImageRef }
  | { type: 'done'; message: Message; usage?: Usage }
  | { type: 'error'; error: string; code?: LimitCode; retryAfter?: number }

// ---------- Billing ----------
export type PlanId = 'week' | 'month' | 'quarter'
/** text — только текст; media — анализ фото и генерация изображений. */
export type PlanTier = 'text' | 'media'

export interface Plan {
  id: PlanId
  tier: PlanTier
  /** Название модели для витрины. */
  model: string
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
  tier: PlanTier
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
  tier: PlanTier
  amount: number
}

// ---------- Admin settings (читает сервер при каждом запросе) ----------
export interface AdminSettings {
  /** Глобальный выключатель генерации изображений. */
  generationEnabled: boolean
  /** Лимит генераций на период подписки; null — без отдельного лимита. */
  generationLimits: Record<PlanId, number | null>
  /** Внутренний бюджет API на одну подписку, ₽. */
  budgetsRub: Record<PlanTier, Record<PlanId, number>>
  /** Курс для пересчёта расходов OpenRouter ($) в рубли. */
  usdRub: number
}
