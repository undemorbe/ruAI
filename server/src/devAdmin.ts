/**
 * Локальная админка на настоящей базе (`npm run dev:admin:db` в корне + `npm run dev:admin-db` здесь):
 * сервер админки читает базу, которую ведёт `npm run dev:api` (server/.data/ruai.db).
 *
 * Значения ниже - только для localhost: config.ts принимает http-origin лишь для localhost
 * и слушает только loopback, поэтому с ними админку нельзя поднять наружу. Без импортов:
 * файл подключает и vite.admin.config.ts (прокси), и скрипт сервера.
 */
export const DEV_ADMIN_PATH = 'local-dev-admin-0123456789abcdefghijklmn'
export const DEV_ADMIN_PORT = 8788
export const DEV_ADMIN_ORIGIN = 'http://localhost:5195'
export const DEV_ADMIN_LOGIN = 'admin'
export const DEV_ADMIN_PASSWORD = 'demo'
/** 160 бит в base32; текущий код скрипт печатает в консоль. */
export const DEV_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

export function devAdminEnv(env: Record<string, string | undefined>, passwordHash: string) {
  if (env.NODE_ENV === 'production') throw new Error('dev-админка не запускается с NODE_ENV=production')
  return {
    ADMIN_PATH: DEV_ADMIN_PATH,
    ADMIN_LOGIN: DEV_ADMIN_LOGIN,
    ADMIN_PASSWORD_HASH: passwordHash,
    ADMIN_TOTP_SECRET: DEV_TOTP_SECRET,
    ADMIN_ORIGIN: DEV_ADMIN_ORIGIN,
    HOST: '127.0.0.1',
    PORT: String(DEV_ADMIN_PORT),
    ADMIN_DATA_DIR: '.data/admin',
    ADMIN_AUTH_LOG: '.data/admin-auth.log',
    ADMIN_DEMO: '',
    RUAI_DB: env.RUAI_DB?.trim() || '.data/ruai.db',
    RUAI_IMAGES_DIR: env.RUAI_IMAGES_DIR?.trim() || '.data/images',
  }
}
