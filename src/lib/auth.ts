/** Правила входа: логин и пароль, код 2FA из Telegram. Общие для экранов, мока и сервера. */

export const LOGIN_MIN = 3
export const LOGIN_MAX = 32
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
/** Длина кода подтверждения входа из Telegram. */
export const CODE_LENGTH = 6
const RESERVED = new Set(['admin', 'support', 'root', 'ruai', 'chatgpt', 'system'])

export const normalizeLogin = (raw: string) => raw.trim().toLowerCase()

/** Текст ошибки для поля «Логин» или null. */
export function loginError(raw: string): string | null {
  const l = normalizeLogin(raw)
  if (l.length < LOGIN_MIN) return `Логин: от ${LOGIN_MIN} символов`
  if (l.length > LOGIN_MAX) return `Логин: до ${LOGIN_MAX} символов`
  if (!/^[a-z0-9._-]+$/.test(l)) return 'Логин: латиница, цифры, точка, дефис, подчёркивание'
  if (!/^[a-z0-9]/.test(l)) return 'Логин начинается с буквы или цифры'
  if (RESERVED.has(l)) return 'Этот логин занят'
  return null
}

/** Текст ошибки для поля «Пароль» или null. */
export function passwordError(password: string, login: string): string | null {
  if (password.length < PASSWORD_MIN) return `Пароль не короче ${PASSWORD_MIN} символов`
  if (password.length > PASSWORD_MAX) return `Пароль не длиннее ${PASSWORD_MAX} символов`
  if (normalizeLogin(password) === normalizeLogin(login)) return 'Пароль не должен совпадать с логином'
  return null
}

/** Email нужен только для кассового чека. */
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase()

/** Практичная проверка адреса: одна @, домен с точкой, без пробелов, не длиннее 254 (RFC 5321). */
export function isEmail(raw: string): boolean {
  const e = normalizeEmail(raw)
  return e.length <= 254 && /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(e)
}

/** Оставляет только цифры, не длиннее кода (вставка «123 456», «123-456»). */
export const cleanCode = (raw: string) => raw.replace(/\D/g, '').slice(0, CODE_LENGTH)

export const isCode = (raw: string) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(raw)

const AUTH_PATHS = ['/login', '/register', '/reset']

/**
 * Куда вернуть после входа. Только путь внутри сайта: никаких `//host`, `/\host`, схем и
 * управляющих символов (защита от open redirect). Экраны входа тоже нельзя (петля).
 */
export function safeNext(raw: unknown, fallback = '/chat'): string {
  if (typeof raw !== 'string' || raw.length > 512) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback
  const path = raw.split(/[?#]/)[0]!
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return fallback
  return raw
}
