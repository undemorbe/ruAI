import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHALLENGE_ATTEMPTS, CHALLENGE_TTL } from './auth.ts'
import { setup } from './testkit.ts'

async function withTg() {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  return { t, id, r }
}

test('с Telegram пароль не даёт сессию, в бот уходит заявка с кодом и ref, но не секретом', async () => {
  const { t, r } = await withTg()
  assert.equal(r.statusCode, 200)
  const b = r.json()
  assert.match(b.challenge, /^[\w-]{22}$/)
  assert.equal(b.sent, true)
  assert.equal(b.user, undefined)
  assert.equal(t.cookie, '')
  assert.equal(t.tg.sent.length, 1)
  assert.equal(t.tg.sent[0]!.kind, 'login')
  assert.match(t.tg.sent[0]!.code!, /^\d{6}$/)
  assert.notEqual(t.tg.sent[0]!.ref, b.challenge)
  assert.ok(!JSON.stringify(t.db.all('SELECT * FROM login_challenges')).includes(b.challenge), 'секрет в БД только хэшем')
  assert.ok(!JSON.stringify(t.db.all('SELECT * FROM login_challenges')).includes(`"${t.tg.sent[0]!.code}"`), 'код в БД только хэшем')
  assert.deepEqual((await t.req('POST', '/api/auth/challenge', { id: b.challenge })).json(), { status: 'pending' })
})

test('«Подтвердить» от владельца: следующий опрос выдаёт сессию, заявка одноразовая', async () => {
  const { t, r } = await withTg()
  const ch = r.json().challenge
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'ok', t.clock.t), 'approved')
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'no', t.clock.t), 'gone', 'решение не меняется')
  const done = await t.req('POST', '/api/auth/challenge', { id: ch })
  assert.equal(done.statusCode, 200)
  assert.equal(done.json().user.login, 'boris')
  assert.notEqual(t.cookie, '')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch })).statusCode, 410)
  assert.equal(t.tg.closed.at(-1)!.text, 'Вход подтверждён')
})

test('кнопка от чужого Telegram и одобрение по ref без секрета ничего не дают', async () => {
  const { t, r } = await withTg()
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 9999, 'ok', t.clock.t), 'not_yours')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })).json().status, 'pending')
  await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'ok', t.clock.t)
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: t.tg.sent[0]!.ref! })).statusCode, 410, 'ref не годится вместо секрета')
})

test('«Это не я»: вход отклонён, браузер получает 410 challenge_denied', async () => {
  const { t, r } = await withTg()
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'no', t.clock.t), 'denied')
  const res = await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })
  assert.equal(res.statusCode, 410)
  assert.equal(res.json().code, 'challenge_denied')
  assert.equal(t.cookie, '')
  assert.equal(t.tg.closed.at(-1)!.text, 'Вход отклонён. Смените пароль на сайте: «Забыли пароль?».')
})

test('ручной код: верный даёт сессию; 5 неверных закрывают заявку', async () => {
  const { t, r } = await withTg()
  const ch = r.json().challenge
  const code = t.tg.sent[0]!.code!
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < CHALLENGE_ATTEMPTS - 1; i++) assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch, code: wrong })).json().code, 'bad_code')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch, code })).statusCode, 200)
  assert.equal(t.tg.closed.at(-1)!.text, 'Вход подтверждён кодом')

  await t.logout()
  const ch2 = (await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })).json().challenge
  for (let i = 0; i < CHALLENGE_ATTEMPTS; i++) await t.req('POST', '/api/auth/challenge', { id: ch2, code: wrong })
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch2, code: t.tg.sent.at(-1)!.code })).statusCode, 410)
  assert.equal(t.cookie, '')
})

test('новый вход заменяет прежнюю открытую заявку', async () => {
  const { t, r } = await withTg()
  await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })).statusCode, 410)
})

test('заявка истекает через 5 минут', async () => {
  const { t, r } = await withTg()
  t.clock.t += CHALLENGE_TTL + 1
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })).statusCode, 410)
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'ok', t.clock.t), 'gone')
})

test('заблокировали между паролем и подтверждением: сессии нет', async () => {
  const { t, id, r } = await withTg()
  await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'ok', t.clock.t)
  t.db.run('UPDATE users SET blocked_at = 1 WHERE id = ?', id)
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })).statusCode, 403)
  assert.equal(t.cookie, '')
})

test('Telegram не принял сообщение: sent=false, сессии нет', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  t.tg.ok = false
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal(r.json().sent, false)
  assert.equal(t.cookie, '')
})

test('без бота (tg=null) 2FA не включается, вход по паролю, tgEnabled=false', async () => {
  const t = setup({ deps: { tg: null } })
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal(r.json().user.login, 'boris')
  assert.equal(r.json().user.tgEnabled, false)
  assert.equal((await t.req('POST', '/api/tg/link')).json().code, 'tg_off')
})

test('схема: секрет заявки только 22 символа base64url', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: '../../etc' })).statusCode, 400)
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: 'x'.repeat(22), extra: 1 })).statusCode, 400)
})
