/**
 * Дополнительные аккаунты админки и приглашения. Основной аккаунт - в /etc/ruai-admin.env,
 * остальные - в ADMIN_DATA_DIR (admins.json, chmod 600): логин, хеш пароля (scrypt), TOTP-секрет.
 *
 * Приглашение выпускает scripts/admin-invite.ts на сервере: одноразовая ссылка
 * `<origin>/<ADMIN_PATH>/#/invite/<token>` на 48 часов. Токен - в части после #, поэтому не
 * попадает ни в логи nginx, ни в Referer. В файле хранится только sha256 токена.
 * Файлы читаются при каждом обращении: их меняют и сервер, и скрипт.
 */
import { chownSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newTotpSecret, randomToken, sha256 } from './crypto.ts'

export const INVITE_TTL = 48 * 3_600_000
export const MIN_PASSWORD = 14
export const MAX_ADMINS = 10
const LOGIN_RE = /^[a-z0-9._-]{3,32}$/

export interface AdminAccount {
  login: string
  passwordHash: string
  totpSecret: string
  createdAt: number
  /** Последний принятый шаг TOTP: повтор кода невозможен. */
  lastStep: number
}

export interface Invite {
  tokenHash: string
  login: string
  totpSecret: string
  createdAt: number
  expiresAt: number
}

/** Логин нового администратора: 3-32 символа, строчная латиница, цифры, . _ - */
export function checkLogin(login: string): string | null {
  return LOGIN_RE.test(login) ? null : 'Логин: 3-32 символа, строчная латиница, цифры, . _ -'
}

export function inviteLink(origin: string, adminPath: string, token: string) {
  return `${origin.replace(/\/+$/, '')}/${adminPath}/#/invite/${token}`
}

/** Строки KEY=VALUE env-файла (кавычки снимаются, комментарии пропускаются). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line)
    if (!m) continue
    out[m[1]!] = m[2]!.trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

export class AdminAccounts {
  private dir: string
  /** Основной логин из env: его нельзя занять приглашением. */
  private primary: string

  constructor(dir: string, primaryLogin: string) {
    this.dir = dir
    this.primary = primaryLogin.toLowerCase()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  private read<T>(name: string): T[] {
    try {
      const v = JSON.parse(readFileSync(join(this.dir, name), 'utf8'))
      return Array.isArray(v) ? (v as T[]) : []
    } catch {
      return []
    }
  }

  private write(name: string, value: unknown) {
    const file = join(this.dir, name)
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
    // скрипт запускается от root: файл должен остаться у владельца каталога (сервиса)
    if (process.getuid?.() === 0) {
      const st = statSync(this.dir)
      chownSync(`${file}.tmp`, st.uid, st.gid)
    }
    renameSync(`${file}.tmp`, file)
  }

  list(): AdminAccount[] {
    return this.read<AdminAccount>('admins.json')
  }

  find(login: string): AdminAccount | null {
    const l = login.toLowerCase()
    return this.list().find((a) => a.login === l) ?? null
  }

  /** Логин занят основным аккаунтом или дополнительным. */
  taken(login: string) {
    return login.toLowerCase() === this.primary || !!this.find(login)
  }

  setLastStep(login: string, step: number) {
    const all = this.list()
    const a = all.find((x) => x.login === login)
    if (!a) return
    a.lastStep = Math.max(a.lastStep, step)
    this.write('admins.json', all)
  }

  remove(login: string): boolean {
    const l = login.toLowerCase()
    const all = this.list()
    const left = all.filter((a) => a.login !== l)
    const invites = this.read<Invite>('invites.json')
    const leftInv = invites.filter((i) => i.login !== l)
    if (left.length !== all.length) this.write('admins.json', left)
    if (leftInv.length !== invites.length) this.write('invites.json', leftInv)
    return left.length !== all.length || leftInv.length !== invites.length
  }

  /** Новое приглашение; прежнее приглашение на тот же логин перестаёт действовать. */
  createInvite(login: string, now: number): { token: string; invite: Invite } {
    const l = login.trim().toLowerCase()
    const bad = checkLogin(l)
    if (bad) throw new Error(bad)
    if (this.taken(l)) throw new Error(`Логин ${l} уже занят`)
    if (this.list().length >= MAX_ADMINS) throw new Error(`Не больше ${MAX_ADMINS} дополнительных администраторов`)
    const token = randomToken()
    const invite: Invite = { tokenHash: sha256(token), login: l, totpSecret: newTotpSecret(), createdAt: now, expiresAt: now + INVITE_TTL }
    const keep = this.read<Invite>('invites.json').filter((i) => i.expiresAt > now && i.login !== l)
    this.write('invites.json', [...keep, invite])
    return { token, invite }
  }

  /** Действующие приглашения (без секретов). */
  pending(now: number): { login: string; expiresAt: number }[] {
    return this.read<Invite>('invites.json')
      .filter((i) => i.expiresAt > now)
      .map((i) => ({ login: i.login, expiresAt: i.expiresAt }))
  }

  invite(token: string, now: number): Invite | null {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
    const h = sha256(token)
    return this.read<Invite>('invites.json').find((i) => i.tokenHash === h && i.expiresAt > now) ?? null
  }

  /** Принимает приглашение (пароль и код уже проверены): аккаунт создан, ссылка больше не работает. */
  accept(token: string, passwordHash: string, step: number, now: number): AdminAccount | null {
    const inv = this.invite(token, now)
    if (!inv || this.taken(inv.login)) return null
    const acc: AdminAccount = { login: inv.login, passwordHash, totpSecret: inv.totpSecret, createdAt: now, lastStep: step }
    this.write('admins.json', [...this.list(), acc])
    this.write(
      'invites.json',
      this.read<Invite>('invites.json').filter((i) => i.tokenHash !== inv.tokenHash && i.expiresAt > now),
    )
    return acc
  }
}
