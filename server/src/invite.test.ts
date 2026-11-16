import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { AdminAccounts, INVITE_TTL, MAX_ADMINS, checkLogin, inviteLink, parseEnvFile } from './accounts.ts'
import { buildApp } from './app.ts'
import type { Config } from './config.ts'
import { base32Decode, hashPassword, newTotpSecret, totpAt } from './crypto.ts'
import { FileStore } from './store.ts'

const PATH = 'B'.repeat(43)
const ORIGIN = 'https://admin.test'
const H = { 'x-requested-with': 'ruai-admin', origin: ORIGIN, 'user-agent': 'ua' }
const url = (p: string) => `/${PATH}/api/${p}`
const T0 = Date.UTC(2026, 10, 17, 10, 0, 0)
const code = (secret: string, t: number) => totpAt(base32Decode(secret), Math.floor(t / 30_000))
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0]!
const NEW_PASS = 'длинный пароль нового админа'

const ownerSecret = newTotpSecret()
const ownerHash = await hashPassword('owner password 123')

function make() {
  let clock = T0
  const dir = mkdtempSync(join(tmpdir(), 'ruai-invite-'))
  const events: string[] = []
  const cfg: Config = {
    host: '127.0.0.1',
    port: 0,
    adminPath: PATH,
    login: 'boss',
    passwordHash: ownerHash,
    totpSecret: ownerSecret,
    origin: ORIGIN,
    dataDir: dir,
    authLog: '/dev/null',
    demo: true,
    insecureCookie: false,
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 3_600_000,
    dbFile: null,
    imagesDir: '',
  }
  const accounts = new AdminAccounts(dir, cfg.login)
  const store = new FileStore(dir)
  const app = buildApp(cfg, { store, accounts, now: () => clock, log: (e, ip) => events.push(`${e} ${ip}`) })
  return { app, accounts, store, dir, events, tick: (ms: number) => (clock += ms), now: () => clock }
}

describe('аккаунты и приглашения (хранилище)', () => {
  it('приглашение одноразовое, токен хранится только хешем, файлы chmod 600', () => {
    const { accounts, dir } = make()
    const { token, invite } = accounts.createInvite('QpQpQip', T0)
    assert.equal(invite.login, 'qpqpqip', 'логин в нижнем регистре')
    const raw = readFileSync(join(dir, 'invites.json'), 'utf8')
    assert.ok(!raw.includes(token), 'сам токен на диск не пишется')
    assert.equal(statSync(join(dir, 'invites.json')).mode & 0o777, 0o600)
    assert.ok(accounts.invite(token, T0))
    assert.equal(accounts.invite(token, T0 + INVITE_TTL), null, 'истекает через 48 часов')
    assert.equal(accounts.invite('x'.repeat(43), T0), null)
    assert.ok(accounts.accept(token, 'scrypt$h', 1, T0))
    assert.equal(accounts.invite(token, T0), null, 'после подключения ссылка не работает')
    assert.equal(accounts.accept(token, 'scrypt$h', 1, T0), null)
    assert.equal(statSync(join(dir, 'admins.json')).mode & 0o777, 0o600)
    assert.deepEqual(accounts.pending(T0), [])
  })

  it('занятые и неверные логины, повторное приглашение, удаление, лимит', () => {
    const { accounts } = make()
    assert.throws(() => accounts.createInvite('boss', T0), /занят/, 'основной логин')
    assert.throws(() => accounts.createInvite('a b', T0), /Логин/)
    assert.equal(checkLogin('qpqpqip'), null)
    assert.ok(checkLogin('ab'))
    const first = accounts.createInvite('qpqpqip', T0)
    const second = accounts.createInvite('qpqpqip', T0 + 1000)
    assert.equal(accounts.invite(first.token, T0 + 2000), null, 'новое приглашение отменяет прежнее')
    assert.ok(accounts.invite(second.token, T0 + 2000))
    assert.ok(accounts.remove('qpqpqip'), 'удаляет и приглашение')
    assert.equal(accounts.invite(second.token, T0 + 2000), null)
    assert.equal(accounts.remove('nobody'), false)
    for (let i = 0; i < MAX_ADMINS; i++) accounts.accept(accounts.createInvite(`admin${i}`, T0).token, 'h', 1, T0)
    assert.throws(() => accounts.createInvite('one-more', T0), /Не больше/)
  })

  it('ссылка и разбор env-файла', () => {
    assert.equal(inviteLink('https://ru-chatgpt.com/', 'P'.repeat(43), 'tok'), `https://ru-chatgpt.com/${'P'.repeat(43)}/#/invite/tok`)
    const env = parseEnvFile("# c\nADMIN_PATH=abc\nADMIN_PASSWORD_HASH='scrypt$1$2'\nADMIN_ORIGIN=\"https://x.ru\"\n")
    assert.deepEqual(env, { ADMIN_PATH: 'abc', ADMIN_PASSWORD_HASH: 'scrypt$1$2', ADMIN_ORIGIN: 'https://x.ru' })
  })
})

describe('приглашение через API', () => {
  it('новый администратор: ссылка → пароль и код → вход; обе сессии живут; удаление закрывает доступ', async () => {
    const { app, accounts, store, events, tick, now } = make()
    const { token } = accounts.createInvite('qpqpqip', now())

    // без сессии видно только своё приглашение
    const info = await app.inject({ method: 'POST', url: url('invite'), headers: H, payload: { token } })
    assert.equal(info.statusCode, 200)
    const { login, secret, uri } = info.json()
    assert.equal(login, 'qpqpqip')
    assert.match(uri, /^otpauth:\/\/totp\/ruAI%20admin%3Aqpqpqip\?secret=/)

    // короткий пароль и неверный код - отказ, аккаунт не создан
    const short = await app.inject({ method: 'POST', url: url('invite/accept'), headers: H, payload: { token, password: 'short', code: code(secret, now()) } })
    assert.equal(short.statusCode, 400)
    const wrong = code(secret, now()) === '000000' ? '111111' : '000000'
    const bad = await app.inject({ method: 'POST', url: url('invite/accept'), headers: H, payload: { token, password: NEW_PASS, code: wrong } })
    assert.equal(bad.statusCode, 400)
    assert.equal(accounts.find('qpqpqip'), null)
    assert.ok(!events.some((e) => e.startsWith('ADMIN_AUTH_FAIL')), 'опечатки владельца ссылки не идут в fail2ban')

    const ok = await app.inject({ method: 'POST', url: url('invite/accept'), headers: H, payload: { token, password: NEW_PASS, code: code(secret, now()) } })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.json().login, 'qpqpqip')
    assert.equal(ok.headers['set-cookie'], undefined, 'сессию выдаёт только обычный вход')
    // повтор ссылки
    assert.equal((await app.inject({ method: 'POST', url: url('invite'), headers: H, payload: { token } })).statusCode, 404)

    // вход: тот же код, что при подключении, второй раз не принимается
    const reuse = await app.inject({ method: 'POST', url: url('login'), headers: H, payload: { login: 'qpqpqip', password: NEW_PASS, code: code(secret, now()) } })
    assert.equal(reuse.statusCode, 401)
    tick(60_000)
    const owner = await app.inject({ method: 'POST', url: url('login'), headers: H, payload: { login: 'boss', password: 'owner password 123', code: code(ownerSecret, now()) } })
    assert.equal(owner.statusCode, 200)
    const newbie = await app.inject({ method: 'POST', url: url('login'), headers: H, payload: { login: 'QPQPQIP', password: NEW_PASS, code: code(secret, now()) } })
    assert.equal(newbie.statusCode, 200)
    assert.equal(newbie.json().login, 'qpqpqip')

    // обе сессии работают одновременно
    const sOwner = await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(owner) } })
    const sNew = await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(newbie) } })
    assert.equal(sOwner.json().login, 'boss')
    assert.equal(sNew.json().login, 'qpqpqip')

    // журнал: кто добавлен и кто что делал
    const settings = await app.inject({ url: url('settings'), headers: { ...H, cookie: cookieOf(newbie) } })
    await app.inject({ method: 'PUT', url: url('settings'), headers: { ...H, cookie: cookieOf(newbie) }, payload: settings.json() })
    const log = store.recentAudit()
    assert.ok(log.some((e) => e.action === 'admin_added' && e.detail === 'qpqpqip'))
    assert.ok(log.some((e) => e.action === 'settings' && e.by === 'qpqpqip'))

    // удаление аккаунта сразу закрывает его сессию, основной остаётся
    accounts.remove('qpqpqip')
    assert.equal((await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(newbie) } })).statusCode, 401)
    assert.equal((await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(owner) } })).statusCode, 200)
  })

  it('чужой токен: 404, строка для fail2ban и блокировка после 5 попыток', async () => {
    const { app, events } = make()
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: 'POST', url: url('invite'), headers: H, payload: { token: `guess${'x'.repeat(30)}${i}` } })
      assert.equal(r.statusCode, 404)
    }
    assert.equal(events.filter((e) => e.startsWith('ADMIN_AUTH_FAIL')).length, 5)
    assert.ok(events.some((e) => e.startsWith('ADMIN_AUTH_LOCK')))
    const locked = await app.inject({ method: 'POST', url: url('invite'), headers: H, payload: { token: 'y'.repeat(43) } })
    assert.equal(locked.statusCode, 429)
  })

  it('CSRF: без заголовка и с чужим Origin приглашение не принимается; лишние поля - 400', async () => {
    const { app, accounts, now } = make()
    const { token } = accounts.createInvite('qpqpqip', now())
    assert.equal((await app.inject({ method: 'POST', url: url('invite'), headers: { origin: ORIGIN }, payload: { token } })).statusCode, 403)
    assert.equal((await app.inject({ method: 'POST', url: url('invite'), headers: { ...H, origin: 'https://evil.test' }, payload: { token } })).statusCode, 403)
    assert.equal((await app.inject({ method: 'POST', url: url('invite'), headers: H, payload: { token, admin: true } })).statusCode, 400)
  })

  it('повторный вход того же аккаунта закрывает его прежнюю сессию, но не чужую', async () => {
    const { app, now, tick } = make()
    const a = await app.inject({ method: 'POST', url: url('login'), headers: H, payload: { login: 'boss', password: 'owner password 123', code: code(ownerSecret, now()) } })
    tick(60_000)
    const b = await app.inject({ method: 'POST', url: url('login'), headers: H, payload: { login: 'boss', password: 'owner password 123', code: code(ownerSecret, now()) } })
    assert.equal((await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(a) } })).statusCode, 401)
    assert.equal((await app.inject({ url: url('session'), headers: { ...H, cookie: cookieOf(b) } })).statusCode, 200)
  })
})
