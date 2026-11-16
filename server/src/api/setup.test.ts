import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadApiConfig } from './config.ts'
import { envValue, newPepper, renderApiEnv, validateApiEnv, type ApiEnvValues } from './setup.ts'

const v: ApiEnvValues = {
  origin: 'https://ru-chatgpt.com',
  pepper: newPepper(),
  openrouterKey: 'sk-or-v1-' + 'f'.repeat(64),
  tgToken: '123456789:' + 'B'.repeat(35),
  dailyUsdCap: 30,
}

const parse = (text: string) => {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m) env[m[1]!] = m[2]!.replace(/^'(.*)'$/, '$1')
  }
  return env
}

test('env-файл: собирается, читается обратно и проходит проверку конфига', () => {
  assert.deepEqual(validateApiEnv(v), [])
  const text = renderApiEnv(v)
  assert.equal(envValue(text, 'API_PEPPER'), v.pepper)
  assert.equal(envValue(text, 'TG_BOT_TOKEN'), v.tgToken)
  assert.doesNotMatch(text, /SMTP|MAIL/)
  const cfg = loadApiConfig(parse(text))
  assert.equal(cfg.tgToken, v.tgToken)
  assert.equal(cfg.dbFile, '/var/lib/ruai/ruai.db')
})

test('неверные значения не записываются', () => {
  assert.ok(validateApiEnv({ ...v, origin: 'http://x' }).length)
  assert.ok(validateApiEnv({ ...v, openrouterKey: 'short' }).length)
  assert.ok(validateApiEnv({ ...v, tgToken: 'nope' }).length)
  assert.ok(validateApiEnv({ ...v, tgToken: `123456:${'A'.repeat(35)}\nAPI_PEPPER=x` }).length, 'перевод строки не подсунет переменную')
  assert.ok(newPepper().length >= 43)
})

test('env без ключа OpenRouter и токена бота: строки закомментированы, конфиг читается', () => {
  const empty = { ...v, openrouterKey: '', tgToken: '' }
  assert.deepEqual(validateApiEnv(empty), [])
  const text = renderApiEnv(empty)
  assert.equal(envValue(text, 'OPENROUTER_API_KEY'), null)
  assert.equal(envValue(text, 'TG_BOT_TOKEN'), null)
  const cfg = loadApiConfig(parse(text))
  assert.equal(cfg.openrouterKey, '')
  assert.equal(cfg.tgToken, '')
})

test('FreeKassa: ключи пишутся в env-файл и включают оплату; неполные и опасные не записываются', () => {
  const fk = { ...v, fkMerchantId: '12345', fkSecret1: 'first-secret', fkSecret2: 'second-secret' }
  assert.deepEqual(validateApiEnv(fk), [])
  const text = renderApiEnv(fk)
  assert.match(text, /\/api\/billing\/webhook\/freekassa/)
  const cfg = loadApiConfig(parse(text))
  assert.equal(cfg.payments, 'freekassa')
  assert.equal(cfg.freekassa!.secret2, 'second-secret')
  assert.equal(loadApiConfig(parse(renderApiEnv(v))).payments, 'none', 'без ключей оплата выключена')
  assert.ok(validateApiEnv({ ...fk, fkSecret2: '' }).length, 'неполные ключи')
  assert.ok(validateApiEnv({ ...fk, fkSecret2: fk.fkSecret1 }).length, 'одинаковые секреты')
  assert.ok(validateApiEnv({ ...fk, fkSecret1: 'abc defgh$X' }).length, 'пробел и $ в секрете')
  assert.ok(validateApiEnv({ ...fk, fkMerchantId: '1\nAPI_PEPPER=x' }).length, 'перевод строки не подсунет переменную')
})
