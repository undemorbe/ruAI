import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LINK_TTL, RESET_TTL } from './auth.ts'
import { setup } from './testkit.ts'

const tokenOf = (url: string) => new URL(url).searchParams.get('start')!

test('привязка: ссылка на бота, токен одноразовый, /auth/me видит telegram', async () => {
  const t = setup()
  await t.register()
  const r = await t.req('POST', '/api/tg/link')
  assert.equal(r.statusCode, 200)
  assert.match(r.json().url, /^https:\/\/t\.me\/test_auth_bot\?start=/)
  const token = tokenOf(r.json().url)
  assert.match(token, /^[\w-]{43}$/)
  assert.ok(!JSON.stringify(t.db.all('SELECT * FROM tg_links')).includes(token), 'токен в БД только хэшем')
  assert.equal(t.auth.linkByToken(token, 4242, t.clock.t), 'linked')
  const me = (await t.req('GET', '/api/auth/me')).json()
  assert.equal(me.telegram, true)
  assert.equal(JSON.stringify(me).includes('4242'), false, 'tg id наружу не отдаётся')
  assert.equal(t.auth.linkByToken(token, 4242, t.clock.t), 'bad_token')
  assert.equal((await t.req('POST', '/api/tg/link')).statusCode, 409, 'уже привязан')
})

test('привязка: гостю нельзя, Telegram чужого аккаунта не отбирается, истёкший токен не работает', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/tg/link')).statusCode, 401)
  const a = await t.register('alice')
  t.linkTg(a, 777)
  await t.logout()
  await t.register('boris')
  const token = tokenOf((await t.req('POST', '/api/tg/link')).json().url)
  assert.equal(t.auth.linkByToken(token, 777, t.clock.t), 'tg_taken')
  const fresh = tokenOf((await t.req('POST', '/api/tg/link')).json().url)
  t.clock.t += LINK_TTL + 1
  assert.equal(t.auth.linkByToken(fresh, 888, t.clock.t), 'bad_token')
  assert.equal(t.auth.linkByToken('../../x', 888, t.clock.t), 'bad_token')
})

test('новая ссылка заменяет старую', async () => {
  const t = setup()
  await t.register()
  const old = tokenOf((await t.req('POST', '/api/tg/link')).json().url)
  await t.req('POST', '/api/tg/link')
  assert.equal(t.auth.linkByToken(old, 4242, t.clock.t), 'bad_token')
})

test('отвязка: заявка в бот, «Отмена» оставляет, «Отключить» снимает Telegram и закрывает сессии', async () => {
  const t = setup()
  const id = await t.register()
  assert.equal((await t.req('POST', '/api/tg/unlink')).statusCode, 409)
  t.linkTg(id)
  assert.equal((await t.req('POST', '/api/tg/unlink')).statusCode, 200)
  assert.equal(await t.auth.decide(t.tg.sent.at(-1)!.ref!, 4242, 'no', t.clock.t), 'kept')
  assert.equal((await t.req('GET', '/api/auth/me')).json().telegram, true)
  const r = await t.req('POST', '/api/tg/unlink')
  assert.equal(r.json().sent, true)
  assert.equal(t.tg.sent.at(-1)!.kind, 'unlink')
  assert.equal(await t.auth.decide(t.tg.sent.at(-1)!.ref!, 9999, 'ok', t.clock.t), 'not_yours')
  assert.equal(await t.auth.decide(t.tg.sent.at(-1)!.ref!, 4242, 'ok', t.clock.t), 'unlinked')
  assert.equal(t.db.get<{ tg_id: number | null }>('SELECT tg_id FROM users WHERE id = ?', id)!.tg_id, null)
  assert.equal((await t.req('GET', '/api/auth/me')).json().isGuest, true)
})

test('заявку на отвязку нельзя использовать как вход', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  const ch = (await t.req('POST', '/api/tg/unlink')).json().challenge
  await t.logout()
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch, code: '000000' })).statusCode, 410)
})

test('сброс: одинаковый ответ, ссылка только привязанному, одноразовая, все сессии закрываются', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  const before = t.cookie
  // не logout: сессия должна быть живой до сброса, иначе проверка ниже ничего не докажет
  t.cookie = ''
  await t.register('nolink')
  t.cookie = ''
  const a = await t.req('POST', '/api/auth/reset', { login: 'Boris' })
  const b = await t.req('POST', '/api/auth/reset', { login: 'nobody' })
  const c = await t.req('POST', '/api/auth/reset', { login: 'nolink' })
  assert.deepEqual([a.statusCode, b.statusCode, c.statusCode], [204, 204, 204])
  await t.flush()
  const sent = t.tg.sent.filter((s) => s.kind === 'reset')
  assert.equal(sent.length, 1)
  assert.equal(sent[0]!.tgId, 4242)
  const url = new URL(sent[0]!.url!)
  assert.equal(url.origin + url.pathname, 'https://ru-chatgpt.test/reset')
  assert.equal(url.search, '', 'токен только во фрагменте')
  const token = url.hash.slice(1)
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'short' })).json().code, 'weak_password')
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'brand new pass' })).statusCode, 204)
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'brand new pass 2' })).statusCode, 410)
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: before })).json().isGuest, true)
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })).statusCode, 401)
  // после сброса вход снова через 2FA
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'brand new pass' })
  assert.equal(r.statusCode, 200)
  assert.ok(r.json().challenge)
})

test('сброс: ссылка живёт 15 минут, 3 запроса на логин в час, кривой токен 410', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  await t.flush()
  const token = new URL(t.tg.sent.at(-1)!.url!).hash.slice(1)
  t.clock.t += RESET_TTL + 1
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'brand new pass' })).statusCode, 410)
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token: 'nope', password: 'brand new pass' })).statusCode, 410)
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  assert.equal((await t.req('POST', '/api/auth/reset', { login: 'boris' })).statusCode, 429)
})

test('новая ссылка сброса отменяет прежнюю', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  await t.flush()
  const first = new URL(t.tg.sent.at(-1)!.url!).hash.slice(1)
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  await t.flush()
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token: first, password: 'brand new pass' })).statusCode, 410)
})
