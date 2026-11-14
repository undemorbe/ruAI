import { http, readSSE } from '../http'
import type { AuthService, BillingService, ChatService } from './contracts'
import type {
  ChatStreamEvent,
  ChatSummary,
  ImageRef,
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
 *   POST   /uploads                 multipart file -> ImageRef (тариф с изображениями)
 *   POST   /chats/messages          SendMessagePayload -> text/event-stream<ChatStreamEvent>
 *   PATCH  /chats/:id               { title }
 *   DELETE /chats/:id
 *
 *   GET    /billing/plans?tier=     -> Plan[]
 *   POST   /billing/checkout        CheckoutRequest -> CheckoutSession
 *   GET    /billing/payments/:id    -> PaymentInfo
 *
 *   Админка — отдельный бандл и отдельный сервер (server/), см. README «Админка».
 *
 * POST /chats/messages — правила (всё проверяет сервер, см. README «Экономика»):
 *   - модель по тарифу: text — openai/gpt-oss-20b, media — GPT-5.6 Luna (и анализ фото),
 *     генерация — OpenRouter Image Generation; ключ OpenRouter только на сервере;
 *   - фото и mode:'image' только в тарифе media; генерации — отдельный счётчик и лимит;
 *   - ошибка без результата — запрос не списывается;
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
  upload(file) {
    const body = new FormData()
    body.append('file', file)
    return http.post<ImageRef>('/uploads', body, { timeoutMs: 60_000 })
  },
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
