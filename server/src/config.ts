/**
 * Настройки сервера админки из окружения (systemd EnvironmentFile, chmod 600).
 * Запуск без обязательных значений невозможен — лучше упасть, чем открыть админку без защиты.
 */
import { base32Decode } from './crypto.ts'

export interface Config {
  host: string
  port: number
  /** Секретный сегмент пути: /<adminPath>/api/… */
  adminPath: string
  login: string
  passwordHash: string
  totpSecret: string
  /** Точный origin админки для CSRF-проверки, например https://example.ru */
  origin: string
  dataDir: string
  /** Файл, который читает fail2ban (строки ADMIN_AUTH_FAIL ip=…). */
  authLog: string
  demo: boolean
  /** Dev без TLS: cookie без __Host-/Secure (только на localhost). */
  insecureCookie: boolean
  idleMs: number
  absoluteMs: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = []
  const need = (k: string) => {
    const v = env[k]?.trim()
    if (!v) errors.push(`${k} не задан`)
    return v ?? ''
  }

  const adminPath = need('ADMIN_PATH')
  if (adminPath && !/^[A-Za-z0-9_-]{32,128}$/.test(adminPath)) errors.push('ADMIN_PATH: 32–128 символов base64url (сгенерируйте npm run setup)')
  const passwordHash = need('ADMIN_PASSWORD_HASH')
  if (passwordHash && !passwordHash.startsWith('scrypt$')) errors.push('ADMIN_PASSWORD_HASH: ожидается scrypt$…, сгенерируйте npm run setup')
  const totpSecret = need('ADMIN_TOTP_SECRET')
  if (totpSecret) {
    try {
      if (base32Decode(totpSecret).length < 16) errors.push('ADMIN_TOTP_SECRET короче 128 бит')
    } catch {
      errors.push('ADMIN_TOTP_SECRET не в base32')
    }
  }
  const origin = need('ADMIN_ORIGIN').replace(/\/+$/, '')
  if (origin && !/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    errors.push('ADMIN_ORIGIN: https://домен без пути (http — только localhost)')
  }
  const host = env.HOST?.trim() || '127.0.0.1'
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && env.ADMIN_ALLOW_PUBLIC_BIND !== '1') {
    errors.push('HOST: сервер админки слушает только loopback, наружу его открывает nginx')
  }

  if (errors.length) throw new Error(`Конфигурация админки:\n- ${errors.join('\n- ')}`)

  const dataDir = env.ADMIN_DATA_DIR?.trim() || '/var/lib/ruai-admin'
  return {
    host,
    port: Number(env.PORT) || 8787,
    adminPath,
    login: env.ADMIN_LOGIN?.trim() || 'admin',
    passwordHash,
    totpSecret,
    origin,
    dataDir,
    authLog: env.ADMIN_AUTH_LOG?.trim() || '/var/log/ruai-admin/auth.log',
    demo: env.ADMIN_DEMO === '1',
    insecureCookie: origin.startsWith('http://'),
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 60 * 60_000,
  }
}
