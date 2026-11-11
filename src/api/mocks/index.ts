import { getPlans } from '@/content/plans'
import { storage } from '@/lib/storage'
import { sleep, uid } from '@/lib/id'
import type { AuthService, BillingService, ChatService } from '../services/contracts'
import type { ChatSummary, Message, PaymentInfo, User } from '../types'

/**
 * In-browser mock backend. Persists to localStorage so the UI feels real
 * before the backend exists. Swap via VITE_USE_MOCKS=false + VITE_API_URL.
 */

const K = { chats: 'ruai.mock.chats', msgs: 'ruai.mock.msgs', user: 'ruai.mock.user', pay: 'ruai.mock.payments' }

const guest = (): User => ({ id: 'guest', email: null, name: 'Гость', isGuest: true, subscription: null })

export const mockAuth: AuthService = {
  async me() {
    await sleep(120)
    return storage.get<User>(K.user, guest())
  },
  async requestCode() {
    await sleep(400)
  },
  async verifyCode(email) {
    await sleep(400)
    const user: User = { ...storage.get<User>(K.user, guest()), id: uid('u_'), email, name: email.split('@')[0] ?? email, isGuest: false }
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

const SAMPLE_REPLIES = [
  (q: string) =>
    `Хороший вопрос! Разберём по шагам.\n\n1. Сначала уточним цель: «${q.slice(0, 60)}».\n2. Затем соберём факты и ограничения.\n3. И наконец сформулируем решение.\n\nЭто демо-ответ: бэкенд ещё не подключён, но интерфейс уже работает в режиме потоковой генерации.`,
  () =>
    'Вот пример на TypeScript:\n\n```ts\nexport function greet(name: string): string {\n  return `Привет, ${name}!`\n}\n```\n\nФункция чистая и легко тестируется. Нужно добавить что-то ещё?',
  () =>
    'Коротко: да, это возможно. Подробнее — когда подключим настоящую модель. Сейчас вы видите мок-сервис, который имитирует поток токенов так же, как будет делать сервер через SSE.',
]

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
    const now = new Date().toISOString()
    const chats = loadChats()
    const msgs = loadMsgs()

    let chat = chats.find((c) => c.id === payload.chatId)
    if (!chat) {
      chat = { id: uid('c_'), title: payload.content.slice(0, 48) || 'Новый чат', updatedAt: now, model: payload.model }
      chats.push(chat)
    }
    chat.updatedAt = now
    yield { type: 'chat', chat: { ...chat } }

    const userMsg: Message = { id: uid('m_'), chatId: chat.id, role: 'user', content: payload.content, createdAt: now, attachments: payload.attachments, status: 'done' }
    const list = (msgs[chat.id] ??= [])
    list.push(userMsg)

    const replyId = uid('m_')
    const pick = SAMPLE_REPLIES[list.length % SAMPLE_REPLIES.length]!
    const full = pick(payload.content)
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
      const reply: Message = { id: replyId, chatId: chat.id, role: 'assistant', content: text, createdAt: new Date().toISOString(), status: 'done' }
      list.push(reply)
      storage.set(K.chats, chats)
      storage.set(K.msgs, msgs)
      if (text === full) yield { type: 'done', message: reply }
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
  async plans(tier) {
    await sleep(150)
    return getPlans(tier)
  },
  async checkout(req) {
    await sleep(700)
    const plan = getPlans(req.tier).find((p) => p.id === req.planId)
    if (!plan) throw new Error('Тариф не найден')
    const paymentId = uid('pay_')
    const payments = storage.get<Record<string, PaymentInfo>>(K.pay, {})
    payments[paymentId] = { paymentId, status: 'succeeded', planId: plan.id, tier: plan.tier, amount: plan.price }
    storage.set(K.pay, payments)
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
