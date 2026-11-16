/**
 * HTTP API админки. Слушает только 127.0.0.1; снаружи доступен через nginx по секретному пути.
 *
 * Слои защиты (снаружи внутрь): nginx (TLS, секретный путь, limit_req, опционально allowlist IP)
 * → fail2ban (бан IP по строкам ADMIN_AUTH_FAIL) → этот сервер (пароль scrypt + TOTP,
 * блокировка перебора, сессия в HttpOnly-cookie, CSRF-проверка, журнал действий).
 */
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { AdminSettings, DateRange, PlanId, PlanTier, SubEdit, UserEdit, UsersQuery } from '../../src/admin/api/types.ts'
import { checkSubEdit, checkUserEdit, MAX_NOTE } from '../../src/admin/edits.ts'
import { checkRange, lastDays } from '../../src/admin/range.ts'
import type { Config } from './config.ts'
import { safeEqual, verifyPassword, verifyTotp } from './crypto.ts'
import { Sessions, Throttle, type Session } from './guard.ts'
import type { AdminActions, EditResult } from './sqlRepo.ts'
import { authLogger, demoRepo, FileStore, type AdminRepo, type SettingsStore } from './store.ts'

const LIMIT = { anyOf: [{ type: 'integer', minimum: 0, maximum: 100_000 }, { type: 'null' }] }
const BUDGET = { type: 'number', minimum: 0, maximum: 100_000 }
const plans = (item: object) => ({
  type: 'object',
  additionalProperties: false,
  required: ['week', 'month', 'quarter'],
  properties: { week: item, month: item, quarter: item },
})
const SETTINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['generationEnabled', 'generationLimits', 'budgetsRub', 'usdRub'],
  properties: {
    generationEnabled: { type: 'boolean' },
    generationLimits: plans(LIMIT),
    budgetsRub: { type: 'object', additionalProperties: false, required: ['text', 'media'], properties: { text: plans(BUDGET), media: plans(BUDGET) } },
    usdRub: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
  },
}
const LOGIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['login', 'password', 'code'],
  properties: {
    login: { type: 'string', minLength: 1, maxLength: 64 },
    password: { type: 'string', minLength: 1, maxLength: 256 },
    code: { type: 'string', pattern: '^[0-9]{6}$' },
  },
}

/** Коротко для журнала: «+30 дней», «лимит +200», без личных данных. */
export function describeSubEdit(e: SubEdit): string {
  const out: string[] = []
  if (e.end) out.push('завершена')
  if (e.expiresOn) out.push(`до ${e.expiresOn}`)
  if (e.totalLimitDelta) out.push(`запросы ${e.totalLimitDelta > 0 ? '+' : ''}${e.totalLimitDelta}`)
  if (e.budgetDeltaRub) out.push(`бюджет ${e.budgetDeltaRub > 0 ? '+' : ''}${e.budgetDeltaRub} ₽`)
  if (e.autoRenew !== undefined) out.push(`автопродление ${e.autoRenew ? 'вкл' : 'выкл'}`)
  if (e.resetDaily) out.push('сброс за сегодня')
  return out.join(', ')
}

export interface Deps {
  store?: FileStore
  repo?: (AdminRepo & Partial<AdminActions>) | null
  /** Настройки в общей БД (их читает ruai-api); без БД - файл в ADMIN_DATA_DIR. */
  settings?: SettingsStore
  now?: () => number
  log?: ReturnType<typeof authLogger>
}

export function buildApp(cfg: Config, deps: Deps = {}) {
  const store = deps.store ?? new FileStore(cfg.dataDir)
  const repo: (AdminRepo & Partial<AdminActions>) | null = deps.repo !== undefined ? deps.repo : cfg.demo ? demoRepo() : null
  const settings: SettingsStore = deps.settings ?? store
  const now = deps.now ?? Date.now
  const authLog = deps.log ?? authLogger(cfg.authLog)
  const sessions = new Sessions(cfg.idleMs, cfg.absoluteMs)
  const throttle = new Throttle()
  const cookieName = cfg.insecureCookie ? 'ruai_admin' : '__Host-ruai_admin'
  let inflightLogins = 0

  const app = Fastify({
    // X-Forwarded-For принимаем только от nginx на этой же машине
    trustProxy: ['127.0.0.1', '::1'],
    bodyLimit: 16 * 1024,
    // уровень warn: журнал запросов (info) не пишется, секретный путь не попадает в логи
    logger: { level: 'warn', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    // лишние поля в теле - ошибка, а не молчаливое удаление
    ajv: { customOptions: { removeAdditional: false } },
  })

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('Cross-Origin-Resource-Policy', 'same-origin')
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    reply.removeHeader('X-Powered-By')
    return payload
  })

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ message: 'Не найдено' }))
  app.setErrorHandler((err: { statusCode?: number; validation?: unknown; message: string }, req, reply) => {
    if (err.validation) return reply.code(400).send({ message: 'Неверный запрос' })
    if (err.statusCode === 413) return reply.code(413).send({ message: 'Слишком большой запрос' })
    req.log.error(err)
    return reply.code(500).send({ message: 'Ошибка сервера' })
  })

  const readCookie = (req: FastifyRequest) => {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === cookieName) return v.join('=')
    }
    return undefined
  }
  const setCookie = (reply: FastifyReply, value: string, maxAge: number) => {
    const attrs = [`${cookieName}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`]
    if (!cfg.insecureCookie) attrs.push('Secure')
    reply.header('Set-Cookie', attrs.join('; '))
  }
  const audit = (req: FastifyRequest, action: Parameters<FileStore['audit']>[0]['action'], detail?: string) =>
    store.audit({ at: new Date(now()).toISOString(), ip: req.ip, action, ...(detail ? { detail } : {}) })

  const sessionOf = new WeakMap<FastifyRequest, Session>()

  app.register(
    async (api) => {
      // CSRF: свой заголовок (его нельзя поставить кросс-доменной формой) + точный Origin для изменений
      api.addHook('onRequest', async (req, reply) => {
        if (req.headers['x-requested-with'] !== 'ruai-admin') return reply.code(403).send({ message: 'Запрещено' })
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== cfg.origin) {
          return reply.code(403).send({ message: 'Запрещено' })
        }
        if (req.routeOptions.url?.endsWith('/login')) return
        const s = sessions.touch(readCookie(req), req.headers['user-agent'] ?? '', now())
        if (!s) return reply.code(401).send({ message: 'Нужно войти' })
        sessionOf.set(req, s)
      })

      const view = (req: FastifyRequest) => {
        const s = sessionOf.get(req)!
        return { login: s.login, expiresAt: new Date(sessions.expiresAt(s)).toISOString(), demo: cfg.demo }
      }

      api.get('/session', async (req) => view(req))

      api.post<{ Body: { login: string; password: string; code: string } }>('/login', { schema: { body: LOGIN_SCHEMA } }, async (req, reply) => {
        const ip = req.ip
        const wait = throttle.retryAfter(ip, now())
        if (wait) {
          authLog('ADMIN_AUTH_FAIL', ip)
          return reply.code(429).header('Retry-After', String(wait)).send({ message: 'Слишком много попыток входа.' })
        }
        // scrypt тяжёлый: не больше двух проверок одновременно
        if (inflightLogins >= 2) return reply.code(429).header('Retry-After', '2').send({ message: 'Повторите через пару секунд.' })
        inflightLogins++
        try {
          const { login, password, code } = req.body
          const loginOk = safeEqual(login, cfg.login)
          // пароль проверяем всегда, даже при неверном логине, - одинаковое время ответа
          const passOk = await verifyPassword(password, loginOk ? cfg.passwordHash : null)
          const step = verifyTotp(cfg.totpSecret, code, now(), store.lastTotpStep())
          if (!(loginOk && passOk && step !== null)) {
            const locked = throttle.fail(ip, now())
            authLog('ADMIN_AUTH_FAIL', ip)
            audit(req, 'login_failed', login.slice(0, 32).replace(/[^\w.@-]/g, '?'))
            if (locked) {
              authLog('ADMIN_AUTH_LOCK', ip)
              audit(req, 'locked')
            }
            return reply.code(401).send({ message: 'Неверный логин, пароль или код' })
          }
          store.setLastTotpStep(step)
          throttle.success(ip)
          const token = sessions.create(cfg.login, ip, req.headers['user-agent'] ?? '', now())
          setCookie(reply, token, Math.floor(cfg.absoluteMs / 1000))
          authLog('ADMIN_AUTH_OK', ip)
          audit(req, 'login', cfg.login)
          const s = sessions.touch(token, req.headers['user-agent'] ?? '', now())!
          return { login: s.login, expiresAt: new Date(sessions.expiresAt(s)).toISOString(), demo: cfg.demo }
        } finally {
          inflightLogins--
        }
      })

      api.post('/logout', async (req, reply) => {
        sessions.drop(readCookie(req))
        setCookie(reply, '', 0)
        audit(req, 'logout')
        return reply.code(204).send()
      })

      // ---------- отчёты ----------
      /** Диапазон из ?from=&to= (без них - последние 30 дней); неверный - 400. */
      const rangeOf = (req: FastifyRequest<Q>, reply: FastifyReply): DateRange | null => {
        const { from, to } = req.query
        if (from === undefined && to === undefined) return lastDays(30, now())
        const r = checkRange(from, to, now())
        if (typeof r === 'string') {
          reply.code(400).send({ message: r })
          return null
        }
        return r
      }
      const needRepo = (reply: FastifyReply): AdminRepo | null => {
        if (repo) return repo
        reply.code(501).send({ message: 'Источник данных не подключён: подключите AdminRepo к базе (README «Админка»).' })
        return null
      }
      type Q = { Querystring: { from?: string; to?: string } }
      const RANGE_QS = { type: 'object', properties: { from: { type: 'string', maxLength: 10 }, to: { type: 'string', maxLength: 10 } } }
      const report = (name: string, fn: (r: AdminRepo, range: DateRange, s: AdminSettings) => Promise<unknown>) =>
        api.get<Q>(`/reports/${name}`, { schema: { querystring: RANGE_QS } }, async (req, reply) => {
          const r = needRepo(reply)
          if (!r) return
          const range = rangeOf(req, reply)
          if (!range) return
          return fn(r, range, settings.settings())
        })
      report('overview', (r, x, s) => r.overview(x, s))
      report('analytics', (r, x, s) => r.analytics(x, s))
      report('payments', (r, x) => r.payments(x))
      report('api', (r, x, s) => r.api(x, s))
      report('images', (r, x, s) => r.images(x, s))
      report('finance', (r, x, s) => r.finance(x, s))

      api.get<{ Querystring: Record<string, string | undefined> }>('/users', async (req, reply) => {
        const r = needRepo(reply)
        if (!r) return
        const sort = ['spend', 'paid', 'registered', 'active'].includes(req.query.sort ?? '') ? (req.query.sort as UsersQuery['sort']) : 'registered'
        const filter = ['all', 'active', 'none', 'expiring', 'blocked', 'no_tg'].includes(req.query.filter ?? '') ? (req.query.filter as UsersQuery['filter']) : 'all'
        const page = Math.min(10_000, Math.max(1, Math.floor(Number(req.query.page) || 1)))
        return r.users({ q: (req.query.q ?? '').slice(0, 100), sort, filter, page }, settings.settings())
      })

      // ---------- действия с пользователями ----------
      const USER_ID = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^u_[A-Za-z0-9_-]{20}$' } } }
      const needActions = (reply: FastifyReply) => {
        if (repo?.grant && repo.setBlocked && repo.removeUser && repo.editSubscription && repo.editUser && repo.logoutUser) return repo as AdminRepo & AdminActions
        reply.code(501).send({ message: 'Действия доступны только с подключённой базой.' })
        return null
      }
      const notFound = (reply: FastifyReply) => reply.code(404).send({ message: 'Пользователь не найден' })

      api.get<{ Params: { id: string } }>('/users/:id', { schema: { params: USER_ID } }, async (req, reply) => {
        const r = needRepo(reply)
        if (!r) return
        return (await r.user(req.params.id, settings.settings())) ?? notFound(reply)
      })

      const editFail = (reply: FastifyReply, res: EditResult) =>
        res === 'no_user'
          ? notFound(reply)
          : reply.code(409).send({ message: 'Нет действующей подписки' })

      api.post<{ Params: { id: string }; Body: SubEdit }>(
        '/users/:id/subscription',
        {
          schema: {
            params: USER_ID,
            body: {
              type: 'object',
              additionalProperties: false,
              minProperties: 1,
              properties: {
                expiresOn: { type: 'string', maxLength: 10 },
                totalLimitDelta: { type: 'integer', minimum: -100_000, maximum: 100_000 },
                budgetDeltaRub: { type: 'number', minimum: -100_000, maximum: 100_000 },
                autoRenew: { type: 'boolean' },
                resetDaily: { const: true },
                end: { const: true },
              },
            },
          },
        },
        async (req, reply) => {
          const r = needActions(reply)
          if (!r) return
          const bad = checkSubEdit(req.body, now())
          if (bad) return reply.code(400).send({ message: bad })
          const res = await r.editSubscription(req.params.id, req.body)
          if (res !== 'ok') return editFail(reply, res)
          audit(req, 'edit_sub', `${req.params.id} ${describeSubEdit(req.body)}`)
          return { ok: true }
        },
      )

      api.post<{ Params: { id: string }; Body: UserEdit }>(
        '/users/:id/profile',
        {
          schema: {
            params: USER_ID,
            body: {
              type: 'object',
              additionalProperties: false,
              minProperties: 1,
              properties: { email: { type: 'string', minLength: 3, maxLength: 254 }, note: { type: 'string', maxLength: MAX_NOTE * 2 } },
            },
          },
        },
        async (req, reply) => {
          const r = needActions(reply)
          if (!r) return
          const bad = checkUserEdit(req.body)
          if (bad) return reply.code(400).send({ message: bad })
          const res = await r.editUser(req.params.id, req.body)
          if (res !== 'ok') return editFail(reply, res)
          // в журнал не пишем ни адрес, ни текст заметки: только что изменилось
          audit(req, 'edit_user', `${req.params.id} ${Object.keys(req.body).join(',')}`)
          return { ok: true }
        },
      )

      api.post<{ Params: { id: string } }>('/users/:id/logout', { schema: { params: USER_ID } }, async (req, reply) => {
        const r = needActions(reply)
        if (!r) return
        if (!(await r.logoutUser(req.params.id))) return notFound(reply)
        audit(req, 'logout_user', req.params.id)
        return { ok: true }
      })

      api.post<{ Params: { id: string }; Body: { tier: PlanTier; planId: PlanId } }>(
        '/users/:id/grant',
        {
          schema: {
            params: USER_ID,
            body: { type: 'object', additionalProperties: false, required: ['tier', 'planId'], properties: { tier: { enum: ['text', 'media'] }, planId: { enum: ['week', 'month', 'quarter'] } } },
          },
        },
        async (req, reply) => {
          const r = needActions(reply)
          if (!r) return
          if (!(await r.grant(req.params.id, req.body.tier, req.body.planId))) return notFound(reply)
          audit(req, 'grant', `${req.params.id} ${req.body.tier}/${req.body.planId}`)
          return { ok: true }
        },
      )

      api.post<{ Params: { id: string }; Body: { blocked: boolean } }>(
        '/users/:id/block',
        { schema: { params: USER_ID, body: { type: 'object', additionalProperties: false, required: ['blocked'], properties: { blocked: { type: 'boolean' } } } } },
        async (req, reply) => {
          const r = needActions(reply)
          if (!r) return
          if (!(await r.setBlocked(req.params.id, req.body.blocked))) return notFound(reply)
          audit(req, req.body.blocked ? 'block' : 'unblock', req.params.id)
          return { ok: true }
        },
      )

      // удаление необратимо: нужно повторить логин пользователя
      api.post<{ Params: { id: string }; Body: { login: string } }>(
        '/users/:id/delete',
        { schema: { params: USER_ID, body: { type: 'object', additionalProperties: false, required: ['login'], properties: { login: { type: 'string', minLength: 1, maxLength: 64 } } } } },
        async (req, reply) => {
          const r = needActions(reply)
          if (!r) return
          const page = await r.users({ q: req.params.id, page: 1 }, settings.settings())
          const u = page.items.find((x) => x.id === req.params.id)
          if (!u) return notFound(reply)
          if (u.login !== req.body.login.trim().toLowerCase()) return reply.code(400).send({ message: 'Логин не совпадает' })
          await r.removeUser(u.id)
          audit(req, 'delete_user', u.id)
          return { ok: true }
        },
      )

      // ---------- настройки и журнал ----------
      api.get('/settings', async () => settings.settings())
      api.put<{ Body: AdminSettings }>('/settings', { schema: { body: SETTINGS_SCHEMA } }, async (req) => {
        const before = settings.settings()
        settings.saveSettings(req.body)
        const changes: string[] = []
        if (before.generationEnabled !== req.body.generationEnabled) changes.push(`генерация ${req.body.generationEnabled ? 'вкл' : 'выкл'}`)
        if (JSON.stringify(before.generationLimits) !== JSON.stringify(req.body.generationLimits)) changes.push('лимиты генераций')
        if (JSON.stringify(before.budgetsRub) !== JSON.stringify(req.body.budgetsRub)) changes.push('бюджеты')
        if (before.usdRub !== req.body.usdRub) changes.push(`курс ${req.body.usdRub}`)
        audit(req, 'settings', changes.join(', ') || 'без изменений')
        return settings.settings()
      })
      api.get('/audit', async () => store.recentAudit())
    },
    { prefix: `/${cfg.adminPath}/api` },
  )

  return app
}
