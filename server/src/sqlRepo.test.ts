import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PRICES } from '@/content/plans'
import { Db } from './api/db.ts'
import { ImageFiles } from './api/images.ts'
import { readSettings, reserve, settle, writeSettings } from './api/ledger.ts'
import { buildApp } from './app.ts'
import type { Config } from './config.ts'
import { base32Decode, hashPassword, newTotpSecret, totpAt } from './crypto.ts'
import { loadDataset, sqlRepo } from './sqlRepo.ts'
import { lastDays } from '../../src/admin/range.ts'
import { FileStore } from './store.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-16T09:00:00Z')
const R30 = lastDays(30, NOW)

function seed() {
  const db = new Db(':memory:')
  const files = new ImageFiles(mkdtempSync(join(tmpdir(), 'ruai-repo-')))
  const add = (id: string, login: string, email: string | null, tgId: number | null, at: number) =>
    db.run("INSERT INTO users (id, login, password_hash, email, tg_id, created_at) VALUES (?, ?, 'scrypt$x', ?, ?, ?)", id, login, email, tgId, at)
  // A платил и подключил Telegram; B без email и без Telegram
  add('u_aaaaaaaaaaaaaaaaaaaa', 'alice', 'a@example.ru', 777001, NOW - 10 * DAY)
  add('u_bbbbbbbbbbbbbbbbbbbb', 'bob', null, null, NOW - 2 * DAY)
  // оплаченный платёж + подписка
  db.run(
    "INSERT INTO payments (id, user_id, provider, provider_id, tier, plan_id, amount, status, created_at, paid_at) VALUES ('pay_1', 'u_aaaaaaaaaaaaaaaaaaaa', 'fake', 'p1', 'media', 'month', ?, 'succeeded', ?, ?)",
    PRICES.media.month,
    NOW - 5 * DAY,
    NOW - 5 * DAY,
  )
  db.run(
    "INSERT INTO subscriptions (id, user_id, payment_id, source, tier, plan_id, started_at, expires_at, total_limit, daily_limit, budget_rub) VALUES ('sub_1', 'u_aaaaaaaaaaaaaaaaaaaa', 'pay_1', 'payment', 'media', 'month', ?, ?, 1500, 200, 795)",
    NOW - 5 * DAY,
    NOW + 25 * DAY,
  )
  db.run("INSERT INTO payments (id, user_id, provider, provider_id, tier, plan_id, amount, status, created_at) VALUES ('pay_2', 'u_bbbbbbbbbbbbbbbbbbbb', 'fake', 'p2', 'text', 'week', 388, 'canceled', ?)", NOW - DAY)
  db.run("INSERT INTO payments (id, user_id, provider, provider_id, tier, plan_id, amount, status, created_at) VALUES ('pay_3', 'u_bbbbbbbbbbbbbbbbbbbb', 'fake', 'p3', 'text', 'week', 388, 'pending', ?)", NOW - DAY)
  // два удачных запроса, одна генерация и одна ошибка
  for (const [kind, cost, ok] of [
    ['text', 0.01, true],
    ['vision', 0.02, true],
    ['image', 0.04, true],
    ['text', 0, false],
  ] as const) {
    const r = reserve(db, { userId: 'u_aaaaaaaaaaaaaaaaaaaa', kind, model: 'm', now: NOW - DAY + Math.random() * 1000, dailyUsdCap: 100 })
    settle(db, r.eventId, { produced: ok, tokensIn: 100, tokensOut: 50, costUsd: cost, ...(ok ? {} : { errorCode: 'upstream' }) })
  }
  return { db, files }
}

test('отчёты из БД: выручка, расходы, ошибки, активные подписки', async () => {
  const { db, files } = seed()
  const repo = sqlRepo(db, files, () => NOW)
  const s = readSettings(db)
  const o = await repo.overview(R30, s)
  assert.equal(o.revenueRub, PRICES.media.month)
  assert.equal(o.registrations, 2)
  assert.equal(o.activeSubscriptions, 1)
  assert.equal(o.openrouterUsd, 0.07)

  const p = await repo.payments(R30)
  assert.equal(p.succeeded.count, 1)
  assert.equal(p.failed.count, 1, 'отменённый - неуспешный, ожидающий - не учитывается')

  const a = await repo.api(R30, s)
  assert.equal(a.requests, 3)
  assert.equal(a.errors.count, 1)
  assert.deepEqual(a.errors.byCode, [{ code: 'upstream', count: 1 }])
  assert.equal(a.byModel.find((m) => m.key === 'image')!.requests, 1)

  const u = await repo.users({ sort: 'spend' }, s)
  assert.equal(u.items[0]!.login, 'alice')
  assert.equal(u.items[0]!.email, 'a@example.ru')
  assert.equal(u.items[0]!.telegram, true)
  assert.equal(u.items[0]!.tier, 'media')
  assert.deepEqual((await repo.users({ filter: 'no_tg' }, s)).items.map((x) => x.login), ['bob'])
  assert.deepEqual((await repo.users({ q: 'ali' }, s)).items.map((x) => x.login), ['alice'], 'поиск по логину')
  assert.equal(u.items[0]!.expiresAt, new Date(NOW + 25 * DAY).toISOString(), 'срок - из подписки в БД, не от даты платежа')

  const f = await repo.finance(R30, s)
  assert.equal(f.payingUsers, 1)
})

test('удалённый пользователь: платежи и расходы остаются обезличенными', async () => {
  const { db, files } = seed()
  const repo = sqlRepo(db, files, () => NOW)
  assert.equal(await repo.removeUser('u_aaaaaaaaaaaaaaaaaaaa'), true)
  const ds = loadDataset(db, NOW)
  assert.ok(ds.payments.some((p) => p.userId === 'deleted'))
  assert.ok(!ds.users.some((x) => x.login === 'alice'))
  assert.equal(db.get('SELECT * FROM subscriptions'), undefined)
})

// ---------- действия через API админки ----------

const PATH = 'B'.repeat(43)
const ORIGIN = 'https://admin.test'
const H = { 'x-requested-with': 'ruai-admin', origin: ORIGIN, 'user-agent': 'ua' }

async function admin() {
  const { db, files } = seed()
  const secret = newTotpSecret()
  const cfg: Config = {
    host: '127.0.0.1',
    port: 0,
    adminPath: PATH,
    login: 'boss',
    passwordHash: await hashPassword('pw-pw-pw-pw'),
    totpSecret: secret,
    origin: ORIGIN,
    dataDir: mkdtempSync(join(tmpdir(), 'ruai-admin-')),
    authLog: '/dev/null',
    demo: false,
    insecureCookie: false,
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 3_600_000,
    dbFile: ':memory:',
    imagesDir: '',
  }
  const store = new FileStore(cfg.dataDir)
  const app = buildApp(cfg, {
    store,
    repo: sqlRepo(db, files, () => NOW),
    settings: { settings: () => readSettings(db), saveSettings: (s) => writeSettings(db, s) },
    now: () => NOW,
    log: () => {},
  })
  const r = await app.inject({ method: 'POST', url: `/${PATH}/api/login`, headers: H, payload: { login: 'boss', password: 'pw-pw-pw-pw', code: totpAt(base32Decode(secret), Math.floor(NOW / 30_000)) } })
  assert.equal(r.statusCode, 200)
  const cookie = String(r.headers['set-cookie']).split(';')[0]!
  const call = (method: 'GET' | 'POST' | 'PUT', p: string, payload?: object) =>
    app.inject({ method, url: `/${PATH}/api/${p}`, headers: { ...H, cookie, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { payload } : {}) })
  return { db, app, call, store }
}

test('админка: выдача подписки, блокировка, удаление с подтверждением; всё в журнале', async () => {
  const { db, call } = await admin()
  const B = 'u_bbbbbbbbbbbbbbbbbbbb'
  assert.equal((await call('POST', `users/${B}/grant`, { tier: 'text', planId: 'week' })).statusCode, 200)
  assert.equal(db.get<{ source: string }>('SELECT source FROM subscriptions WHERE user_id = ?', B)!.source, 'admin')
  assert.equal((await call('POST', `users/u_cccccccccccccccccccc/grant`, { tier: 'text', planId: 'week' })).statusCode, 404)
  assert.equal((await call('POST', `users/${B}/grant`, { tier: 'gold', planId: 'week' })).statusCode, 400)
  assert.equal((await call('POST', `users/../../etc/grant`, { tier: 'text', planId: 'week' })).statusCode, 404)

  db.run("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES ('s1', ?, 0, 0, ?, '1.1.1.1')", B, NOW + DAY)
  assert.equal((await call('POST', `users/${B}/block`, { blocked: true })).statusCode, 200)
  assert.ok(db.get<{ blocked_at: number }>('SELECT blocked_at FROM users WHERE id = ?', B)!.blocked_at)
  assert.equal(db.get('SELECT * FROM sessions WHERE user_id = ?', B), undefined, 'сессии закрыты')
  const list = (await call('GET', 'users?q=bob')).json() as { items: { blocked?: boolean }[] }
  assert.equal(list.items[0]!.blocked, true)
  assert.equal((await call('POST', `users/${B}/block`, { blocked: false })).statusCode, 200)

  assert.equal((await call('POST', `users/${B}/delete`, { login: 'alice' })).statusCode, 400, 'логин не совпал - не удаляем')
  assert.equal((await call('POST', `users/${B}/delete`, { email: 'b@example.ru' })).statusCode, 400, 'старое поле email не принимается')
  assert.equal((await call('POST', `users/${B}/delete`, { login: 'Bob ' })).statusCode, 200)
  assert.equal(db.get('SELECT * FROM users WHERE id = ?', B), undefined)

  const audit = (await call('GET', 'audit')).json() as { action: string }[]
  assert.deepEqual(
    audit.map((a) => a.action).filter((a) => a !== 'login'),
    ['delete_user', 'unblock', 'block', 'grant'],
  )
})

test('настройки админки пишутся в общую БД - их сразу видит API сайта', async () => {
  const { db, call } = await admin()
  const s = (await call('GET', 'settings')).json()
  const r = await call('PUT', 'settings', { ...s, generationEnabled: false, usdRub: 101 })
  assert.equal(r.statusCode, 200)
  assert.equal(readSettings(db).generationEnabled, false)
  assert.equal(readSettings(db).usdRub, 101)
})

test('действия с пользователями - только после входа', async () => {
  const cfgDir = mkdtempSync(join(tmpdir(), 'ruai-admin-'))
  const app = buildApp(
    {
      host: '127.0.0.1',
      port: 0,
      adminPath: PATH,
      login: 'boss',
      passwordHash: await hashPassword('x'),
      totpSecret: newTotpSecret(),
      origin: ORIGIN,
      dataDir: cfgDir,
      authLog: '/dev/null',
      demo: true,
      insecureCookie: false,
      idleMs: 1,
      absoluteMs: 1,
      dbFile: null,
      imagesDir: '',
    },
    { log: () => {} },
  )
  // без сессии - 401 раньше всего
  const r = await app.inject({ method: 'POST', url: `/${PATH}/api/users/u_bbbbbbbbbbbbbbbbbbbb/block`, headers: { ...H, 'content-type': 'application/json' }, payload: { blocked: true } })
  assert.equal(r.statusCode, 401)
})

test('сравнение с прошлым периодом и аналитика из БД', async () => {
  const { db, files } = seed()
  const repo = sqlRepo(db, files, () => NOW)
  const s = readSettings(db)
  const o = await repo.overview(lastDays(7, NOW), s)
  assert.equal(o.revenueRub, PRICES.media.month)
  assert.equal(o.compare.revenueRub, 0, 'платёж 5 дней назад не попадает в предыдущую неделю')
  assert.equal(o.compare.registrations, 1, 'a@ зарегистрирован 10 дней назад')
  const an = await repo.analytics(R30, s)
  assert.deepEqual(an.funnel, { registered: 2, active: 1, paid: 1, repeat: 0 })
  assert.equal(an.days.length, 30)
  assert.equal(an.days.reduce((n, d) => n + d.revenueRub, 0), o.revenueRub)
  assert.equal(an.activity.activeUsers, 1)
})

test('карточка пользователя: живые счётчики подписки, сессии, заметка', async () => {
  const { db, files } = seed()
  const repo = sqlRepo(db, files, () => NOW)
  const A = 'u_aaaaaaaaaaaaaaaaaaaa'
  db.run("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES ('s1', ?, 0, 0, ?, '1.1.1.1')", A, NOW + DAY)
  db.run("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES ('s2', ?, 0, 0, ?, '1.1.1.1')", A, NOW - DAY)
  db.run('UPDATE users SET admin_note = ? WHERE id = ?', 'VIP', A)
  const d = (await repo.user(A, readSettings(db)))!
  assert.equal(d.sessions, 1, 'истёкшие сессии не считаются')
  assert.equal(d.note, 'VIP')
  assert.equal(d.sub!.totalLimit, 1500)
  assert.equal(d.sub!.totalUsed, 3, 'три удачных запроса, ошибка возвращена')
  assert.equal(d.payments.length, 1)
  assert.equal(await repo.user('u_zzzzzzzzzzzzzzzzzzzz', readSettings(db)), null)
})

test('база открывается двумя процессами: миграции не повторяются', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ruai-mig-')), 'x.db')
  const a = new Db(file)
  const b = new Db(file)
  assert.ok(b.get('SELECT admin_note FROM users LIMIT 1') === undefined)
  a.close()
  b.close()
})

test('админка: правка подписки - срок, лимит, бюджет, автопродление, завершение', async () => {
  const { db, call, store } = await admin()
  const A = 'u_aaaaaaaaaaaaaaaaaaaa'
  const sub = () => db.get<{ expires_at: number; total_limit: number; budget_rub: number; auto_renew: number; daily_used: number }>('SELECT * FROM subscriptions WHERE id = ?', 'sub_1')!
  assert.equal((await call('POST', `users/${A}/subscription`, { expiresOn: '2027-01-31' })).statusCode, 200)
  assert.equal(sub().expires_at, Date.parse('2027-01-31T20:59:59.999Z'), 'конец дня по Москве')
  assert.equal((await call('POST', `users/${A}/subscription`, { totalLimitDelta: 250, budgetDeltaRub: 100, autoRenew: true, resetDaily: true })).statusCode, 200)
  assert.equal(sub().total_limit, 1750)
  assert.equal(sub().budget_rub, 895)
  assert.equal(sub().auto_renew, 1)
  assert.equal(sub().daily_used, 0)
  // лимит не опускается ниже потраченного, бюджет - ниже нуля
  assert.equal((await call('POST', `users/${A}/subscription`, { totalLimitDelta: -100_000, budgetDeltaRub: -100_000 })).statusCode, 200)
  assert.equal(sub().total_limit, 3)
  assert.equal(sub().budget_rub, 0)

  for (const bad of [{}, { expiresOn: '2026-11-01' }, { expiresOn: '2026-02-30' }, { expiresOn: '2030-01-01' }, { totalLimitDelta: 1.5 }, { end: false }, { end: true, autoRenew: true }, { hack: 1 }]) {
    assert.equal((await call('POST', `users/${A}/subscription`, bad)).statusCode, 400, JSON.stringify(bad))
  }
  assert.equal((await call('POST', `users/u_bbbbbbbbbbbbbbbbbbbb/subscription`, { autoRenew: true })).statusCode, 409, 'нет подписки')
  assert.equal((await call('POST', `users/${A}/subscription`, { end: true })).statusCode, 200)
  assert.equal(sub().expires_at, NOW)
  assert.equal((await call('POST', `users/${A}/subscription`, { autoRenew: true })).statusCode, 409)
  const log = store.recentAudit().filter((e) => e.action === 'edit_sub')
  assert.equal(log.length, 4)
  assert.match(log[0]!.detail!, /завершена/)
})

test('админка: email для чеков без уникальности и без закрытия сессий, заметка, выход со всех устройств', async () => {
  const { db, call, store } = await admin()
  const A = 'u_aaaaaaaaaaaaaaaaaaaa'
  const sessions = () => (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', A)!.n)
  db.run("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES ('s1', ?, 0, 0, ?, '1.1.1.1')", A, NOW + DAY)
  assert.equal((await call('POST', `users/${A}/profile`, { note: '  звонил\r\nв поддержку\u0007 ' })).statusCode, 200)
  assert.equal(db.get<{ admin_note: string }>('SELECT admin_note FROM users WHERE id = ?', A)!.admin_note, 'звонил\nв поддержку')
  assert.equal(sessions(), 1, 'заметка не трогает сессии')

  db.run("UPDATE users SET email = 'same@example.ru' WHERE id = 'u_bbbbbbbbbbbbbbbbbbbb'")
  assert.equal((await call('POST', `users/${A}/profile`, { email: 'same@example.ru' })).statusCode, 200, 'один email для чеков у двух аккаунтов допустим')
  assert.equal((await call('POST', `users/${A}/profile`, { email: 'not-an-email' })).statusCode, 400)
  assert.equal((await call('POST', `users/${A}/profile`, { email: ' New@Example.ru ' })).statusCode, 200)
  assert.equal(db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', A)!.email, 'new@example.ru')
  assert.equal(sessions(), 1, 'email во входе не участвует: сессии остаются')
  db.run('DELETE FROM sessions WHERE user_id = ?', A)

  db.run("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES ('s2', ?, 0, 0, ?, '1.1.1.1')", A, NOW + DAY)
  assert.equal((await call('POST', `users/${A}/logout`)).statusCode, 200)
  assert.equal(sessions(), 0)
  assert.equal((await call('POST', `users/u_cccccccccccccccccccc/logout`)).statusCode, 404)

  const details = store.recentAudit().map((e) => e.detail ?? '').join(' ')
  assert.ok(!details.includes('new@example.ru') && !details.includes('звонил'), 'в журнале нет адреса и текста заметки')
})

test('админка: диапазон отчётов проверяется', async () => {
  const { call } = await admin()
  assert.equal((await call('GET', 'reports/analytics?from=2026-10-18&to=2026-11-16')).statusCode, 200)
  assert.equal((await call('GET', 'reports/overview')).statusCode, 200, 'без дат - 30 дней')
  for (const q of ['from=2026-11-10&to=2026-11-01', 'from=2026-11-01&to=2026-12-31', 'from=2025-01-01&to=2026-11-16', 'from=2026-13-01&to=2026-11-16', 'from=x&to=y', 'from=2026-11-01']) {
    assert.equal((await call('GET', `reports/overview?${q}`)).statusCode, 400, q)
  }
  const u = await call('GET', 'users/u_aaaaaaaaaaaaaaaaaaaa')
  assert.equal(u.statusCode, 200)
  assert.equal(u.json().user.login, 'alice')
  assert.equal(u.json().user.email, 'a@example.ru')
  assert.equal(u.json().user.telegram, true)
  assert.doesNotMatch(u.body, /tg_id|777001|password_hash|scrypt/, 'id Telegram и хэш пароля не уходят в панель')
  assert.equal((await call('GET', 'users?filter=no_tg')).json().total, 1)
  assert.equal((await call('GET', 'users/u_zzzzzzzzzzzzzzzzzzzz')).statusCode, 404)
  assert.equal((await call('GET', 'users?filter=active')).json().total, 1)
  assert.equal((await call('GET', 'users?filter=none')).json().total, 1)
})
