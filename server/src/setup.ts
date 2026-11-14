/** Чистые функции первичной настройки (используются scripts/admin-setup.ts, покрыты тестами). */

export interface SetupArgs {
  login: string
  origin: string | null
  write: string | null
  force: boolean
}

export function parseSetupArgs(argv: string[]): SetupArgs {
  const out: SetupArgs = { login: 'admin', origin: null, write: null, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--origin') out.origin = argv[++i] ?? null
    else if (a === '--write') out.write = argv[++i] ?? null
    else if (a === '--force') out.force = true
    else if (a.startsWith('--')) throw new Error(`Неизвестный параметр ${a}`)
    else out.login = a
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(out.login)) throw new Error('Логин: 1–64 символа, латиница, цифры, . _ -')
  if (out.origin !== null && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(out.origin)) throw new Error('--origin: https://домен без пути')
  if (out.write !== null && !out.write.startsWith('/')) throw new Error('--write: абсолютный путь')
  return out
}

export interface EnvValues {
  adminPath: string
  login: string
  passwordHash: string
  totpSecret: string
  origin: string | null
}

/** Содержимое /etc/ruai-admin.env. Хеш в одинарных кавычках: в нём есть `$`. */
export function renderEnv(v: EnvValues): string {
  return [
    '# ruAI admin — секреты. chmod 600, владелец root. Создано scripts/admin-setup.ts',
    `ADMIN_PATH=${v.adminPath}`,
    `ADMIN_LOGIN=${v.login}`,
    `ADMIN_PASSWORD_HASH='${v.passwordHash}'`,
    `ADMIN_TOTP_SECRET=${v.totpSecret}`,
    `ADMIN_ORIGIN=${v.origin ?? 'https://ВАШ-ДОМЕН'}`,
    'ADMIN_DATA_DIR=/var/lib/ruai-admin',
    'ADMIN_AUTH_LOG=/var/log/ruai-admin/auth.log',
    '',
  ].join('\n')
}
