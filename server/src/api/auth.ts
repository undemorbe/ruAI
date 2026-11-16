/**
 * Вход по логину и паролю, второй фактор через Telegram-бота, сессии.
 *
 * - Пароль: scrypt (password.ts). На неизвестный логин считается тот же scrypt, ответ одинаков:
 *   по ответу и по времени нельзя узнать, есть ли логин.
 * - Частота: неудачи входа на IP и на логин, регистрации на IP и общая, сброс пароля на логин и IP.
 * - 2FA (если Telegram привязан): заявка с секретом `challenge`, который знает только браузер;
 *   в кнопки бота уходит отдельный `ref`. Сессию выдаёт только checkChallenge с секретом.
 * - Сессия: случайный токен в HttpOnly-cookie, в БД только sha256; 30 дней, продлевается.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import type { RegisterConsent, User } from '@/api/types'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { CODE_LENGTH, isCode, loginError, normalizeLogin, passwordError } from '@/lib/auth'
import { randomToken, sha256 } from '../crypto.ts'
import { newId, type Db } from './db.ts'
import { readSettings, subscriptionView } from './ledger.ts'
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts'
import { describeDevice } from './tg/device.ts'
import type { TgNotifier } from './tg/notify.ts'

export const SESSION_TTL = 30 * 86_400_000
const SESSION_REFRESH = 3_600_000
const MAX_SESSIONS = 10

/** Скользящее окно в памяти: ключ → отметки времени. */
export class Window {
  private map = new Map<string, number[]>()
  /** Секунды до освобождения, если лимит уже исчерпан; 0: можно. */
  wait(key: string, limit: number, windowMs: number, now: number): number {
    const list = (this.map.get(key) ?? []).filter((t) => now - t < windowMs)
    this.map.set(key, list)
    return list.length >= limit ? Math.ceil((windowMs - (now - list[0]!)) / 1000) : 0
  }
  hit(key: string, now: number) {
    const list = this.map.get(key) ?? []
    list.push(now)
    this.map.set(key, list)
  }
  /** Чистка старых ключей, чтобы карта не росла бесконечно. */
  sweep(now: number, maxWindowMs: number) {
    for (const [k, v] of this.map) if (!v.some((t) => now - t < maxWindowMs)) this.map.delete(k)
  }
}

export const AUTH_LIMITS = {
  loginFailPerIp: { limit: 10, windowMs: 15 * 60_000 },
  loginFailPerLogin: { limit: 5, windowMs: 15 * 60_000 },
  registerPerIp: { limit: 5, windowMs: 3_600_000 },
  registerGlobal: { limit: 200, windowMs: 3_600_000 },
  resetPerLogin: { limit: 3, windowMs: 3_600_000 },
  resetPerIp: { limit: 10, windowMs: 3_600_000 },
  challengePerIp: { limit: 60, windowMs: 10 * 60_000 },
}
type Limit = { limit: number; windowMs: number }

export const CHALLENGE_TTL = 5 * 60_000
export const UNLINK_TTL = 10 * 60_000
export const LINK_TTL = 10 * 60_000
export const RESET_TTL = 15 * 60_000
export const CHALLENGE_ATTEMPTS = 5

export class AuthError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter?: number
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

export interface Client {
  ip: string
  ua: string
}

export interface UserRow {
  id: string
  login: string
  password_hash: string
  email: string | null
  tg_id: number | null
  created_at: number
  blocked_at: number | null
}

export const guestView = (tgEnabled: boolean): User => ({
  id: 'guest',
  login: null,
  email: null,
  name: 'Гость',
  isGuest: true,
  telegram: false,
  tgEnabled,
  subscription: null,
})

export function consentOk(c: unknown, need: string[]): boolean {
  if (!c || typeof c !== 'object') return false
  const o = c as Record<string, unknown>
  return o.version === LEGAL_VERSION && need.every((k) => o[k] === true)
}

export function recordConsents(db: Db, userId: string, kinds: string[], version: string, client: Client, now: number) {
  for (const kind of kinds) {
    db.run('INSERT INTO consents (user_id, kind, version, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?)', userId, kind, version, client.ip, client.ua.slice(0, 300), now)
  }
}

export type LoginOutcome = { user: UserRow } | { challenge: string; expiresAt: number; sent: boolean }
export type Decision = 'approved' | 'denied' | 'unlinked' | 'kept' | 'not_yours' | 'gone'
export type LinkResult = 'linked' | 'bad_token' | 'tg_taken' | 'blocked'

const TOKEN_RE = /^[\w-]{43}$/
const BLOCKED = () => new AuthError(403, 'blocked', 'Аккаунт заблокирован. Напишите в поддержку.')

interface ChallengeRow {
  id: string
  user_id: string
  kind: 'login' | 'unlink'
  status: 'pending' | 'approved' | 'denied'
  code_hash: string
  attempts: number
  expires_at: number
  tg_message_id: number | null
}

export class Auth {
  private db: Db
  private pepper: string
  private tg: TgNotifier | null
  private onFail: (ip: string) => void
  private fails = new Window()
  private regs = new Window()
  private resets = new Window()
  private polls = new Window()
  private ops = 0

  constructor(db: Db, pepper: string, tg: TgNotifier | null, onFail: (ip: string) => void = () => {}) {
    this.db = db
    this.pepper = pepper
    this.tg = tg
    this.onFail = onFail
  }

  /** Бот входа работает: можно привязать Telegram и включается 2FA. */
  get tgEnabled() {
    return this.tg !== null
  }

  private codeHash(id: string, code: string) {
    return createHmac('sha256', this.pepper).update(`${id}:${code}`).digest('hex')
  }

  private byLogin(login: string) {
    return this.db.get<UserRow>('SELECT * FROM users WHERE login = ?', normalizeLogin(login))
  }

  private byId(id: string) {
    return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)
  }

  private limited(w: Window, key: string, l: Limit, now: number, text: string) {
    if (++this.ops % 1000 === 0) for (const x of [this.fails, this.regs, this.resets, this.polls]) x.sweep(now, 3_600_000)
    const wait = w.wait(key, l.limit, l.windowMs, now)
    if (wait) throw new AuthError(429, 'rate_limit', text, wait)
  }

  // ---------- регистрация и вход ----------

  async register(raw: { login: string; password: string; consent: RegisterConsent }, client: Client, now: number): Promise<UserRow> {
    const login = normalizeLogin(raw.login)
    const le = loginError(login)
    if (le) throw new AuthError(400, 'bad_login', le)
    const pe = passwordError(raw.password, login)
    if (pe) throw new AuthError(400, 'weak_password', pe)
    if (!consentOk(raw.consent, ['terms', 'personalData'])) throw new AuthError(422, 'consent', 'Обновите страницу и примите документы заново')
    const L = AUTH_LIMITS
    this.limited(this.regs, `ip:${client.ip}`, L.registerPerIp, now, 'Слишком много регистраций. Попробуйте позже.')
    this.limited(this.regs, 'all', L.registerGlobal, now, 'Регистрация временно недоступна. Попробуйте позже.')
    const taken = () => new AuthError(409, 'login_taken', 'Этот логин занят')
    if (this.byLogin(login)) throw taken()
    const hash = await hashPassword(raw.password)
    return this.db.tx(() => {
      // параллельная регистрация того же логина: второй получает «занят»
      if (this.byLogin(login)) throw taken()
      const id = newId('u')
      this.db.run('INSERT INTO users (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)', id, login, hash, now)
      recordConsents(this.db, id, ['terms', 'personal_data'], raw.consent.version, client, now)
      this.regs.hit(`ip:${client.ip}`, now)
      this.regs.hit('all', now)
      return this.byId(id)!
    })
  }

  async login(rawLogin: string, password: string, client: Client, now: number): Promise<LoginOutcome> {
    const login = normalizeLogin(rawLogin)
    const L = AUTH_LIMITS
    const text = 'Слишком много попыток входа. Попробуйте позже.'
    this.limited(this.fails, `ip:${client.ip}`, L.loginFailPerIp, now, text)
    this.limited(this.fails, `l:${login}`, L.loginFailPerLogin, now, text)
    const user = this.byLogin(login)
    // на неизвестный логин считаем scrypt так же: по времени ответа логин не узнать
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok) {
      this.fails.hit(`ip:${client.ip}`, now)
      this.fails.hit(`l:${login}`, now)
      this.onFail(client.ip)
      throw new AuthError(401, 'bad_credentials', 'Неверный логин или пароль')
    }
    if (user.blocked_at) throw BLOCKED()
    if (user.tg_id === null || !this.tg) return { user }
    return this.openChallenge(user, 'login', client, now)
  }

  /** Заявка 2FA (вход или отвязка). Секрет знает только этот браузер, `ref` уходит в кнопки бота. */
  private async openChallenge(user: UserRow, kind: 'login' | 'unlink', client: Client, now: number) {
    const secret = randomToken(16)
    const ref = randomToken(16)
    const id = sha256(secret)
    const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
    const ttl = kind === 'login' ? CHALLENGE_TTL : UNLINK_TTL
    this.db.tx(() => {
      // одна открытая заявка своего вида на пользователя
      this.db.run("DELETE FROM login_challenges WHERE user_id = ? AND kind = ? AND status = 'pending'", user.id, kind)
      this.db.run(
        'INSERT INTO login_challenges (id, ref, user_id, kind, code_hash, ip, ua, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        ref,
        user.id,
        kind,
        this.codeHash(id, code),
        client.ip,
        client.ua.slice(0, 300),
        now,
        now + ttl,
      )
    })
    const mid =
      kind === 'login'
        ? await this.tg!.loginPrompt(user.tg_id!, { ref, code, device: describeDevice(client.ua), at: now })
        : await this.tg!.unlinkPrompt(user.tg_id!, { ref, at: now })
    if (mid !== null) this.db.run('UPDATE login_challenges SET tg_message_id = ? WHERE id = ?', mid, id)
    return { challenge: secret, expiresAt: now + ttl, sent: mid !== null }
  }

  /** Опрос заявки на вход или ручной код. Сессию выдаёт только этот вызов с секретом заявки. */
  checkChallenge(secret: string, code: string | undefined, client: Client, now: number): { status: 'pending' } | { user: UserRow } {
    this.limited(this.polls, client.ip, AUTH_LIMITS.challengePerIp, now, 'Слишком много попыток. Попробуйте позже.')
    this.polls.hit(client.ip, now)
    const id = sha256(secret)
    const gone = () => new AuthError(410, 'challenge_gone', 'Запрос на вход устарел. Войдите ещё раз.')
    const row = this.db.get<ChallengeRow>("SELECT * FROM login_challenges WHERE id = ? AND kind = 'login'", id)
    if (!row || row.expires_at <= now) throw gone()
    if (row.status === 'denied') throw new AuthError(410, 'challenge_denied', 'Вход отклонён в Telegram')
    if (code !== undefined && row.status === 'pending') {
      if (!isCode(code) || !timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(this.codeHash(id, code)))) {
        // попытка сгорает атомарно: параллельные неверные коды не дают лишних попыток
        this.db.run('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?', id)
        this.db.run('DELETE FROM login_challenges WHERE id = ? AND attempts >= ?', id, CHALLENGE_ATTEMPTS)
        this.onFail(client.ip)
        throw new AuthError(400, 'bad_code', 'Неверный код')
      }
    } else if (row.status !== 'approved') return { status: 'pending' }
    // одноразово: параллельный запрос уже забрал заявку
    if (!this.db.run('DELETE FROM login_challenges WHERE id = ?', id).changes) throw gone()
    const user = this.byId(row.user_id)
    if (!user || user.blocked_at) throw BLOCKED()
    if (code !== undefined && row.tg_message_id !== null && this.tg && user.tg_id !== null) void this.tg.close(user.tg_id, row.tg_message_id, 'Вход подтверждён кодом')
    return { user }
  }

  /** Кнопка в боте. Принимается только от владельца (tg_id) открытой заявки. */
  async decide(ref: string, tgId: number, answer: 'ok' | 'no', now: number): Promise<Decision> {
    const row = this.db.get<ChallengeRow>('SELECT * FROM login_challenges WHERE ref = ?', ref)
    if (!row || row.status !== 'pending' || row.expires_at <= now) return 'gone'
    const owner = this.byId(row.user_id)
    if (!owner || owner.tg_id !== tgId) return 'not_yours'
    const close = async (text: string) => {
      if (row.tg_message_id !== null && this.tg) await this.tg.close(tgId, row.tg_message_id, text)
    }
    if (row.kind === 'login') {
      const status = answer === 'ok' ? 'approved' : 'denied'
      if (!this.db.run("UPDATE login_challenges SET status = ? WHERE id = ? AND status = 'pending'", status, row.id).changes) return 'gone'
      await close(status === 'approved' ? 'Вход подтверждён' : 'Вход отклонён. Смените пароль на сайте: «Забыли пароль?».')
      return status
    }
    // отвязка
    if (!this.db.run('DELETE FROM login_challenges WHERE id = ?', row.id).changes) return 'gone'
    if (answer === 'no') {
      await close('Защита остаётся включённой')
      return 'kept'
    }
    this.db.tx(() => {
      this.db.run('UPDATE users SET tg_id = NULL, tg_linked_at = NULL WHERE id = ?', row.user_id)
      this.db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id)
      this.db.run('DELETE FROM login_challenges WHERE user_id = ?', row.user_id)
    })
    await close('Telegram отключён от аккаунта. Войдите на сайте заново.')
    return 'unlinked'
  }

  async changePassword(user: UserRow, current: string, password: string, keepSession: string) {
    if (!(await verifyPassword(current, user.password_hash))) throw new AuthError(401, 'bad_credentials', 'Текущий пароль неверный')
    const pe = passwordError(password, user.login)
    if (pe) throw new AuthError(400, 'weak_password', pe)
    const hash = await hashPassword(password)
    this.db.tx(() => {
      this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id)
      this.db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', user.id, sha256(keepSession))
    })
    if (user.tg_id !== null && this.tg) void this.tg.notice(user.tg_id, 'Пароль от аккаунта изменён. Если это были не вы, восстановите пароль на сайте.')
  }

  // ---------- Telegram: привязка и отвязка ----------

  createLink(user: UserRow, now: number): { url: string; expiresAt: number } {
    if (!this.tg) throw new AuthError(503, 'tg_off', 'Telegram временно недоступен')
    if (user.tg_id !== null) throw new AuthError(409, 'tg_linked', 'Telegram уже подключён')
    const token = randomToken(32)
    this.db.tx(() => {
      this.db.run('DELETE FROM tg_links WHERE user_id = ? OR expires_at <= ?', user.id, now)
      this.db.run('INSERT INTO tg_links (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, now + LINK_TTL)
    })
    return { url: this.tg.linkUrl(token), expiresAt: now + LINK_TTL }
  }

  /** /start <token> в боте. */
  linkByToken(token: string, tgId: number, now: number): LinkResult {
    if (!TOKEN_RE.test(token)) return 'bad_token'
    return this.db.tx(() => {
      const row = this.db.get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM tg_links WHERE token_hash = ?', sha256(token))
      if (!row || row.expires_at <= now) return 'bad_token'
      const taken = this.db.get<{ id: string }>('SELECT id FROM users WHERE tg_id = ?', tgId)
      if (taken && taken.id !== row.user_id) return 'tg_taken'
      const user = this.byId(row.user_id)
      if (!user || user.blocked_at) return 'blocked'
      this.db.run('DELETE FROM tg_links WHERE token_hash = ?', sha256(token))
      this.db.run('UPDATE users SET tg_id = ?, tg_linked_at = ? WHERE id = ?', tgId, now, user.id)
      return 'linked'
    })
  }

  loginOfTg(tgId: number): string | null {
    return this.db.get<{ login: string }>('SELECT login FROM users WHERE tg_id = ?', tgId)?.login ?? null
  }

  async startUnlink(user: UserRow, client: Client, now: number) {
    if (!this.tg) throw new AuthError(503, 'tg_off', 'Telegram временно недоступен')
    if (user.tg_id === null) throw new AuthError(409, 'no_tg', 'Telegram не подключён')
    return this.openChallenge(user, 'unlink', client, now)
  }

  // ---------- восстановление пароля ----------

  /**
   * Ответ маршрута всегда одинаков; ссылка уходит в бот только привязанному незаблокированному
   * аккаунту. Возвращает промис отправки (или null): обработчик его не ждёт, тесты ждут.
   */
  requestReset(rawLogin: string, origin: string, client: Client, now: number): Promise<boolean> | null {
    const login = normalizeLogin(rawLogin)
    const L = AUTH_LIMITS
    const text = 'Слишком много запросов. Попробуйте позже.'
    this.limited(this.resets, `ip:${client.ip}`, L.resetPerIp, now, text)
    this.limited(this.resets, `l:${login}`, L.resetPerLogin, now, text)
    this.resets.hit(`ip:${client.ip}`, now)
    this.resets.hit(`l:${login}`, now)
    const user = this.byLogin(login)
    if (!user || user.blocked_at || user.tg_id === null || !this.tg) return null
    const token = randomToken(32)
    this.db.tx(() => {
      this.db.run('DELETE FROM password_resets WHERE user_id = ?', user.id)
      this.db.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, now + RESET_TTL)
    })
    // токен во фрагменте: браузер не шлёт его серверу, в логи nginx он не попадёт
    return this.tg.resetLink(user.tg_id, `${origin}/reset#${token}`)
  }

  async confirmReset(token: string, password: string, now: number) {
    const gone = () => new AuthError(410, 'reset_gone', 'Ссылка устарела. Запросите новую.')
    if (!TOKEN_RE.test(token)) throw gone()
    const row = this.db.get<{ user_id: string; expires_at: number; used_at: number | null }>('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?', sha256(token))
    if (!row || row.used_at !== null || row.expires_at <= now) throw gone()
    const user = this.byId(row.user_id)
    if (!user || user.blocked_at) throw gone()
    const pe = passwordError(password, user.login)
    if (pe) throw new AuthError(400, 'weak_password', pe)
    const hash = await hashPassword(password)
    this.db.tx(() => {
      if (!this.db.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', now, sha256(token)).changes) throw gone()
      this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id)
      this.db.run('DELETE FROM sessions WHERE user_id = ?', user.id)
      this.db.run("DELETE FROM login_challenges WHERE user_id = ? AND status = 'pending'", user.id)
    })
    if (user.tg_id !== null && this.tg) void this.tg.notice(user.tg_id, 'Пароль изменён, все устройства вышли из аккаунта.')
  }

  // ---------- сессии ----------

  createSession(userId: string, ip: string, now: number): string {
    const token = randomToken(32)
    this.db.run('INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)', sha256(token), userId, now, now, now + SESSION_TTL, ip)
    // не больше 10 устройств: самые старые сессии закрываются
    this.db.run(
      'DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen DESC LIMIT ?)',
      userId,
      userId,
      MAX_SESSIONS,
    )
    return token
  }

  /** Пользователь по токену сессии; просроченная сессия и заблокированный аккаунт: null. */
  touch(token: string | undefined, now: number): UserRow | null {
    if (!token || token.length > 100) return null
    const id = sha256(token)
    const s = this.db.get<{ user_id: string; last_seen: number; expires_at: number }>('SELECT user_id, last_seen, expires_at FROM sessions WHERE id = ?', id)
    if (!s) return null
    if (s.expires_at <= now) {
      this.db.run('DELETE FROM sessions WHERE id = ?', id)
      return null
    }
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', s.user_id)
    if (!user || user.blocked_at) return null
    if (now - s.last_seen > SESSION_REFRESH) {
      this.db.run('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?', now, now + SESSION_TTL, id)
      this.db.run('UPDATE users SET last_active_at = ? WHERE id = ?', now, user.id)
    }
    return user
  }

  dropSession(token: string | undefined) {
    if (token && token.length <= 100) this.db.run('DELETE FROM sessions WHERE id = ?', sha256(token))
  }

  view(user: UserRow | null, now: number): User {
    if (!user) return guestView(this.tgEnabled)
    return {
      id: user.id,
      login: user.login,
      email: user.email,
      name: user.login,
      isGuest: false,
      telegram: user.tg_id !== null,
      tgEnabled: this.tgEnabled,
      subscription: subscriptionView(this.db, user.id, readSettings(this.db), now),
    }
  }
}
