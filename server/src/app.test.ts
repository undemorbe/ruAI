import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { buildApp } from './app.ts'
import type { Config } from './config.ts'
import { base32Decode, hashPassword, newTotpSecret, totpAt, verifyPassword, verifyTotp } from './crypto.ts'
import { loadConfig } from './config.ts'
import { FileStore } from './store.ts'

const PATH = 'A'.repeat(43)
const ORIGIN = 'https://admin.test'
const UA = 'test-agent'
const secret = newTotpSecret()
const hash = await hashPassword('correct horse battery')
const codeAt = (t: number, offset = 0) => totpAt(base32Decode(secret), Math.floor(t / 30_000) + offset)

let clock = Date.UTC(2026, 10, 14, 12, 0, 0)
const events: string[] = []

function make(over: Partial<Config> = {}) {
  const cfg: Config = {
    host: '127.0.0.1',
    port: 0,
    adminPath: PATH,
    login: 'boss',
    passwordHash: hash,
    totpSecret: secret,
    origin: ORIGIN,
    dataDir: mkdtempSync(join(tmpdir(), 'ruai-admin-')),
    authLog: '/dev/null',
    demo: true,
    insecureCookie: false,
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 3_600_000,
    ...over,
  }
  return buildApp(cfg, { store: new FileStore(cfg.dataDir), now: () => clock, log: (e, ip) => events.push(`${e} ${ip}`) })
}

const H = { 'x-requested-with': 'ruai-admin', origin: ORIGIN, 'user-agent': UA }
const url = (p: string) => `/${PATH}/api/${p}`
const login = (app: ReturnType<typeof make>, body: object, headers: Record<string, string> = H) =>
  app.inject({ method: 'POST', url: url('login'), headers, payload: body })
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0]!

beforeEach(() => {
  clock += 10 * 60_000 // свежий шаг TOTP для каждого теста
  events.length = 0
})

describe('crypto', () => {
  it('scrypt: верный и неверный пароль', async () => {
    assert.equal(await verifyPassword('correct horse battery', hash), true)
    assert.equal(await verifyPassword('wrong', hash), false)
    assert.equal(await verifyPassword('correct horse battery', null), false)
  })

  it('TOTP по RFC 6238 (вектор SHA1, T=59)', () => {
    const rfcSecret = Buffer.from('12345678901234567890')
    // RFC 6238, приложение B: 94287082 → последние 6 цифр
    assert.equal(totpAt(rfcSecret, Math.floor(59 / 30)), '287082')
  })

  it('TOTP: окно ±1 шаг и запрет повтора', () => {
    const step = Math.floor(clock / 30_000)
    assert.equal(verifyTotp(secret, codeAt(clock), clock), step)
    assert.equal(verifyTotp(secret, codeAt(clock, -1), clock), step - 1)
    assert.equal(verifyTotp(secret, codeAt(clock, 2), clock), null)
    assert.equal(verifyTotp(secret, codeAt(clock), clock, step), null)
  })
})

describe('config', () => {
  it('не стартует без секретов и с коротким путём', () => {
    assert.throws(() => loadConfig({}), /ADMIN_PATH не задан/)
    assert.throws(
      () => loadConfig({ ADMIN_PATH: 'admin', ADMIN_PASSWORD_HASH: hash, ADMIN_TOTP_SECRET: secret, ADMIN_ORIGIN: ORIGIN }),
      /ADMIN_PATH: 32–128/,
    )
    assert.throws(
      () => loadConfig({ ADMIN_PATH: PATH, ADMIN_PASSWORD_HASH: hash, ADMIN_TOTP_SECRET: secret, ADMIN_ORIGIN: 'http://evil.example' }),
      /ADMIN_ORIGIN/,
    )
    assert.throws(() => loadConfig({ ADMIN_PATH: PATH, ADMIN_PASSWORD_HASH: hash, ADMIN_TOTP_SECRET: secret, ADMIN_ORIGIN: ORIGIN, HOST: '0.0.0.0' }), /HOST/)
  })
})

describe('admin api', () => {
  it('вход по паролю и TOTP, сессия в __Host-cookie', async () => {
    const app = make()
    const res = await login(app, { login: 'boss', password: 'correct horse battery', code: codeAt(clock) })
    assert.equal(res.statusCode, 200)
    const set = String(res.headers['set-cookie'])
    assert.match(set, /^__Host-ruai_admin=[\w-]{40,};/)
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(set.includes(attr), attr)
    assert.equal(res.headers['cache-control'], 'no-store')

    const s = await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(res) } })
    assert.equal(s.statusCode, 200)
    assert.equal(s.json().login, 'boss')
    assert.ok(events.includes('ADMIN_AUTH_OK 127.0.0.1'))
  })

  it('без кода, с неверным кодом или повтором кода — отказ', async () => {
    const app = make()
    const code = codeAt(clock)
    assert.equal((await login(app, { login: 'boss', password: 'correct horse battery', code: '000000' === code ? '111111' : '000000' })).statusCode, 401)
    assert.equal((await login(app, { login: 'boss', password: 'correct horse battery' })).statusCode, 400)
    assert.equal((await login(app, { login: 'boss', password: 'correct horse battery', code })).statusCode, 200)
    // тот же код второй раз
    assert.equal((await login(app, { login: 'boss', password: 'correct horse battery', code })).statusCode, 401)
  })

  it('пишет строки для fail2ban и блокирует IP после 5 ошибок', async () => {
    const app = make()
    for (let i = 0; i < 5; i++) {
      const r = await login(app, { login: 'boss', password: 'nope', code: '123456' })
      assert.equal(r.statusCode, 401)
    }
    assert.equal(events.filter((e) => e === 'ADMIN_AUTH_FAIL 127.0.0.1').length, 5)
    assert.ok(events.includes('ADMIN_AUTH_LOCK 127.0.0.1'))
    // даже верные данные не принимаются во время блокировки
    const locked = await login(app, { login: 'boss', password: 'correct horse battery', code: codeAt(clock) })
    assert.equal(locked.statusCode, 429)
    assert.ok(Number(locked.headers['retry-after']) > 0)
  })

  it('CSRF: без заголовка или с чужим Origin — 403', async () => {
    const app = make()
    const body = { login: 'boss', password: 'correct horse battery', code: codeAt(clock) }
    assert.equal((await login(app, body, { origin: ORIGIN, 'user-agent': UA })).statusCode, 403)
    assert.equal((await login(app, body, { ...H, origin: 'https://evil.example' })).statusCode, 403)
  })

  it('без сессии — 401; чужой браузер с тем же cookie — 401', async () => {
    const app = make()
    assert.equal((await app.inject({ url: url('reports/overview'), headers: H })).statusCode, 401)
    const res = await login(app, { login: 'boss', password: 'correct horse battery', code: codeAt(clock) })
    const cookie = cookieOf(res)
    assert.equal((await app.inject({ url: url('reports/overview?days=7'), headers: { ...H, cookie } })).statusCode, 200)
    assert.equal((await app.inject({ url: url('reports/overview'), headers: { ...H, cookie, 'user-agent': 'other' } })).statusCode, 401)
  })

  it('сессия истекает после 30 минут простоя', async () => {
    const app = make()
    const cookie = cookieOf(await login(app, { login: 'boss', password: 'correct horse battery', code: codeAt(clock) }))
    clock += 31 * 60_000
    assert.equal((await app.inject({ url: url('session'), headers: { ...H, cookie } })).statusCode, 401)
  })

  it('настройки: валидация и журнал', async () => {
    const app = make()
    const cookie = cookieOf(await login(app, { login: 'boss', password: 'correct horse battery', code: codeAt(clock) }))
    const h = { ...H, cookie, 'content-type': 'application/json' }
    const cur = (await app.inject({ url: url('settings'), headers: h })).json()
    const bad = await app.inject({ method: 'PUT', url: url('settings'), headers: h, payload: { ...cur, usdRub: -1 } })
    assert.equal(bad.statusCode, 400)
    const extra = await app.inject({ method: 'PUT', url: url('settings'), headers: h, payload: { ...cur, admin: true } })
    assert.equal(extra.statusCode, 400)
    const ok = await app.inject({
      method: 'PUT',
      url: url('settings'),
      headers: h,
      payload: { ...cur, generationEnabled: false, generationLimits: { week: 30, month: null, quarter: null } },
    })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.json().generationEnabled, false)
    const log = (await app.inject({ url: url('audit'), headers: h })).json()
    assert.equal(log[0].action, 'settings')
    assert.match(log[0].detail, /генерация выкл/)
  })

  it('без демо и без базы отчёты отвечают 501, неизвестные пути — 404', async () => {
    const app = make({ demo: false })
    const cookie = cookieOf(await login(app, { login: 'boss', password: 'correct horse battery', code: codeAt(clock) }))
    assert.equal((await app.inject({ url: url('reports/finance'), headers: { ...H, cookie } })).statusCode, 501)
    assert.equal((await app.inject({ url: '/admin', headers: H })).statusCode, 404)
    assert.equal((await app.inject({ url: `/${'B'.repeat(43)}/api/session`, headers: H })).statusCode, 404)
  })
})
