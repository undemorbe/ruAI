/**
 * Сессии и защита входа. Всё в памяти: одна учётная запись, один процесс.
 * Перезапуск сервера закрывает все сессии — это нормально для админки.
 */
import { randomToken, sha256 } from './crypto.ts'

export interface Session {
  login: string
  createdAt: number
  lastSeen: number
  ip: string
  /** Хеш User-Agent: украденный cookie из другого браузера не подойдёт. */
  ua: string
}

export class Sessions {
  private map = new Map<string, Session>()
  private idleMs: number
  private absoluteMs: number

  constructor(idleMs: number, absoluteMs: number) {
    this.idleMs = idleMs
    this.absoluteMs = absoluteMs
  }

  create(login: string, ip: string, ua: string, now = Date.now()): string {
    // одна активная сессия: новый вход закрывает старые
    this.map.clear()
    const token = randomToken()
    this.map.set(sha256(token), { login, createdAt: now, lastSeen: now, ip, ua: sha256(ua) })
    return token
  }

  /** Проверяет и продлевает сессию; просроченную удаляет. */
  touch(token: string | undefined, ua: string, now = Date.now()): Session | null {
    if (!token || token.length > 100) return null
    const key = sha256(token)
    const s = this.map.get(key)
    if (!s) return null
    if (now - s.lastSeen > this.idleMs || now - s.createdAt > this.absoluteMs || s.ua !== sha256(ua)) {
      this.map.delete(key)
      return null
    }
    s.lastSeen = now
    return s
  }

  expiresAt(s: Session) {
    return Math.min(s.lastSeen + this.idleMs, s.createdAt + this.absoluteMs)
  }

  drop(token: string | undefined) {
    if (token) this.map.delete(sha256(token))
  }
}

/**
 * Ограничение попыток входа: 5 ошибок за 15 минут с одного IP — блок на 15 минут;
 * 20 ошибок за час со всех IP — вход закрыт на час (защита от распределённого перебора).
 * Сетевой бан на часы делает fail2ban по строкам журнала.
 */
export class Throttle {
  private perIp = new Map<string, number[]>()
  private all: number[] = []
  private lockedIp = new Map<string, number>()
  private lockedAll = 0

  static readonly IP_MAX = 5
  static readonly IP_WINDOW = 15 * 60_000
  static readonly GLOBAL_MAX = 20
  static readonly GLOBAL_WINDOW = 60 * 60_000

  /** Секунды до разблокировки или 0. */
  retryAfter(ip: string, now = Date.now()): number {
    const until = Math.max(this.lockedIp.get(ip) ?? 0, this.lockedAll)
    return until > now ? Math.ceil((until - now) / 1000) : 0
  }

  /** Записывает ошибку; true — если после неё наступила блокировка. */
  fail(ip: string, now = Date.now()): boolean {
    const list = (this.perIp.get(ip) ?? []).filter((t) => now - t < Throttle.IP_WINDOW)
    list.push(now)
    this.perIp.set(ip, list)
    this.all = this.all.filter((t) => now - t < Throttle.GLOBAL_WINDOW)
    this.all.push(now)
    let locked = false
    if (list.length >= Throttle.IP_MAX) {
      this.lockedIp.set(ip, now + Throttle.IP_WINDOW)
      locked = true
    }
    if (this.all.length >= Throttle.GLOBAL_MAX) {
      this.lockedAll = now + Throttle.GLOBAL_WINDOW
      locked = true
    }
    return locked
  }

  success(ip: string) {
    this.perIp.delete(ip)
    this.lockedIp.delete(ip)
  }
}
