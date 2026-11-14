import { PLAN_TABLE, PRICES, getPlan, getPlans } from '@/content/plans'
import { CONTINUE_PROMPT, LIMITS, UPLOAD } from '@/config/app'
import { storage } from '@/lib/storage'
import { sleep, uid } from '@/lib/id'
import { buildContext, estimateTokens, freshUsage, limitMessage, nextMskMidnight, rateWait } from '@/lib/limits'
import { ApiError } from '../http'
import type { AuthService, BillingService, ChatService } from '../services/contracts'
import type {
  AdminSettings,
  ChatSummary,
  ImageRef,
  LimitCode,
  Message,
  PaymentInfo,
  PlanId,
  PlanTier,
  Subscription,
  User,
} from '../types'

/**
 * In-browser mock backend. Persists to localStorage so the UI feels real
 * before the backend exists. Swap via VITE_USE_MOCKS=false + VITE_API_URL.
 * Повторяет серверные правила экономики (лимиты, частота, один запрос за раз,
 * бюджет подписки, генерации), чтобы интерфейс можно было проверить без бэкенда.
 */

export const K = {
  chats: 'ruai.mock.chats',
  msgs: 'ruai.mock.msgs',
  user: 'ruai.mock.user',
  pay: 'ruai.mock.payments',
  rate: 'ruai.mock.rate',
  ledger: 'ruai.mock.ledger',
  images: 'ruai.mock.images',
  settings: 'ruai.mock.admin.settings',
}

/**
 * Ориентировочные цены OpenRouter, $ за 1 млн токенов и $ за картинку.
 * На сервере берётся фактическая стоимость (`usage.cost`) из ответа OpenRouter.
 */
export const COST = {
  text: { input: 0.03, output: 0.15 },
  media: { input: 1.25, output: 10 },
  imageGeneration: 0.04,
  /** Входные токены на одно фото при анализе. */
  photoTokens: 1100,
}

export const defaultSettings = (): AdminSettings => ({
  generationEnabled: true,
  generationLimits: { week: null, month: null, quarter: null },
  // по умолчанию 40% цены подписки; меняется в админке
  budgetsRub: {
    text: { week: 155, month: 395, quarter: 752 },
    media: { week: 315, month: 795, quarter: 1552 },
  },
  usdRub: 95,
})
export const loadSettings = () => ({ ...defaultSettings(), ...storage.get<Partial<AdminSettings>>(K.settings, {}) })

/** Внутренний учёт подписки: бюджет и фактические расходы. Пользователю не отдаётся. */
export interface Ledger {
  tier: PlanTier
  planId: PlanId
  budgetRub: number
  spentTextUsd: number
  spentImageUsd: number
  tokensIn: number
  tokensOut: number
  generations: number
  errors: number
}
const loadLedger = () => storage.get<Ledger | null>(K.ledger, null)

const guest = (): User => ({ id: 'guest', email: null, name: 'Гость', isGuest: true, subscription: null })
const loadUser = () => storage.get<User>(K.user, guest())

export function newSubscription(planId: PlanId, tier: PlanTier = 'text', now = new Date(), settings = loadSettings()): Subscription {
  const p = PLAN_TABLE[planId]
  return {
    planId,
    tier,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + p.periodDays * 86_400_000).toISOString(),
    autoRenew: false,
    usage: {
      totalLimit: p.requestsTotal,
      totalUsed: 0,
      dailyLimit: p.requestsPerDay,
      dailyUsed: 0,
      dailyResetAt: nextMskMidnight(now).toISOString(),
      generationsUsed: 0,
      generationsLimit: tier === 'media' ? settings.generationLimits[planId] : 0,
      generationEnabled: tier === 'media' && settings.generationEnabled,
    },
  }
}

export function newLedger(planId: PlanId, tier: PlanTier, settings = loadSettings()): Ledger {
  return { tier, planId, budgetRub: settings.budgetsRub[tier][planId], spentTextUsd: 0, spentImageUsd: 0, tokensIn: 0, tokensOut: 0, generations: 0, errors: 0 }
}

/** Актуальные настройки админки поверх счётчиков пользователя. */
function withSettings(sub: Subscription, s: AdminSettings): Subscription {
  sub.usage.generationEnabled = sub.tier === 'media' && s.generationEnabled
  sub.usage.generationsLimit = sub.tier === 'media' ? s.generationLimits[sub.planId] : 0
  return sub
}

export const mockAuth: AuthService = {
  async me() {
    await sleep(120)
    const user = loadUser()
    // суточный сброс и настройки админки видны сразу, даже без нового запроса
    if (user.subscription) {
      user.subscription.tier ??= 'text'
      user.subscription.usage = freshUsage(user.subscription.usage, new Date())
      withSettings(user.subscription, loadSettings())
    }
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
  media_required: 402,
  generation_limit: 402,
  generation_disabled: 403,
  daily_limit: 429,
  rate_limit: 429,
  busy: 409,
  too_long: 413,
  bad_image: 415,
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
  'Подробный разбор, часть первая.\n\n1. Начнём с главного: сформулируйте задачу одним предложением.\n2. Затем выпишите, что уже известно и что нужно получить.\n3. Разбейте путь на шаги, у каждого — понятный результат.\n\nТеперь перейдём к деталям: первое, на что стоит'
const CONTINUE_REPLY = '…обратить внимание, — формулировка задачи. Чем точнее вопрос, тем короче и полезнее ответ. На этом разбор закончен.'
const PHOTO_REPLY = (n: number) =>
  `${n > 1 ? `Смотрю на ${n} фото.` : 'Смотрю на фото.'} Это демо-ответ: настоящий анализ сделает модель после подключения бэкенда.\n\nНа снимке можно распознать объекты, текст и детали, объяснить, что происходит, и ответить на вопросы по изображению.`

/** Демо-картинка вместо настоящей генерации: SVG с текстом запроса. */
function demoImage(prompt: string): ImageRef {
  const hue = [...prompt].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  const words = prompt.replace(/[<>&"]/g, '').slice(0, 60)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 140) % 360} 65% 30%)"/></linearGradient></defs><rect width="768" height="768" fill="url(#g)"/><circle cx="520" cy="250" r="150" fill="hsl(${(hue + 60) % 360} 80% 70% / .55)"/><circle cx="260" cy="520" r="210" fill="hsl(${(hue + 200) % 360} 70% 45% / .45)"/><text x="48" y="700" font-family="sans-serif" font-size="30" fill="#fff">${words}</text><text x="48" y="80" font-family="sans-serif" font-size="22" fill="#fff" opacity=".8">демо-генерация</text></svg>`
  return { id: uid('img_'), url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mime: 'image/svg+xml', width: 768, height: 768, source: 'generated' }
}

/** Сжимает фото до 1024px JPEG, чтобы уместить в localStorage. Без canvas — как есть. */
async function shrink(file: File): Promise<{ url: string; width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return { url: c.toDataURL('image/jpeg', 0.82), width: c.width, height: c.height }
  } catch {
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(r.error)
      r.readAsDataURL(file)
    })
    return { url }
  }
}

function activeSub(now = new Date()) {
  const user = loadUser()
  const sub = user.subscription
  if (!sub || Date.parse(sub.expiresAt) <= now.getTime()) return null
  sub.tier ??= 'text'
  return { user, sub }
}

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
  async upload(file) {
    const s = activeSub()
    if (!s) throw refuse('no_subscription')
    if (s.sub.tier !== 'media') throw refuse('media_required')
    if (!file.type.startsWith('image/') || file.size > UPLOAD.maxBytes) throw refuse('bad_image')
    const { url, width, height } = await shrink(file)
    const img: ImageRef = { id: uid('up_'), url, mime: url.startsWith('data:image/jpeg') ? 'image/jpeg' : file.type, width, height, source: 'upload' }
    const all = storage.get<Record<string, ImageRef>>(K.images, {})
    all[img.id] = img
    storage.set(K.images, all)
    return img
  },
  async *send(payload, signal) {
    const now = new Date()
    const settings = loadSettings()
    const s = activeSub(now)
    const wantsImage = payload.mode === 'image'
    const photos = payload.images ?? []

    // ---- проверки до вызова модели (порядок как на сервере) ----
    if (!s) throw refuse('no_subscription')
    const { user, sub } = s
    sub.usage = freshUsage(sub.usage, now)
    withSettings(sub, settings)
    const ledger = loadLedger() ?? newLedger(sub.planId, sub.tier, settings)
    if (sub.usage.totalUsed >= sub.usage.totalLimit) throw refuse('total_limit')
    if (sub.usage.dailyUsed >= sub.usage.dailyLimit) throw refuse('daily_limit')
    if ((ledger.spentTextUsd + ledger.spentImageUsd) * settings.usdRub >= ledger.budgetRub) throw refuse('budget')
    if ((wantsImage || photos.length) && sub.tier !== 'media') throw refuse('media_required')
    if (wantsImage && !settings.generationEnabled) throw refuse('generation_disabled')
    const genLimit = sub.usage.generationsLimit
    if (wantsImage && genLimit !== null && sub.usage.generationsUsed >= genLimit) throw refuse('generation_limit')
    if (inFlight) throw refuse('busy')
    const rate = storage.get<number[]>(K.rate, []).filter((t) => now.getTime() - t < 3_600_000)
    const wait = rateWait(rate, now.getTime())
    if (wait > 0) throw refuse('rate_limit', wait)
    if (estimateTokens(payload.content) > LIMITS.inputTokens) throw refuse('too_long')
    const stored = storage.get<Record<string, ImageRef>>(K.images, {})
    const attached = photos.map((id) => stored[id]).filter((x): x is ImageRef => !!x)
    if (attached.length !== photos.length) throw refuse('bad_image')

    // ---- запрос принят: резервируем; без результата вернём ----
    const charge = (d: 1 | -1) => {
      sub.usage.totalUsed += d
      sub.usage.dailyUsed += d
      if (wantsImage) sub.usage.generationsUsed += d
      storage.set(K.user, user)
    }
    charge(1)
    storage.set(K.rate, [...rate, now.getTime()])
    inFlight = true
    let produced = false

    try {
      const iso = now.toISOString()
      const chats = loadChats()
      const msgs = loadMsgs()

      let chat = chats.find((c) => c.id === payload.chatId)
      if (!chat) {
        const title = payload.content.slice(0, 48) || (wantsImage ? 'Изображение' : attached.length ? 'Фото' : 'Новый чат')
        chat = { id: uid('c_'), title, updatedAt: iso, model: sub.tier }
        chats.push(chat)
      }
      chat.updatedAt = iso
      yield { type: 'chat', chat: { ...chat } }

      const userMsg: Message = { id: uid('m_'), chatId: chat.id, role: 'user', content: payload.content, createdAt: iso, status: 'done', ...(attached.length ? { images: attached } : {}) }
      const list = (msgs[chat.id] ??= [])
      list.push(userMsg)
      // в модель ушло бы только это окно; в «БД» хранится вся история
      const context = buildContext(list)

      const replyId = uid('m_')
      const isContinue = payload.content.trim().toLowerCase() === CONTINUE_PROMPT.toLowerCase()
      const truncated = !wantsImage && !isContinue && /подробн|полностью|целиком/i.test(payload.content)
      const full = wantsImage
        ? attached.length
          ? 'Готово — отредактировал изображение по вашему описанию.'
          : 'Готово — вот изображение по вашему описанию.'
        : isContinue
          ? CONTINUE_REPLY
          : attached.length
            ? PHOTO_REPLY(attached.length)
            : truncated
              ? LONG_REPLY
              : SAMPLE_REPLIES[list.length % SAMPLE_REPLIES.length]!(payload.content)
      const tokens = full.match(/\S+\s*|\s+/g) ?? [full]
      const images: ImageRef[] = []

      await sleep(wantsImage ? 1400 : 450, signal)
      let text = ''
      try {
        if (wantsImage) {
          const img = demoImage(payload.content || 'изображение')
          images.push(img)
          yield { type: 'image', messageId: replyId, image: img }
        }
        for (const t of tokens) {
          await sleep(18 + Math.random() * 40, signal)
          text += t
          yield { type: 'delta', messageId: replyId, text: t }
        }
      } finally {
        produced = text.length > 0 || images.length > 0
        const reply: Message = {
          id: replyId,
          chatId: chat.id,
          role: 'assistant',
          content: text,
          createdAt: new Date().toISOString(),
          status: 'done',
          ...(images.length ? { images } : {}),
          ...(truncated && text === full ? { truncated: true } : {}),
        }
        if (produced) list.push(reply)
        storage.set(K.chats, chats)
        storage.set(K.msgs, msgs)

        // фактическая стоимость: модель и генерация считаются раздельно
        const price = COST[sub.tier]
        const inTok = context.reduce((n, m) => n + estimateTokens(m.content), 0) + attached.length * COST.photoTokens
        const outTok = estimateTokens(text)
        ledger.tokensIn += inTok
        ledger.tokensOut += outTok
        ledger.spentTextUsd += (inTok * price.input + outTok * price.output) / 1e6
        if (images.length) {
          ledger.spentImageUsd += COST.imageGeneration * images.length
          ledger.generations += images.length
        }
        if (!produced) ledger.errors++
        storage.set(K.ledger, ledger)

        if (text === full) yield { type: 'done', message: reply, usage: { ...sub.usage } }
      }
    } finally {
      inFlight = false
      // ошибка или отмена без результата — запрос не списывается
      if (!produced) charge(-1)
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
    if (!PRICES[req.tier]?.[req.planId]) throw new Error('Тариф не найден')
    const plan = getPlan(req.tier, req.planId)
    const paymentId = uid('pay_')
    const payments = storage.get<Record<string, PaymentInfo>>(K.pay, {})
    payments[paymentId] = { paymentId, status: 'succeeded', planId: plan.id, tier: plan.tier, amount: plan.price }
    storage.set(K.pay, payments)

    // Успешная оплата открывает новый период: общий счётчик и бюджет с нуля. Суточный
    // сбрасывается только в полночь по Москве, поэтому сегодняшние запросы переносятся.
    const prev = loadUser()
    const settings = loadSettings()
    const sub = newSubscription(plan.id, plan.tier, new Date(), settings)
    const old = prev.subscription && freshUsage(prev.subscription.usage, new Date())
    if (old) sub.usage.dailyUsed = Math.min(old.dailyUsed, sub.usage.dailyLimit)
    storage.set(K.ledger, newLedger(plan.id, plan.tier, settings))
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
