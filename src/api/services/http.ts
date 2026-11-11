import { http, readSSE } from '../http'
import type { AuthService, BillingService, ChatService } from './contracts'
import type {
  ChatStreamEvent,
  ChatSummary,
  CheckoutSession,
  Message,
  PaymentInfo,
  Plan,
  User,
} from '../types'

/**
 * REST implementations. Endpoint map (to implement on backend):
 *
 *   GET    /auth/me                 -> User
 *   POST   /auth/code               { email }
 *   POST   /auth/verify             { email, code } -> { user, token }
 *   POST   /auth/logout
 *
 *   GET    /chats                   -> ChatSummary[]
 *   GET    /chats/:id/messages      -> Message[]
 *   POST   /chats/messages          SendMessagePayload -> text/event-stream<ChatStreamEvent>
 *   PATCH  /chats/:id               { title }
 *   DELETE /chats/:id
 *
 *   GET    /billing/plans?tier=     -> Plan[]
 *   POST   /billing/checkout        CheckoutRequest -> CheckoutSession
 *   GET    /billing/payments/:id    -> PaymentInfo
 */

export const httpAuth: AuthService = {
  me: () => http.get<User>('/auth/me'),
  requestCode: (email) => http.post('/auth/code', { email }),
  verifyCode: (email, code) => http.post('/auth/verify', { email, code }),
  logout: () => http.post('/auth/logout'),
}

export const httpChat: ChatService = {
  list: () => http.get<ChatSummary[]>('/chats'),
  messages: (chatId) => http.get<Message[]>(`/chats/${chatId}/messages`),
  async *send(payload, signal) {
    const res = await http.raw('/chats/messages', {
      method: 'POST',
      body: payload,
      signal,
      timeoutMs: 120_000,
      headers: { Accept: 'text/event-stream' },
    })
    yield* readSSE<ChatStreamEvent>(res)
  },
  rename: (chatId, title) => http.patch(`/chats/${chatId}`, { title }),
  remove: (chatId) => http.del(`/chats/${chatId}`),
}

export const httpBilling: BillingService = {
  plans: (tier) => http.get<Plan[]>(`/billing/plans?tier=${tier}`),
  checkout: (req) => http.post<CheckoutSession>('/billing/checkout', req),
  payment: (id) => http.get<PaymentInfo>(`/billing/payments/${id}`),
}
