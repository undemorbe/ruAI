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
 *   GET    /chats/:id/messages      -> Message[]          (полная история, хранится в БД)
 *   POST   /chats/messages          SendMessagePayload -> text/event-stream<ChatStreamEvent>
 *   PATCH  /chats/:id               { title }
 *   DELETE /chats/:id
 *
 *   GET    /billing/plans           -> Plan[]
 *   POST   /billing/checkout        CheckoutRequest -> CheckoutSession
 *   GET    /billing/payments/:id    -> PaymentInfo
 *
 *   GET    /admin/usage             -> расход API по пользователям (только админ)
 *
 * POST /chats/messages — правила (всё проверяет сервер, см. README «Экономика»):
 *   - модель одна: openai/gpt-oss-20b через OpenRouter; ключ OpenRouter только на сервере;
 *   - только текст, без файлов и изображений;
 *   - в модель уходят ≤ 20 последних сообщений чата; если они > 16 000 входных токенов,
 *     старые отбрасываются; max_tokens ответа = 16 000; полная история пишется в БД;
 *   - 1 одновременный запрос на пользователя, ≤ 5 в минуту, ≤ 50 в час;
 *   - суточный лимит (сброс 00:00 МСК) и лимит периода (сброс после оплаты нового периода),
 *     общие для всех чатов;
 *   - фактическая стоимость каждого запроса пишется в БД; при исчерпании внутреннего
 *     бюджета подписки новые запросы блокируются;
 *   - отказ до стрима: HTTP 402/409/413/429 с телом { message, code: LimitCode, retryAfter? };
 *   - `done` несёт актуальный Usage и `message.truncated`, если ответ упёрся в лимит токенов
 *     (пользователь пишет «Продолжи» — это новый запрос).
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
  plans: () => http.get<Plan[]>('/billing/plans'),
  checkout: (req) => http.post<CheckoutSession>('/billing/checkout', req),
  payment: (id) => http.get<PaymentInfo>(`/billing/payments/${id}`),
}
