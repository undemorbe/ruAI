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
  subscription: Subscription | null
}

export interface Subscription {
  planId: PlanId
  tier: PlanTier
  expiresAt: ISODate
  autoRenew: boolean
}

// ---------- Chat ----------
export type Role = 'user' | 'assistant' | 'system'

export interface Attachment {
  id: ID
  name: string
  size: number
  mime: string
}

export interface Message {
  id: ID
  chatId: ID
  role: Role
  content: string
  createdAt: ISODate
  attachments?: Attachment[]
  status?: 'streaming' | 'done' | 'error'
}

export interface ChatSummary {
  id: ID
  title: string
  updatedAt: ISODate
  model: string
}

export interface SendMessagePayload {
  chatId: ID | null
  content: string
  model: string
  attachments?: Attachment[]
}

/** Server-sent stream events (SSE `data:` lines carry JSON of this union). */
export type ChatStreamEvent =
  | { type: 'chat'; chat: ChatSummary }
  | { type: 'delta'; messageId: ID; text: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; error: string }

// ---------- Billing ----------
export type PlanId = 'week' | 'month' | 'quarter'
export type PlanTier = 'text' | 'media'

export interface Plan {
  id: PlanId
  tier: PlanTier
  title: string
  periodDays: number
  price: number
  oldPrice: number
  currency: 'RUB'
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
