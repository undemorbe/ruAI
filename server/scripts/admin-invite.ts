/**
 * Администраторы админки (на сервере, от root):
 *   node scripts/admin-invite.ts <логин>           - одноразовая ссылка-приглашение на 48 часов
 *   node scripts/admin-invite.ts --list            - дополнительные администраторы и приглашения
 *   node scripts/admin-invite.ts --remove <логин>  - удалить аккаунт или приглашение (сессия закрывается)
 * Основной аккаунт - в /etc/ruai-admin.env (admin-setup.ts), здесь не меняется.
 * По ссылке новый администратор сам задаёт пароль и подключает код в приложении-аутентификаторе.
 */
import { readFileSync } from 'node:fs'
import { AdminAccounts, inviteLink, parseEnvFile } from '../src/accounts.ts'

const argv = process.argv.slice(2)
const envIdx = argv.indexOf('--env')
const envFile = envIdx >= 0 ? argv.splice(envIdx, 2)[1] : '/etc/ruai-admin.env'

let env: Record<string, string>
try {
  env = parseEnvFile(readFileSync(envFile!, 'utf8'))
} catch (e) {
  console.error(`Не прочитать ${envFile}: ${(e as Error).message}. Запускайте от root.`)
  process.exit(1)
}
const { ADMIN_PATH, ADMIN_ORIGIN } = env
if (!ADMIN_PATH || !ADMIN_ORIGIN) {
  console.error(`В ${envFile} нет ADMIN_PATH или ADMIN_ORIGIN`)
  process.exit(1)
}
const accounts = new AdminAccounts(env.ADMIN_DATA_DIR || '/var/lib/ruai-admin', env.ADMIN_LOGIN || 'admin')
const day = (ms: number) => new Date(ms).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })

try {
  if (argv[0] === '--list') {
    console.log(`Основной: ${env.ADMIN_LOGIN || 'admin'}`)
    for (const a of accounts.list()) console.log(`Администратор: ${a.login} (с ${day(a.createdAt)})`)
    for (const i of accounts.pending(Date.now())) console.log(`Приглашение: ${i.login} (до ${day(i.expiresAt)} МСК)`)
  } else if (argv[0] === '--remove' && argv[1]) {
    console.log(accounts.remove(argv[1]) ? `${argv[1]}: удалён, его сессия закроется при следующем запросе` : `${argv[1]}: не найден`)
  } else if (argv.length === 1 && !argv[0]!.startsWith('--')) {
    const { token, invite } = accounts.createInvite(argv[0]!, Date.now())
    console.log(`Приглашение для ${invite.login}, действует до ${day(invite.expiresAt)} МСК, одноразовое:\n\n${inviteLink(ADMIN_ORIGIN, ADMIN_PATH, token)}\n`)
    console.log('Ссылка содержит секретный путь админки: передавайте лично, не публикуйте.')
  } else {
    console.error('Нужно: <логин> | --list | --remove <логин>')
    process.exit(1)
  }
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
