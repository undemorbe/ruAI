/**
 * Первичная настройка админки: генерирует секретный путь, хеш пароля и TOTP-секрет.
 *
 *   node scripts/admin-setup.ts [логин] [--origin https://домен] [--write /etc/ruai-admin.env] [--force]
 *
 * Пароль спрашивается без эха (или берётся из ADMIN_SETUP_PASSWORD). С --write секреты сразу
 * пишутся в env-файл (chmod 600) и в терминал не выводятся — кроме адреса админки и TOTP для
 * приложения-аутентификатора. Без --write — печатает строки env-файла.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { hashPassword, newTotpSecret, otpauthUri } from '../src/crypto.ts'
import { parseSetupArgs, renderEnv } from '../src/setup.ts'

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt)
    if (!stdin.isTTY) {
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', (c) => (buf += c))
      stdin.on('end', () => resolve(buf.split('\n')[0] ?? ''))
      return
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    // вставка из менеджера паролей приходит одним куском — разбираем по символам
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          resolve(value)
          return
        } else if (ch === '\u0003') {
          process.exit(130)
        } else if (ch === '\u007f') {
          value = value.slice(0, -1)
        } else {
          value += ch
        }
      }
    }
    stdin.on('data', onData)
  })
}

let args
try {
  args = parseSetupArgs(process.argv.slice(2))
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
const login = args.login
let password = process.env.ADMIN_SETUP_PASSWORD ?? ''
if (!password) {
  password = await ask('Пароль админки (от 14 символов): ')
  const again = await ask('Повторите пароль: ')
  if (password !== again) {
    console.error('Пароли не совпадают')
    process.exit(1)
  }
}
if (password.length < 14) {
  console.error('Пароль короче 14 символов — используйте менеджер паролей и длинную фразу')
  process.exit(1)
}

const adminPath = randomBytes(32).toString('base64url')
const totp = newTotpSecret()
const hash = await hashPassword(password)
const env = renderEnv({ adminPath, login, passwordHash: hash, totpSecret: totp, origin: args.origin })
const uri = otpauthUri(totp, login)

if (args.write) {
  if (existsSync(args.write) && !args.force) {
    console.error(`${args.write} уже существует. Перезаписать (новый путь, пароль и TOTP): --force`)
    process.exit(1)
  }
  writeFileSync(args.write, env, { mode: 0o600 })
  chmodSync(args.write, 0o600)
  console.log(`\nЗаписано в ${args.write} (chmod 600).`)
} else {
  console.log(`\n${env}`)
}

console.log(`
Адрес админки: ${args.origin ?? 'https://ВАШ-ДОМЕН'}/${adminPath}/
Сохраните его в менеджер паролей — больше он нигде не показывается.

Добавьте в приложение-аутентификатор (Aegis, 2FAS, 1Password, Google Authenticator):
  ${uri}
или вручную: секрет ${totp}, TOTP, SHA1, 6 цифр, 30 секунд.
`)
// QR-код для сканирования, если на сервере есть qrencode
const qr = spawnSync('qrencode', ['-t', 'ansiutf8', uri], { stdio: ['ignore', 'inherit', 'ignore'] })
if (qr.error) console.log('(для QR-кода установите qrencode)')
