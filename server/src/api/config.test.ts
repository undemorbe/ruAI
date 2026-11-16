import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadApiConfig } from './config.ts'

const base = {
  API_ORIGIN: 'https://ru-chatgpt.com',
  API_PEPPER: 'x'.repeat(43),
  OPENROUTER_API_KEY: 'sk-or-v1-' + 'a'.repeat(64),
  TG_BOT_TOKEN: '123456789:' + 'A'.repeat(35),
}

test('прод-конфиг: всё на месте', () => {
  const c = loadApiConfig(base)
  assert.equal(c.host, '127.0.0.1')
  assert.equal(c.insecureCookie, false)
  assert.equal(c.tgToken, base.TG_BOT_TOKEN)
  assert.equal(c.llmStub, false)
  assert.equal(c.dbFile, '/var/lib/ruai/ruai.db')
})

test('в проде нельзя с коротким pepper, на внешнем интерфейсе, с заглушками', () => {
  assert.throws(() => loadApiConfig({ ...base, API_PEPPER: 'short' }), /API_PEPPER/)
  assert.throws(() => loadApiConfig({ ...base, HOST: '0.0.0.0' }), /HOST/)
  assert.throws(() => loadApiConfig({ ...base, API_ORIGIN: 'http://ru-chatgpt.com' }), /API_ORIGIN/)
  assert.throws(() => loadApiConfig({ ...base, OPENROUTER_API_KEY: 'bad key; rm -rf' }), /OPENROUTER/)
  assert.throws(() => loadApiConfig({ ...base, API_DAILY_USD_CAP: '-1' }), /CAP/)
  assert.equal(loadApiConfig({ ...base, LLM_STUB: '1' }).llmStub, false, 'заглушка модели только для localhost')
})

test('localhost: заглушка модели по явному флагу', () => {
  const c = loadApiConfig({ ...base, API_ORIGIN: 'http://localhost:5194', LLM_STUB: '1' })
  assert.equal(c.llmStub, true)
  assert.equal(c.insecureCookie, true)
})

test('без ключа OpenRouter сервер стартует, модель выключена; кривой ключ: ошибка', () => {
  const c = loadApiConfig({ ...base, OPENROUTER_API_KEY: '' })
  assert.equal(c.openrouterKey, '')
  const noKey: Record<string, string> = { ...base }
  delete noKey.OPENROUTER_API_KEY
  assert.equal(loadApiConfig(noKey).openrouterKey, '')
  assert.throws(() => loadApiConfig({ ...base, OPENROUTER_API_KEY: 'bad key; rm -rf' }), /OPENROUTER/)
})

test('токен бота необязателен, но кривой не принимается', () => {
  assert.equal(loadApiConfig({ ...base, TG_BOT_TOKEN: '' }).tgToken, '')
  const noTok: Record<string, string> = { ...base }
  delete noTok.TG_BOT_TOKEN
  assert.equal(loadApiConfig(noTok).tgToken, '')
  assert.throws(() => loadApiConfig({ ...base, TG_BOT_TOKEN: 'bad token' }), /TG_BOT_TOKEN/)
  assert.throws(() => loadApiConfig({ ...base, TG_BOT_TOKEN: '123:short' }), /TG_BOT_TOKEN/)
})

test('FreeKassa: без ключей оплата выключена, с ключами включена, проверка IP по умолчанию', () => {
  const off = loadApiConfig(base)
  assert.equal(off.payments, 'none')
  assert.equal(off.freekassa, null)
  const fk = { FREEKASSA_MERCHANT_ID: '12345', FREEKASSA_SECRET1: 'first-secret', FREEKASSA_SECRET2: 'second-secret' }
  const on = loadApiConfig({ ...base, ...fk })
  assert.equal(on.payments, 'freekassa')
  assert.deepEqual(on.freekassa, { merchantId: '12345', secret1: 'first-secret', secret2: 'second-secret', payUrl: 'https://pay.fk.money/', ipCheck: true })
  assert.equal(loadApiConfig({ ...base, ...fk, FREEKASSA_IP_CHECK: '0' }).freekassa!.ipCheck, false)
  // неполные или неверные ключи: сервер не стартует, а не принимает оплату с пустой подписью
  assert.throws(() => loadApiConfig({ ...base, FREEKASSA_MERCHANT_ID: '12345' }), /FREEKASSA_SECRET/)
  assert.throws(() => loadApiConfig({ ...base, ...fk, FREEKASSA_MERCHANT_ID: 'shop' }), /FREEKASSA_MERCHANT_ID/)
  assert.throws(() => loadApiConfig({ ...base, ...fk, FREEKASSA_SECRET2: 'first-secret' }), /различаться/)
  assert.throws(() => loadApiConfig({ ...base, ...fk, FREEKASSA_PAY_URL: 'http://evil.example/' }), /FREEKASSA_PAY_URL/)
})
