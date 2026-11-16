/**
 * Публичный API сайта (/api/…). Слушает 127.0.0.1, снаружи — через nginx (TLS, limit_req).
 *
 * Защита: сессия только в HttpOnly-cookie (SameSite=Lax) + CSRF-заголовок и точный Origin на
 * изменения; схемы тел без лишних полей; лимиты и деньги считает только сервер (ledger.ts);
 * чужие чаты и картинки отвечают 404, как несуществующие.
 */
import multipart from '@fastify/multipart'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { ChatStreamEvent, ChatSummary, CheckoutRequest, ImageRef, LimitCode, Message, PlanTier, RegisterConsent, SendMessagePayload } from '@/api/types'
import { LIMITS, UPLOAD } from '@/config/app'
import { getPlans } from '@/content/plans'
import { isEmail, normalizeEmail } from '@/lib/auth'
import { buildContext, estimateTokens, limitMessage } from '@/lib/limits'
import { sha256 } from '../crypto.ts'
import { Auth, AuthError, Window, consentOk, recordConsents, type Client, type UserRow } from './auth.ts'
import { applyPaymentStatus, attachProviderId, createPendingPayment, disabledProvider, paymentInfo, type PaymentProvider } from './billing.ts'
import type { ApiConfig } from './config.ts'
import { newId, type Db } from './db.ts'
import { ImageFiles, sanitize } from './images.ts'
import { Refusal, readSettings, releaseStale, reserve, settle, usageOf, activeSub, type Kind } from './ledger.ts'
import type { Llm, LlmMessage, LlmUsage, Part } from './openrouter.ts'
import type { TgApi } from './tg/api.ts'
import { TgBot } from './tg/bot.ts'
import type { TgNotifier } from './tg/notify.ts'

export const STATUS: Record<LimitCode, number> = {
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
  model_off: 503,
  auth_required: 401,
}

const SYSTEM_PROMPT =
  'Ты — полезный ассистент. Отвечай на языке пользователя, по делу и без воды. Для кода используй блоки Markdown. ' +
  'Не выдумывай факты; если не уверен — скажи об этом.'

/** Оценка, если OpenRouter не прислал стоимость (обрыв стрима): с запасом, чтобы бюджет не утекал. */
const FALLBACK_PRICE: Record<PlanTier, { in: number; out: number }> = {
  text: { in: 0.1 / 1e6, out: 0.5 / 1e6 },
  media: { in: 2 / 1e6, out: 12 / 1e6 },
}
const FALLBACK_IMAGE_USD = 0.08
const PHOTO_TOKENS = 1200

const ID = { type: 'string', pattern: '^[a-z]{1,4}_[A-Za-z0-9_-]{20}$' }
const SEND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chatId', 'content'],
  properties: {
    chatId: { anyOf: [ID, { type: 'null' }] },
    content: { type: 'string', maxLength: LIMITS.inputTokens * 4 },
    images: {
      type: 'array',
      maxItems: UPLOAD.maxFiles,
      uniqueItems: true,
      items: ID,
    },
    mode: { enum: ['chat', 'image'] },
  },
}
const LOGIN = { type: 'string', minLength: 1, maxLength: 64 }
const PASSWORD = { type: 'string', minLength: 1, maxLength: 200 }
const TOKEN = { type: 'string', maxLength: 64 }
const body = (required: string[], properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required, properties })
const REGISTER_SCHEMA = body(['login', 'password', 'consent'], {
  login: LOGIN,
  password: PASSWORD,
  consent: body(['version', 'terms', 'personalData'], {
    version: { type: 'string', maxLength: 20 },
    terms: { type: 'boolean' },
    personalData: { type: 'boolean' },
  }),
})
const LOGIN_SCHEMA = body(['login', 'password'], { login: LOGIN, password: PASSWORD })
const CHALLENGE_SCHEMA = body(['id'], { id: { type: 'string', pattern: '^[\\w-]{22}$' }, code: { type: 'string', maxLength: 12 } })
const PASSWORD_SCHEMA = body(['current', 'password'], { current: PASSWORD, password: PASSWORD })
const RESET_SCHEMA = body(['login'], { login: LOGIN })
const RESET_CONFIRM_SCHEMA = body(['token', 'password'], { token: TOKEN, password: PASSWORD })
const CHECKOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['planId', 'tier', 'method', 'email', 'consent'],
  properties: {
    email: { type: 'string', maxLength: 254 },
    planId: { enum: ['week', 'month', 'quarter'] },
    tier: { enum: ['text', 'media'] },
    method: { enum: ['card', 'sbp', 'sberpay'] },
    consent: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'terms', 'recurring'],
      properties: {
        version: { type: 'string', maxLength: 20 },
        terms: { type: 'boolean' },
        recurring: { type: 'boolean' },
      },
    },
  },
}
const PARAM_ID = { type: 'object', required: ['id'], properties: { id: ID } }

export interface ApiDeps {
  db: Db
  /** null: модель не подключена (нет ключа OpenRouter), сообщения отвечают 503. */
  llm: Llm | null
  /** Бот входа; null: токена нет, Telegram-функции отвечают 503 tg_off, 2FA выключена. */
  tg: TgNotifier | null
  /** Для ответов бота на апдейты (main.ts). В тестах HTTP не нужен. */
  tgApi?: TgApi | null
  files: ImageFiles
  provider?: PaymentProvider
  now?: () => number
  authLog?: (event: 'API_AUTH_FAIL', ip: string) => void
}

interface ImageRow {
  id: string
  user_id: string
  chat_id: string | null
  message_id: string | null
  source: 'upload' | 'generated'
  mime: string
  width: number
  height: number
}
interface MessageRow {
  id: string
  chat_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
  status: string
  truncated: number
}

const iso = (t: number) => new Date(t).toISOString()
const imageRef = (r: ImageRow): ImageRef => ({
  id: r.id,
  url: `/api/images/${r.id}`,
  mime: r.mime,
  width: r.width,
  height: r.height,
  source: r.source,
})

export function buildApiApp(cfg: ApiConfig, deps: ApiDeps) {
  const { db, llm, files } = deps
  const now = deps.now ?? Date.now
  const provider = deps.provider ?? disabledProvider
  const authLog =
    deps.authLog ??
    ((event: string, ip: string) => {
      process.stderr.write(`${new Date().toISOString()} ${event} ip=${ip}\n`)
    })
  const auth = new Auth(db, cfg.pepper, deps.tg, (ip) => authLog('API_AUTH_FAIL', ip))
  const cookieName = cfg.insecureCookie ? 'ruai_s' : '__Host-ruai_s'
  const busy = new Set<string>()
  const uploads = new Window()

  releaseStale(db, now(), 0)

  const app = Fastify({
    trustProxy: ['127.0.0.1', '::1'],
    bodyLimit: 256 * 1024,
    logger: {
      level: 'warn',
      redact: ['req.headers.cookie', 'req.headers.authorization'],
    },
    ajv: { customOptions: { removeAdditional: false } },
  })

  app.register(multipart, {
    limits: {
      fileSize: UPLOAD.maxBytes,
      files: 1,
      fields: 0,
      parts: 1,
      headerPairs: 50,
    },
  })

  app.addHook('onSend', async (_req, reply, payload) => {
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Cross-Origin-Resource-Policy', 'same-origin')
    if (!reply.hasHeader('Content-Security-Policy')) reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    return payload
  })

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ message: 'Не найдено' }))
  app.setErrorHandler(
    (
      err: {
        statusCode?: number
        validation?: unknown
        code?: string
        message: string
      },
      req,
      reply,
    ) => {
      if (err instanceof Refusal) return refuse(reply, err)
      if (err instanceof AuthError)
        return reply
          .code(err.status)
          .headers(err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {})
          .send({
            message: err.message,
            code: err.code,
            retryAfter: err.retryAfter,
          })
      if (err.statusCode === 401) return reply.code(401).send({ message: 'Нужно войти', code: 'auth' })
      if (err.validation) return reply.code(400).send({ message: 'Неверный запрос' })
      if (err.statusCode === 413 || err.code === 'FST_REQ_FILE_TOO_LARGE') return refuse(reply, new Refusal('bad_image'))
      if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ message: 'Неверный запрос' })
      req.log.error(err)
      return reply.code(500).send({ message: 'Ошибка сервера' })
    },
  )

  function refuse(reply: FastifyReply, r: Refusal) {
    const message = r.message === 'cap' ? 'Сервис временно перегружен. Попробуйте позже — запрос не списан.' : limitMessage(r.code, r.retryAfter)
    if (r.retryAfter) reply.header('Retry-After', String(r.retryAfter))
    return reply.code(STATUS[r.code]).send({
      message,
      code: r.code,
      ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}),
    })
  }

  const readCookie = (req: FastifyRequest) => {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === cookieName) return v.join('=')
    }
    return undefined
  }
  const setCookie = (reply: FastifyReply, value: string, maxAgeSec: number) => {
    const attrs = [`${cookieName}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
    if (!cfg.insecureCookie) attrs.push('Secure')
    reply.header('Set-Cookie', attrs.join('; '))
  }
  const client = (req: FastifyRequest): Client => ({
    ip: req.ip,
    ua: String(req.headers['user-agent'] ?? ''),
  })

  const userOf = new WeakMap<FastifyRequest, UserRow | null>()
  const me = (req: FastifyRequest) => userOf.get(req) ?? null
  const needUser = (req: FastifyRequest) => {
    const u = me(req)
    if (!u) throw Object.assign(new Error('auth'), { statusCode: 401 })
    return u
  }

  app.register(
    async (api) => {
      api.addHook('onRequest', async (req, reply) => {
        // уведомления провайдера приходят без cookie и CSRF-заголовка; их проверяет провайдер
        if (req.url.startsWith('/api/billing/webhook/')) return
        // CSRF: свой заголовок (кросс-доменная форма его не поставит) + точный Origin на изменения
        if (req.headers['x-requested-with'] !== 'ruai' && !req.url.startsWith('/api/images/')) return reply.code(403).send({ message: 'Запрещено' })
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== cfg.origin) return reply.code(403).send({ message: 'Запрещено' })
        userOf.set(req, auth.touch(readCookie(req), now()))
      })

      // ---------- вход ----------
      api.get('/auth/me', async (req) => auth.view(me(req), now()))

      /** Выдать сессию. Старая сессия этого браузера закрывается: защита от фиксации сессии. */
      const signIn = (req: FastifyRequest, reply: FastifyReply, user: UserRow) => {
        auth.dropSession(readCookie(req))
        setCookie(reply, auth.createSession(user.id, req.ip, now()), 30 * 86_400)
        // токен только в HttpOnly-cookie: скрипты страницы его не видят
        return { user: auth.view(user, now()), token: '' }
      }
      const challengeView = (r: { challenge: string; expiresAt: number; sent: boolean }) => ({ challenge: r.challenge, expiresAt: iso(r.expiresAt), sent: r.sent })

      api.post<{ Body: { login: string; password: string; consent: RegisterConsent } }>('/auth/register', { schema: { body: REGISTER_SCHEMA } }, async (req, reply) =>
        signIn(req, reply, await auth.register(req.body, client(req), now())),
      )

      api.post<{ Body: { login: string; password: string } }>('/auth/login', { schema: { body: LOGIN_SCHEMA } }, async (req, reply) => {
        const r = await auth.login(req.body.login, req.body.password, client(req), now())
        return 'user' in r ? signIn(req, reply, r.user) : challengeView(r)
      })

      api.post<{ Body: { id: string; code?: string } }>('/auth/challenge', { schema: { body: CHALLENGE_SCHEMA } }, async (req, reply) => {
        const r = auth.checkChallenge(req.body.id, req.body.code, client(req), now())
        return 'user' in r ? signIn(req, reply, r.user) : r
      })

      api.post<{ Body: { current: string; password: string } }>('/auth/password', { schema: { body: PASSWORD_SCHEMA } }, async (req, reply) => {
        await auth.changePassword(needUser(req), req.body.current, req.body.password, readCookie(req) ?? '')
        return reply.code(204).send()
      })

      api.post<{ Body: { login: string } }>('/auth/reset', { schema: { body: RESET_SCHEMA } }, async (req, reply) => {
        void auth.requestReset(req.body.login, cfg.origin, client(req), now())
        return reply.code(204).send()
      })

      api.post<{ Body: { token: string; password: string } }>('/auth/reset/confirm', { schema: { body: RESET_CONFIRM_SCHEMA } }, async (req, reply) => {
        await auth.confirmReset(req.body.token, req.body.password, now())
        return reply.code(204).send()
      })

      api.post('/tg/link', async (req) => {
        const r = auth.createLink(needUser(req), now())
        return { url: r.url, expiresAt: iso(r.expiresAt) }
      })

      api.post('/tg/unlink', async (req) => challengeView(await auth.startUnlink(needUser(req), client(req), now())))

      api.post('/auth/logout', async (req, reply) => {
        auth.dropSession(readCookie(req))
        setCookie(reply, '', 0)
        return { ok: true }
      })

      // ---------- чаты ----------
      const chatOf = (userId: string, chatId: string) =>
        db.get<{ id: string; title: string; updated_at: number }>('SELECT id, title, updated_at FROM chats WHERE id = ? AND user_id = ?', chatId, userId)
      const summary = (c: { id: string; title: string; updated_at: number }, tier: PlanTier): ChatSummary => ({
        id: c.id,
        title: c.title,
        updatedAt: iso(c.updated_at),
        model: tier,
      })
      const tierOf = (userId: string): PlanTier => activeSub(db, userId, now())?.tier ?? 'text'

      api.get('/chats', async (req) => {
        const u = needUser(req)
        const tier = tierOf(u.id)
        return db
          .all<{ id: string; title: string; updated_at: number }>('SELECT id, title, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500', u.id)
          .map((c) => summary(c, tier))
      })

      api.get<{ Params: { id: string } }>('/chats/:id/messages', { schema: { params: PARAM_ID } }, async (req, reply) => {
        const u = needUser(req)
        if (!chatOf(u.id, req.params.id)) return reply.code(404).send({ message: 'Чат не найден' })
        const rows = db.all<MessageRow>('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid', req.params.id)
        const imgs = db.all<ImageRow>('SELECT * FROM images WHERE chat_id = ? AND message_id IS NOT NULL', req.params.id)
        const byMsg = new Map<string, ImageRef[]>()
        for (const i of imgs) byMsg.set(i.message_id!, [...(byMsg.get(i.message_id!) ?? []), imageRef(i)])
        return rows.map((m): Message => ({
          id: m.id,
          chatId: m.chat_id,
          role: m.role,
          content: m.content,
          createdAt: iso(m.created_at),
          status: 'done',
          ...(byMsg.get(m.id) ? { images: byMsg.get(m.id) } : {}),
          ...(m.truncated ? { truncated: true } : {}),
        }))
      })

      api.patch<{ Params: { id: string }; Body: { title: string } }>(
        '/chats/:id',
        {
          schema: {
            params: PARAM_ID,
            body: {
              type: 'object',
              additionalProperties: false,
              required: ['title'],
              properties: {
                title: { type: 'string', minLength: 1, maxLength: 120 },
              },
            },
          },
        },
        async (req, reply) => {
          const u = needUser(req)
          const title = req.body.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
          if (!title) return reply.code(400).send({ message: 'Пустое название' })
          const r = db.run('UPDATE chats SET title = ? WHERE id = ? AND user_id = ?', title, req.params.id, u.id)
          if (!r.changes) return reply.code(404).send({ message: 'Чат не найден' })
          return { ok: true }
        },
      )

      api.delete<{ Params: { id: string } }>('/chats/:id', { schema: { params: PARAM_ID } }, async (req, reply) => {
        const u = needUser(req)
        if (!chatOf(u.id, req.params.id)) return reply.code(404).send({ message: 'Чат не найден' })
        const ids = db.all<{ id: string }>('SELECT id FROM images WHERE chat_id = ?', req.params.id)
        db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', req.params.id, u.id)
        for (const i of ids) files.remove(i.id)
        return { ok: true }
      })

      // ---------- картинки ----------
      api.post('/uploads', async (req, reply) => {
        const u = me(req)
        if (!u) throw new Refusal('auth_required')
        const sub = activeSub(db, u.id, now())
        if (!sub) throw new Refusal('no_subscription')
        if (sub.tier !== 'media') throw new Refusal('media_required')
        const wait = uploads.wait(u.id, 40, 3_600_000, now())
        if (wait) throw new Refusal('rate_limit', wait)
        const day =
          db.get<{ b: number | null }>("SELECT SUM(bytes) AS b FROM images WHERE user_id = ? AND source = 'upload' AND created_at > ?", u.id, now() - 86_400_000)?.b ?? 0
        if (day > 300 * 1024 * 1024) throw new Refusal('rate_limit', 3600)

        const file = await req.file()
        if (!file) throw new Refusal('bad_image')
        const buf = await file.toBuffer()
        const img = sanitize(buf)
        if (!img) throw new Refusal('bad_image')
        uploads.hit(u.id, now())
        const id = newId('img')
        files.write(id, img.data)
        db.run(
          "INSERT INTO images (id, user_id, source, mime, width, height, bytes, created_at) VALUES (?, ?, 'upload', ?, ?, ?, ?, ?)",
          id,
          u.id,
          img.mime,
          img.width,
          img.height,
          img.data.length,
          now(),
        )
        return reply.send(
          imageRef({
            id,
            user_id: u.id,
            chat_id: null,
            message_id: null,
            source: 'upload',
            mime: img.mime,
            width: img.width,
            height: img.height,
          }),
        )
      })

      api.get<{ Params: { id: string } }>('/images/:id', { schema: { params: PARAM_ID } }, async (req, reply) => {
        const u = me(req)
        const row = u ? db.get<ImageRow>('SELECT * FROM images WHERE id = ? AND user_id = ?', req.params.id, u.id) : undefined
        const data = row ? files.read(row.id) : null
        if (!row || !data) return reply.code(404).send({ message: 'Не найдено' })
        return reply
          .header('Content-Type', row.mime)
          .header('Cache-Control', 'private, max-age=86400, immutable')
          .header('Content-Disposition', 'inline')
          .header('Content-Security-Policy', "default-src 'none'; sandbox")
          .send(data)
      })

      // ---------- сообщение ----------
      api.post<{ Body: SendMessagePayload }>('/chats/messages', { schema: { body: SEND_SCHEMA } }, async (req, reply) => {
        const u = me(req)
        // гость не отправляет сообщения: сначала регистрация
        if (!u) throw new Refusal('auth_required')
        const p = req.body
        const content = p.content.trim()
        const photoIds = p.images ?? []
        const kind: Kind = p.mode === 'image' ? 'image' : photoIds.length ? 'vision' : 'text'
        if (!content && kind !== 'vision') return reply.code(400).send({ message: 'Пустое сообщение' })
        if (estimateTokens(content) > LIMITS.inputTokens) throw new Refusal('too_long')
        if (p.chatId && !chatOf(u.id, p.chatId)) return reply.code(404).send({ message: 'Чат не найден' })
        const photos = photoIds.map((id) => db.get<ImageRow>("SELECT * FROM images WHERE id = ? AND user_id = ? AND source = 'upload' AND message_id IS NULL", id, u.id))
        if (photos.some((x) => !x)) throw new Refusal('bad_image')
        if (busy.has(u.id)) throw new Refusal('busy')
        // модель не подключена: до резерва, чтобы запрос не списывался
        if (!llm) throw new Refusal('model_off')

        const sub0 = activeSub(db, u.id, now())
        const model = kind === 'image' ? cfg.models.image : sub0?.tier === 'media' ? cfg.models.media : cfg.models.text
        const res = reserve(db, {
          userId: u.id,
          kind,
          model,
          now: now(),
          dailyUsdCap: cfg.dailyUsdCap,
        })
        busy.add(u.id)
        let settled = false
        try {
          // ---- принято: дальше только поток ----
          const t0 = now()
          let chatId = p.chatId
          db.tx(() => {
            if (!chatId) {
              chatId = newId('c')
              const title = (content.slice(0, 48) || (kind === 'image' ? 'Изображение' : 'Фото')).replace(/[\u0000-\u001f\u007f]/g, ' ')
              db.run('INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', chatId, u.id, title, t0, t0)
            } else db.run('UPDATE chats SET updated_at = ? WHERE id = ?', t0, chatId)
            const mid = newId('m')
            db.run("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)", mid, chatId, content, t0)
            for (const ph of photos) db.run('UPDATE images SET message_id = ?, chat_id = ? WHERE id = ?', mid, chatId, ph!.id)
          })
          const chat = chatOf(u.id, chatId!)!

          reply.hijack()
          const raw = reply.raw
          raw.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
            'X-Content-Type-Options': 'nosniff',
            Connection: 'keep-alive',
          })
          const send = (ev: ChatStreamEvent) => {
            if (!raw.writableEnded) raw.write(`data: ${JSON.stringify(ev)}\n\n`)
          }
          const abort = new AbortController()
          raw.on('close', () => {
            if (!raw.writableEnded) abort.abort()
          })
          const timeout = setTimeout(() => abort.abort(), kind === 'image' ? 180_000 : 150_000)

          const replyId = newId('m')
          let text = ''
          const produced: ImageRef[] = []
          let usage: LlmUsage | null = null
          let finish: string | null = null
          let errorCode: string | undefined
          const userTag = sha256(`ruai:${u.id}`).slice(0, 24)
          const tier = res.sub.tier

          try {
            send({ type: 'chat', chat: summary(chat, tier) })
            const photoParts: Part[] = photos.map((ph) => ({
              type: 'image_url',
              image_url: {
                url: `data:${ph!.mime};base64,${files.read(ph!.id)?.toString('base64') ?? ''}`,
              },
            }))

            if (kind === 'image') {
              const prompt = content || 'Улучши это изображение'
              const r = await llm.image({
                model,
                messages: [
                  {
                    role: 'user',
                    content: [{ type: 'text', text: prompt }, ...photoParts],
                  },
                ],
                user: userTag,
                signal: abort.signal,
              })
              usage = r.usage
              text = r.text.slice(0, 4000)
              for (const b of r.images.slice(0, 4)) {
                const img = sanitize(b)
                if (!img) continue
                const id = newId('img')
                files.write(id, img.data)
                db.run(
                  "INSERT INTO images (id, user_id, chat_id, source, mime, width, height, bytes, created_at) VALUES (?, ?, ?, 'generated', ?, ?, ?, ?, ?)",
                  id,
                  u.id,
                  chatId,
                  img.mime,
                  img.width,
                  img.height,
                  img.data.length,
                  now(),
                )
                const ref = imageRef({
                  id,
                  user_id: u.id,
                  chat_id: chatId,
                  message_id: null,
                  source: 'generated',
                  mime: img.mime,
                  width: img.width,
                  height: img.height,
                })
                produced.push(ref)
                send({ type: 'image', messageId: replyId, image: ref })
              }
              if (!produced.length) errorCode = 'no_image'
            } else {
              const history = db
                .all<MessageRow>('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', chatId, LIMITS.contextMessages)
                .reverse()
                .filter((m) => m.content)
              const ctx = buildContext(history)
              const messages: LlmMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
              ctx.forEach((m, i) => {
                const last = i === ctx.length - 1
                messages.push(
                  last && photoParts.length
                    ? {
                        role: 'user',
                        content: [{ type: 'text', text: m.content || 'Что на фото?' }, ...photoParts],
                      }
                    : { role: m.role, content: m.content },
                )
              })
              if (!ctx.length || ctx[ctx.length - 1]!.role !== 'user')
                messages.push({
                  role: 'user',
                  content: [{ type: 'text', text: content || 'Что на фото?' }, ...photoParts],
                })
              for await (const ch of llm.stream({
                model,
                messages,
                maxTokens: LIMITS.outputTokens,
                user: userTag,
                signal: abort.signal,
              })) {
                if (ch.type === 'text') {
                  text += ch.text
                  send({ type: 'delta', messageId: replyId, text: ch.text })
                } else {
                  usage = ch.usage
                  finish = ch.finish
                }
              }
              if (!text) errorCode = 'empty'
            }
          } catch (e) {
            errorCode = abort.signal.aborted ? 'aborted' : 'upstream'
            if (!abort.signal.aborted) req.log.warn({ err: (e as Error).message.slice(0, 300) }, 'llm failed')
          } finally {
            clearTimeout(timeout)
          }

          const ok = text.length > 0 || produced.length > 0
          const promptTokens = estimateTokens(content) + photos.length * PHOTO_TOKENS
          const cost =
            usage?.costUsd ||
            (kind === 'image'
              ? produced.length * FALLBACK_IMAGE_USD
              : (promptTokens * FALLBACK_PRICE[tier].in + estimateTokens(text) * FALLBACK_PRICE[tier].out) * (ok || errorCode === 'aborted' ? 1 : 0))
          const truncated = finish === 'length'
          let message: Message | null = null
          if (ok) {
            const t = now()
            db.tx(() => {
              db.run(
                "INSERT INTO messages (id, chat_id, role, content, created_at, truncated) VALUES (?, ?, 'assistant', ?, ?, ?)",
                replyId,
                chatId,
                text,
                t,
                truncated ? 1 : 0,
              )
              for (const im of produced) db.run('UPDATE images SET message_id = ? WHERE id = ?', replyId, im.id)
              db.run('UPDATE chats SET updated_at = ? WHERE id = ?', t, chatId)
            })
            message = {
              id: replyId,
              chatId: chatId!,
              role: 'assistant',
              content: text,
              createdAt: iso(t),
              status: 'done',
              ...(produced.length ? { images: produced } : {}),
              ...(truncated ? { truncated: true } : {}),
            }
          }
          settle(db, res.eventId, {
            produced: ok,
            tokensIn: usage?.tokensIn ?? promptTokens,
            tokensOut: usage?.tokensOut ?? estimateTokens(text),
            costUsd: cost,
            ...(ok ? {} : { errorCode }),
          })
          settled = true
          busy.delete(u.id)

          const fresh = activeSub(db, u.id, now())
          if (message)
            send({
              type: 'done',
              message,
              ...(fresh ? { usage: usageOf(fresh, readSettings(db), now()) } : {}),
            })
          else
            send({
              type: 'error',
              error: limitMessage('upstream'),
              code: 'upstream',
            })
          raw.end()
        } finally {
          busy.delete(u.id)
          // сбой до закрытия резерва — запрос возвращается
          if (!settled)
            settle(db, res.eventId, {
              produced: false,
              tokensIn: 0,
              tokensOut: 0,
              costUsd: 0,
              errorCode: 'internal',
            })
          if (reply.sent && !reply.raw.writableEnded) reply.raw.end()
        }
      })

      // ---------- оплата ----------
      api.get<{ Querystring: { tier?: string } }>('/billing/plans', async (req) => getPlans(req.query.tier === 'media' ? 'media' : 'text'))

      api.post<{ Body: CheckoutRequest }>('/billing/checkout', { schema: { body: CHECKOUT_SCHEMA } }, async (req, reply) => {
        const b = req.body
        // оплата только из аккаунта (согласие на ПДн дано при регистрации); email нужен только для чека
        const current = me(req)
        if (!current) throw new Refusal('auth_required')
        const email = normalizeEmail(b.email)
        if (!isEmail(email)) return reply.code(400).send({ message: 'Введите корректный email для чека', code: 'bad_email' })
        const need = ['terms', 'recurring']
        if (!consentOk(b.consent, need))
          return reply.code(422).send({
            message: 'Обновите страницу и примите документы заново',
            code: 'consent',
          })
        if (!provider.enabled)
          return reply.code(503).send({
            message: 'Оплата временно недоступна. Попробуйте позже.',
            code: 'payments_disabled',
          })

        const t = now()
        const { id, amount } = db.tx(() => {
          recordConsents(
            db,
            current.id,
            need,
            b.consent.version,
            client(req),
            t,
          )
          db.run('UPDATE users SET email = ? WHERE id = ?', email, current.id)
          return createPendingPayment(db, {
            userId: current.id,
            provider: provider.name,
            req: { ...b, email },
            now: t,
          })
        })
        const r = await provider.create({
          paymentId: id,
          amount,
          description: `Подписка ${b.planId}, ${b.tier}`,
          email,
          method: b.method,
          returnUrl: `${cfg.origin}/checkout/result?payment=${id}`,
          recurring: true,
        })
        attachProviderId(db, id, r.providerId)
        return { paymentId: id, confirmationUrl: r.confirmationUrl }
      })

      api.get<{ Params: { id: string } }>(
        '/billing/payments/:id',
        {
          schema: {
            params: {
              type: 'object',
              required: ['id'],
              properties: {
                id: { type: 'string', pattern: '^pay_[A-Za-z0-9_-]{20}$' },
              },
            },
          },
        },
        async (req, reply) => {
          const u = me(req)
          // чужой платёж выглядит как несуществующий
          const info = u ? paymentInfo(db, req.params.id, u.id) : null
          if (!info) return reply.code(404).send({ message: 'Платёж не найден' })
          return info
        },
      )

      api.post<{ Params: { provider: string } }>('/billing/webhook/:provider', async (req, reply) => {
        if (!provider.enabled || req.params.provider !== provider.name) return reply.code(404).send({ message: 'Не найдено' })
        const ev = await provider.parseWebhook({
          headers: req.headers,
          body: req.body,
          ip: req.ip,
        })
        if (!ev) return reply.code(400).send({ message: 'Неверное уведомление' })
        const r = applyPaymentStatus(db, provider.name, ev, now())
        if (r === 'mismatch') req.log.warn({ providerId: ev.providerId }, 'payment amount mismatch')
        return { ok: true }
      })
    },
    { prefix: '/api' },
  )

  const tgBot = deps.tgApi ? new TgBot(auth, deps.tgApi, cfg.origin, now) : null
  return Object.assign(app, { auth, tgBot })
}
