/**
 * Сервер админки на локальной базе сайта (только localhost):
 *   cd server && npm run dev:api        - API сайта, ведёт .data/ruai.db
 *   cd server && npm run dev:admin-db   - этот скрипт, 127.0.0.1:8788
 *   npm run dev:admin:db                - интерфейс админки, http://localhost:5195
 * Вход: admin / demo / код, который скрипт печатает раз в 30 секунд.
 */
import { existsSync } from 'node:fs'
import { base32Decode, hashPassword, totpAt } from '../src/crypto.ts'
import { DEV_ADMIN_ORIGIN, DEV_ADMIN_PASSWORD, DEV_TOTP_SECRET, devAdminEnv } from '../src/devAdmin.ts'

let env
try {
  env = devAdminEnv(process.env, await hashPassword(DEV_ADMIN_PASSWORD))
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`)
  process.exit(1)
}
Object.assign(process.env, env)
if (!existsSync(env.RUAI_DB)) process.stderr.write(`нет ${env.RUAI_DB}: сначала запустите npm run dev:api (без базы отчёты отвечают 501)\n`)

const secret = base32Decode(DEV_TOTP_SECRET)
const show = () => process.stderr.write(`dev-админка ${DEV_ADMIN_ORIGIN}: admin / ${DEV_ADMIN_PASSWORD} / код ${totpAt(secret, Math.floor(Date.now() / 30_000))}\n`)
show()
setInterval(show, 30_000).unref()

await import('../src/main.ts')
