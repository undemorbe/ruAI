import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUTH_LIMITS } from './auth.ts'
import { setup } from './testkit.ts'

const ip = (n: number) => ({ 'x-forwarded-for': `10.0.0.${n}` })

test('регистрация: сессия сразу, логин в нижнем регистре, пароль только хэшем, согласия записаны', async () => {
  const t = setup()
  const r = await t.req('POST', '/api/auth/register', { login: 'Boris', password: 'correct horse', consent: t.consent })
  assert.equal(r.statusCode, 200)
  const body = r.json()
  assert.equal(body.user.login, 'boris')
  assert.equal(body.user.telegram, false)
  assert.equal(body.user.tgEnabled, true)
  assert.equal(body.token, '')
  assert.match(t.cookie, /^__Host-ruai_s=/)
  const row = t.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE login = ?', 'boris')!
  assert.match(row.password_hash, /^scrypt\$/)
  assert.ok(!JSON.stringify(t.db.all('SELECT * FROM users')).includes('correct horse'))
  assert.equal(t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM consents')!.n, 2)
  const me = (await t.req('GET', '/api/auth/me')).json()
  assert.equal(me.login, 'boris')
  assert.equal(me.isGuest, false)
})

test('регистрация: плохой логин, слабый пароль, занятый логин, без согласий, лишние поля', async () => {
  const t = setup()
  const reg = (b: object) => t.req('POST', '/api/auth/register', { login: 'boris', password: 'correct horse', consent: t.consent, ...b })
  assert.equal((await reg({ login: 'ad' })).json().code, 'bad_login')
  assert.equal((await reg({ login: 'admin' })).json().code, 'bad_login')
  assert.equal((await reg({ password: 'short' })).json().code, 'weak_password')
  assert.equal((await reg({ password: 'Boris' + '' })).json().code, 'weak_password')
  assert.equal((await reg({ consent: { ...t.consent, personalData: false } })).statusCode, 422)
  assert.equal((await reg({ isAdmin: true })).statusCode, 400)
  assert.equal(t.db.get('SELECT * FROM users'), undefined)
  assert.equal((await reg({})).statusCode, 200)
  await t.logout()
  const dup = await reg({ login: 'BORIS' })
  assert.equal(dup.statusCode, 409)
  assert.equal(dup.json().code, 'login_taken')
})

test('вход: неверный пароль и чужой логин дают один и тот же ответ, неудачи в журнале', async () => {
  const t = setup()
  await t.register()
  await t.logout()
  const bad1 = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'wrong pass' })
  const bad2 = await t.req('POST', '/api/auth/login', { login: 'nobody', password: 'wrong pass' })
  assert.equal(bad1.statusCode, 401)
  assert.deepEqual(bad1.json(), bad2.json())
  assert.equal(bad1.json().code, 'bad_credentials')
  assert.equal(t.fails.length, 2)
  assert.equal(t.cookie, '')
  const ok = await t.req('POST', '/api/auth/login', { login: ' Boris ', password: 'correct horse' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().user.login, 'boris')
  assert.notEqual(t.cookie, '')
})

test('вход: 5 неудач на логин с разных IP, дальше 429 даже с верным паролем; через 15 минут снова можно', async () => {
  const t = setup()
  await t.register()
  await t.logout()
  for (let i = 0; i < AUTH_LIMITS.loginFailPerLogin.limit; i++) await t.req('POST', '/api/auth/login', { login: 'boris', password: 'wrong pass' }, ip(i))
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' }, ip(99))
  assert.equal(r.statusCode, 429)
  assert.ok(Number(r.headers['retry-after']) > 0)
  t.clock.t += AUTH_LIMITS.loginFailPerLogin.windowMs
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' }, ip(99))).statusCode, 200)
})

test('вход: 10 неудач с одного IP по разным логинам, дальше 429 для любого логина с этого IP', async () => {
  const t = setup()
  for (let i = 0; i < AUTH_LIMITS.loginFailPerIp.limit; i++) await t.req('POST', '/api/auth/login', { login: `user${i}`, password: 'wrong pass' }, ip(1))
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'other', password: 'wrong pass' }, ip(1))).statusCode, 429)
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'other', password: 'wrong pass' }, ip(2))).statusCode, 401)
})

test('регистрация: 5 на IP в час', async () => {
  const t = setup()
  for (let i = 0; i < AUTH_LIMITS.registerPerIp.limit; i++) {
    assert.equal((await t.req('POST', '/api/auth/register', { login: `user${i}`, password: 'correct horse', consent: t.consent })).statusCode, 200)
    await t.logout()
  }
  assert.equal((await t.req('POST', '/api/auth/register', { login: 'user9', password: 'correct horse', consent: t.consent })).statusCode, 429)
})

test('заблокированный не входит, его сессия не работает', async () => {
  const t = setup()
  const id = await t.register()
  t.db.run('UPDATE users SET blocked_at = 1 WHERE id = ?', id)
  assert.equal((await t.req('GET', '/api/auth/me')).json().isGuest, true)
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal(r.statusCode, 403)
  assert.equal(r.json().code, 'blocked')
})

test('старый аккаунт с паролем «!» по паролю не входит', async () => {
  const t = setup()
  t.db.run("INSERT INTO users (id, login, password_hash, created_at) VALUES ('u_old', 'legacy', '!', 1)")
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'legacy', password: '!' })).statusCode, 401)
})

test('вход закрывает прежнюю сессию этого браузера (фиксация сессии)', async () => {
  const t = setup()
  await t.register()
  const before = t.cookie
  await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.notEqual(t.cookie, before)
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: before })).json().isGuest, true)
})

test('смена пароля: нужен текущий, остальные сессии закрываются', async () => {
  const t = setup()
  await t.register()
  const first = t.cookie
  // вторая сессия из «другого браузера»: без cookie, иначе вход закроет первую сам
  t.cookie = ''
  await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: first })).json().isGuest, false, 'первая сессия жива до смены')
  assert.equal((await t.req('POST', '/api/auth/password', { current: 'nope nope', password: 'new password 1' })).statusCode, 401)
  assert.equal((await t.req('POST', '/api/auth/password', { current: 'correct horse', password: 'short' })).json().code, 'weak_password')
  assert.equal((await t.req('POST', '/api/auth/password', { current: 'correct horse', password: 'new password 1' })).statusCode, 204)
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: first })).json().isGuest, true, 'другая сессия закрыта')
  assert.equal((await t.req('GET', '/api/auth/me')).json().isGuest, false, 'текущая осталась')
  await t.logout()
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'new password 1' })).statusCode, 200)
})

test('гость не меняет пароль; CSRF: без заголовка и с чужим Origin вход запрещён', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/auth/password', { current: 'a', password: 'new password 1' })).statusCode, 401)
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'x' }, { 'x-requested-with': '' })).statusCode, 403)
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'x' }, { origin: 'https://evil.test' })).statusCode, 403)
})

test('старых адресов входа по почте нет', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/auth/code', { email: 'a@b.ru', intent: 'login' })).statusCode, 404)
  assert.equal((await t.req('POST', '/api/auth/verify', { email: 'a@b.ru', code: '000000' })).statusCode, 404)
})
