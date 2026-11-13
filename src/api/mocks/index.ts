import { PLAN_TABLE, getPlans } from '@/content/plans'
import { CONTINUE_PROMPT, LIMITS } from '@/config/app'
import { storage } from '@/lib/storage'
import { sleep, uid } from '@/lib/id'
import { buildContext, estimateTokens, freshUsage, limitMessage, nextMskMidnight, rateWait } from '@/lib/limits'
import { ApiError } from '../http'
import type { AuthService, BillingService, ChatService } from '../services/contracts'
import type { ChatSummary, LimitCode, Message, PaymentInfo, PlanId, Subscription, User } from '../types'

/**
 * In-browser mock backend. Persists to localStorage so the UI feels real
 * before the backend exists. Swap via VITE_USE_MOCKS=false + VITE_API_URL.
 * Повторяет серверные правила экономики (лимиты, частота, один запрос за раз),
 * чтобы интерфейс можно было проверить без бэкенда.
 */

const K = {
  chats: 'ruai.mock.chats',
  msgs: 'ruai.mock.msgs',
  user: 'ruai.mock.user',
  pay: 'ruai.mock.payments',
  rate: 'ruai.mock.rate',
  spend: 'ruai.mock.spend',
}

/** Ориентировочные цены OpenRouter для gpt-oss-20b, $ за 1 млн токенов. На сервере берётся `usage.cost` из ответа. */
const PRICE_PER_M = { input: 0.03, output: 0.15 }

const guest = (): User => ({ id: 'guest', email: null, name: 'Гость', isGuest: true, subscription: null })
const loadUser = () => storage.get<User>(K.user, guest())

export function newSubscription(planId: PlanId, now = new Date()): Subscription {
  const p = PLAN_TABLE[planId]
  return {
    planId,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + p.periodDays * 86_400_000).toISOString(),
    autoRenew: false,
    usage: {
      totalLimit: p.requestsTotal,
      totalUsed: 0,
      dailyLimit: p.requestsPerDay,
      dailyUsed: 0,
      dailyResetAt: nextMskMidnight(now).toISOString(),
    },
  }
}

export const mockAuth: AuthService = {
  async me() {
    await sleep(120)
    const user = loadUser()
    // суточный сброс виден сразу, даже без нового запроса
    if (user.subscription) user.subscription.usage = freshUsage(user.subscription.usage, new Date())
    return user
  },
  async requestCode() {
    await sleep(400)
  },
  async verifyCode(email) {
    await sleep(400)
    const prev = loadUser()
    const user: User = { ...prev, id: prev.isGuest ? uid('u_') : prev.id, email, name: email.split('@')[0] ?? email, isGuest: false }
    storage.set(K.user, user)
    return { user, token: 'mock-token' }
  },
  async logout() {
    storage.remove(K.user)
  },
}

function loadChats() {
  return storage.get<ChatSummary[]>(K.chats, [])
}
function loadMsgs() {
  return storage.get<Record<string, Message[]>>(K.msgs, {})
}

const STATUS: Record<LimitCode, number> = {
  no_subscription: 402,
  total_limit: 402,
  budget: 402,
  daily_limit: 429,
  rate_limit: 429,
  busy: 409,
  too_long: 413,
  upstream: 502,
}
const refuse = (code: LimitCode, retryAfter?: number) =>
  new ApiError(limitMessage(code, retryAfter), STATUS[code], code, retryAfter)

const SAMPLE_REPLIES = [
  (q: string) =>
    `Хороший вопрос! Разберём по шагам.\n\n1. Сначала уточним цель: «${q.slice(0, 60)}».\n2. Затем соберём факты и ограничения.\n3. И наконец сформулируем решение.\n\nЭто демо-ответ: бэкенд ещё не подключён, но интерфейс уже работает в режиме потоковой генерации.`,
  () =>
    'Вот пример на TypeScript:\n\n```ts\nexport function greet(name: string): string {\n  return `Привет, ${name}!`\n}\n```\n\nФункция чистая и легко тестируется. Нужно добавить что-то ещё?',
  () =>
    'Коротко: да, это возможно. Подробнее — когда подключим настоящую модель. Сейчас вы видите мок-сервис, который имитирует поток токенов так же, как будет делать сервер через SSE.',
]
/** Демо обрезанного ответа: просьба «подробно» упирается в лимит выходных токенов. */
const LONG_REPLY =
  'Подробный разбор, часть первая.\n\n1. Контекст. Модель видит не больше 20 последних сообщений чата, поэтому длинные беседы лучше дробить на темы.\n2. Объём. На один ответ отводится до 16 000 токенов — этого хватает на большую статью, но не на книгу.\n3. Если ответ оборвался, напишите «Продолжи», и модель допишет с того же места.\n\nТеперь перейдём к деталям: первое, на что стоит'
const CONTINUE_REPLY = '…обратить внимание, — формулировка задачи. Чем точнее вопрос, тем короче и полезнее ответ. На этом разбор закончен.'

let inFlight = false

export const mockChat: ChatService = {
  async list() {
    await sleep(80)
    return loadChats().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async messages(chatId) {
    await sleep(80)
    return loadMsgs()[chatId] ?? []
  },
  async *send(payload, signal) {
    const now = new Date()
    const user = loadUser()
    const sub = user.subscription

    // ---- проверки до вызова модели (порядок как на сервере) ----
    if (!sub || Date.parse(sub.expiresAt) <= now.getTime()) throw refuse('no_subscription')
    sub.usage = freshUsage(sub.usage, now)
    if (sub.usage.totalUsed >= sub.usage.totalLimit) throw refuse('total_limit')
    if (sub.usage.dailyUsed >= sub.usage.dailyLimit) throw refuse('daily_limit')
    if (inFlight) throw refuse('busy')
    const rate = storage.get<number[]>(K.rate, []).filter((t) => now.getTime() - t < 3_600_000)
    const wait = rateWait(rate, now.getTime())
    if (wait > 0) throw refuse('rate_limit', wait)
    if (estimateTokens(payload.content) > LIMITS.inputTokens) throw refuse('too_long')

    // ---- запрос принят: списываем его ----
    sub.usage.totalUsed++
    sub.usage.dailyUsed++
    storage.set(K.user, user)
    storage.set(K.rate, [...rate, now.getTime()])
    inFlight = true

    try {
      const iso = now.toISOString()
      const chats = loadChats()
      const msgs = loadMsgs()

      let chat = chats.find((c) => c.id === payload.chatId)
      if (!chat) {
        chat = { id: uid('c_'), title: payload.content.slice(0, 48) || 'Новый чат', updatedAt: iso, model: payload.model }
        chats.push(chat)
      }
      chat.updatedAt = iso
      yield { type: 'chat', chat: { ...chat } }

      const userMsg: Message = { id: uid('m_'), chatId: chat.id, role: 'user', content: payload.content, createdAt: iso, status: 'done' }
      const list = (msgs[chat.id] ??= [])
      list.push(userMsg)
      // в модель ушло бы только это окно; в «БД» хранится вся история
      const context = buildContext(list)

      const replyId = uid('m_')
      const isContinue = payload.content.trim().toLowerCase() === CONTINUE_PROMPT.toLowerCase()
      const truncated = !isContinue && /подробн|полностью|целиком/i.test(payload.content)
      const full = isContinue
        ? CONTINUE_REPLY
        : truncated
          ? LONG_REPLY
          : SAMPLE_REPLIES[list.length % SAMPLE_REPLIES.length]!(payload.content)
      const tokens = full.match(/\S+\s*|\s+/g) ?? [full]

      await sleep(450, signal)
      let text = ''
      try {
        for (const t of tokens) {
          await sleep(18 + Math.random() * 40, signal)
          text += t
          yield { type: 'delta', messageId: replyId, text: t }
        }
      } finally {
        const reply: Message = {
          id: replyId,
          chatId: chat.id,
          role: 'assistant',
          content: text,
          createdAt: new Date().toISOString(),
          status: 'done',
          ...(truncated && text === full ? { truncated: true } : {}),
        }
        list.push(reply)
        storage.set(K.chats, chats)
        storage.set(K.msgs, msgs)

        // фактическая стоимость запроса — для бюджета подписки и админки
        const inTok = context.reduce((s, m) => s + estimateTokens(m.content), 0)
        const outTok = estimateTokens(text)
        const spend = storage.get<object[]>(K.spend, [])
        spend.push({ userId: user.id, chatId: chat.id, at: iso, inTok, outTok, costUsd: (inTok * PRICE_PER_M.input + outTok * PRICE_PER_M.output) / 1e6 })
        storage.set(K.spend, spend.slice(-500))

        if (text === full) yield { type: 'done', message: reply, usage: { ...sub.usage } }
      }
    } finally {
      inFlight = false
    }
  },
  async rename(chatId, title) {
    const chats = loadChats()
    const c = chats.find((x) => x.id === chatId)
    if (c) c.title = title
    storage.set(K.chats, chats)
  },
  async remove(chatId) {
    storage.set(K.chats, loadChats().filter((c) => c.id !== chatId))
    const msgs = loadMsgs()
    delete msgs[chatId]
    storage.set(K.msgs, msgs)
  },
}

export const mockBilling: BillingService = {
  async plans() {
    await sleep(150)
    return getPlans()
  },
  async checkout(req) {
    await sleep(700)
    const plan = getPlans().find((p) => p.id === req.planId)
    if (!plan) throw new Error('Тариф не найден')
    const paymentId = uid('pay_')
    const payments = storage.get<Record<string, PaymentInfo>>(K.pay, {})
    payments[paymentId] = { paymentId, status: 'succeeded', planId: plan.id, amount: plan.price }
    storage.set(K.pay, payments)

    // Успешная оплата открывает новый период: общий счётчик с нуля. Суточный сбрасывается
    // только в полночь по Москве, поэтому сегодняшние запросы переносятся.
    const prev = loadUser()
    const sub = newSubscription(plan.id)
    const old = prev.subscription && freshUsage(prev.subscription.usage, new Date())
    if (old) sub.usage.dailyUsed = Math.min(old.dailyUsed, sub.usage.dailyLimit)
    storage.set(K.user, {
      ...prev,
      id: prev.isGuest ? uid('u_') : prev.id,
      email: req.email,
      name: prev.isGuest ? (req.email.split('@')[0] ?? req.email) : prev.name,
      isGuest: false,
      subscription: sub,
    } satisfies User)

    // Real backend returns the provider's hosted payment page URL.
    return { paymentId, confirmationUrl: `${import.meta.env.BASE_URL}payment/result?paymentId=${paymentId}` }
  },
  async payment(paymentId) {
    await sleep(600)
    const p = storage.get<Record<string, PaymentInfo>>(K.pay, {})[paymentId]
    if (!p) throw new Error('Платёж не найден')
    return p
  },
}
