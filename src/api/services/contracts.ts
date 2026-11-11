import type {
  ChatStreamEvent,
  ChatSummary,
  CheckoutRequest,
  CheckoutSession,
  ID,
  Message,
  PaymentInfo,
  Plan,
  PlanTier,
  SendMessagePayload,
  User,
} from '../types'

/** Each service has an HTTP implementation and a mock one with the same contract. */

export interface AuthService {
  me(): Promise<User>
  requestCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<{ user: User; token: string }>
  logout(): Promise<void>
}

export interface ChatService {
  list(): Promise<ChatSummary[]>
  messages(chatId: ID): Promise<Message[]>
  send(payload: SendMessagePayload, signal?: AbortSignal): AsyncIterable<ChatStreamEvent>
  rename(chatId: ID, title: string): Promise<void>
  remove(chatId: ID): Promise<void>
}

export interface BillingService {
  plans(tier: PlanTier): Promise<Plan[]>
  checkout(req: CheckoutRequest): Promise<CheckoutSession>
  payment(paymentId: ID): Promise<PaymentInfo>
}
