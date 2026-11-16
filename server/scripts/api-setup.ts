/**
 * Настройка API сайта на сервере: ключ OpenRouter, токен бота входа и ключи FreeKassa.
 *
 *   node --import ./src/register.ts scripts/api-setup.ts --origin https://ru-chatgpt.com --write /etc/ruai-api.env
 *
 * Ключ и токен вводятся без эха и сразу пишутся в файл (chmod 600): в терминал,
 * историю команд и чат они не попадают. Оба можно оставить пустыми. Повторный запуск сохраняет прежние pepper, ключ и токен.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { envValue, newPepper, renderApiEnv, validateApiEnv, type ApiEnvValues } from '../src/api/setup.ts'
import { ask, askVisible } from './ask.ts'

const argv = process.argv.slice(2)
const arg = (k: string) => {
  const i = argv.indexOf(k)
  return i >= 0 ? (argv[i + 1] ?? null) : null
}
const origin = arg('--origin') ?? ''
const write = arg('--write')
if (!write || !write.startsWith('/')) {
  console.error('Нужно: --write /etc/ruai-api.env')
  process.exit(1)
}

const old = existsSync(write) ? readFileSync(write, 'utf8') : ''
const keepPepper = envValue(old, 'API_PEPPER')

console.log('Ключ OpenRouter: openrouter.ai → Keys. Лучше отдельный ключ с лимитом расходов в кабинете OpenRouter.')
console.log('Пустой ввод: модель пока не подключена (вход и чаты работают, сообщения отвечают «недоступно»). Прежний ключ сохраняется.')
const openrouterKey = (await ask('OPENROUTER_API_KEY (ввод скрыт): ')).trim() || (envValue(old, 'OPENROUTER_API_KEY') ?? '')
console.log('\nБот входа: @BotFather → /newbot, токен вида 123456:ABC…. Пустой ввод: оставить прежний (или вход без Telegram-2FA).')
const tgToken = (await ask('TG_BOT_TOKEN (ввод скрыт): ')).trim() || (envValue(old, 'TG_BOT_TOKEN') ?? '')
const cap = Number(await askVisible('Предохранитель: максимум расходов OpenRouter в сутки, $', envValue(old, 'API_DAILY_USD_CAP') ?? '30'))

console.log('\nFreeKassa: кабинет → Настройки магазина. URL оповещения: ' + (origin || 'https://<домен>') + '/api/billing/webhook/freekassa')
console.log('Пустой ввод: оставить прежние ключи (или оплата выключена, если их не было).')
const fkMerchantId = (await askVisible('FREEKASSA_MERCHANT_ID (ID магазина)', envValue(old, 'FREEKASSA_MERCHANT_ID') ?? '')).trim()
const fkSecret1 = (await ask('FREEKASSA_SECRET1, секретное слово 1 (ввод скрыт): ')).trim() || (envValue(old, 'FREEKASSA_SECRET1') ?? '')
const fkSecret2 = (await ask('FREEKASSA_SECRET2, секретное слово 2 (ввод скрыт): ')).trim() || (envValue(old, 'FREEKASSA_SECRET2') ?? '')

const v: ApiEnvValues = { origin, pepper: keepPepper ?? newPepper(), openrouterKey, tgToken, dailyUsdCap: cap, fkMerchantId, fkSecret1, fkSecret2 }
const errors = validateApiEnv(v)
if (errors.length) {
  console.error(`\nНе записано:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
writeFileSync(write, renderApiEnv(v), { mode: 0o600 })
chmodSync(write, 0o600)
console.log(`\nЗаписано в ${write} (chmod 600).${keepPepper ? ' Pepper сохранён.' : ''}\nДальше: bash /opt/ruai/deploy/server-apply.sh`)
