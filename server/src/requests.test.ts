import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { RequestsPage } from '../../src/admin/api/types.ts'
import { grantSubscription } from './api/billing.ts'
import { Db, MIGRATIONS } from './api/db.ts'
import { readSettings, writeSettings } from './api/ledger.ts'
import { ORIGIN, setup } from './api/testkit.ts'
import { buildApp } from './app.ts'
import type { Config } from './config.ts'
import { base32Decode, hashPassword, newTotpSecret, totpAt } from './crypto.ts'
import { CLIP, REQUESTS_PAGE, requestsPage } from './requests.ts'
import { sqlRepo } from './sqlRepo.ts'
import { FileStore } from './store.ts'

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
}
function png(w: number, h: number) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))])
}
async function upload(t: ReturnType<typeof setup>, file: Buffer) {
  const b = '----ruaitest'
  const payload = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${b}--\r\n`),
  ])
  const r = await t.app.inject({ method: 'POST', url: '/api/uploads', payload, headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'x-requested-with': 'ruai', origin: ORIGIN, cookie: t.cookie } })
  return (r.json() as { id: string }).id
}

/** Сайт с подпиской «с фото»: текстовый запрос, фото, генерация и ошибка (модель - подделка из testkit). */
async function site() {
  const t = setup()
  const userId = await t.register()
  grantSubscription(t.db, { userId, tier: 'media', planId: 'month', now: t.clock.t })
  const send = async (body: object) => {
    t.clock.t += 120_000 // частота запросов
    return t.events((await t.req('POST', '/api/chats/messages', { chatId: null, content: 'Привет', ...body })).body)
  }
  t.llm.agent = [{ type: 'text', text: 'Ответ на текст' }, { type: 'end', finish: 'stop', usage: { tokensIn: 100, tokensOut: 20, costUsd: 0.001 } }]
  await send({ content: 'Что такое инфляция?' })
  const photo = await upload(t, png(300, 200))
  t.llm.agent = [{ type: 'text', text: 'На фото кот' }, { type: 'end', finish: 'stop', usage: { tokensIn: 900, tokensOut: 10, costUsd: 0.003 } }]
  await send({ content: '', images: [photo] })
  t.llm.agent = [{ type: 'image', data: png(512, 512) }, { type: 'text', text: 'Готово' }, { type: 'end', finish: 'stop', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0.004 } }]
  await send({ content: 'Нарисуй кота', mode: 'image' })
  t.llm.agent = new Error('upstream down')
  await send({ content: 'Упадёт' })
  return { t, userId, photo }
}

test('событие расхода связано с вопросом и ответом; лента: тексты, фото, генерации, цена', async () => {
  const { t, userId, photo } = await site()
  const ev = t.db.all<{ message_id: string | null; reply_id: string | null; chat_id: string | null; status: string }>('SELECT message_id, reply_id, chat_id, status FROM usage_events ORDER BY id')
  assert.equal(ev.length, 4)
  assert.ok(ev.every((e) => e.message_id && e.chat_id), 'вопрос записан у каждого запроса')
  assert.deepEqual(
    ev.map((e) => !!e.reply_id),
    [true, true, true, false],
    'у ошибки ответа нет',
  )

  const s = { ...readSettings(t.db), usdRub: 100 }
  const page = requestsPage(t.db, { userId }, s)
  assert.equal(page.next, null)
  const [err, gen, vision, text] = page.items
  assert.equal(text!.prompt, 'Что такое инфляция?')
  assert.equal(text!.answer, 'Ответ на текст')
  assert.equal(text!.costUsd, 0.001)
  assert.equal(text!.costRub, 0.1, 'цена в рублях по курсу из настроек')
  assert.equal(text!.login, 'boris')
  assert.equal(text!.chatTitle, 'Что такое инфляция?')
  assert.equal(vision!.kind, 'vision')
  assert.equal(vision!.prompt, '', 'сообщение только с фото')
  assert.deepEqual(vision!.photos, [{ id: photo, width: 300, height: 200 }])
  assert.equal(gen!.kind, 'image')
  assert.equal(gen!.generated.length, 1)
  assert.equal(gen!.generated[0]!.width, 512)
  assert.equal(gen!.costUsd, 0.004 + s.imageCostUsd, 'генерация - токены модели плюс цена картинки')
  assert.equal(err!.status, 'error')
  assert.equal(err!.errorCode, 'upstream')
  assert.equal(err!.prompt, 'Упадёт', 'вопрос виден и у неудачного запроса')
  assert.equal(err!.answer, null)

  assert.deepEqual(
    requestsPage(t.db, { userId, filter: 'image' }, s).items.map((x) => x.id),
    [gen!.id],
  )
  assert.deepEqual(
    requestsPage(t.db, { filter: 'error' }, s).items.map((x) => x.id),
    [err!.id],
  )
  assert.equal(requestsPage(t.db, { userId: 'u_cccccccccccccccccccc' }, s).items.length, 0)

  // пользователь удалил чат: запрос и цена остаются, текста нет
  t.db.run('DELETE FROM chats WHERE id = ?', text!.chatId)
  const after = requestsPage(t.db, { userId }, s).items.at(-1)!
  assert.equal(after.prompt, null)
  assert.equal(after.costUsd, 0.001)
})

test('лента: страницы по курсору, длинный текст обрезается', async () => {
  const db = new Db(':memory:')
  db.run("INSERT INTO users (id, login, password_hash, created_at) VALUES ('u_aaaaaaaaaaaaaaaaaaaa', 'alice', 'x', 0)")
  db.run("INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES ('c1', 'u_aaaaaaaaaaaaaaaaaaaa', 't', 0, 0)")
  db.run("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES ('m1', 'c1', 'user', ?, 0)", 'я'.repeat(CLIP + 50))
  for (let i = 0; i < REQUESTS_PAGE + 5; i++)
    db.run(
      "INSERT INTO usage_events (user_id, kind, tier, plan_id, model, day_key, status, created_at, message_id) VALUES ('u_aaaaaaaaaaaaaaaaaaaa', 'text', 'text', 'week', 'm', 'd', 'ok', ?, ?)",
      i,
      i === 0 ? 'm1' : null,
    )
  const s = readSettings(db)
  const p1 = requestsPage(db, {}, s)
  assert.equal(p1.items.length, REQUESTS_PAGE)
  assert.equal(p1.next, p1.items.at(-1)!.id)
  const p2 = requestsPage(db, { before: p1.next! }, s)
  assert.equal(p2.items.length, 5)
  assert.equal(p2.next, null)
  const first = p2.items.at(-1)!
  assert.equal(first.prompt!.length, CLIP)
  assert.equal(first.clipped, true)
  assert.equal(p1.items[0]!.clipped, false)
})

test('миграция 4: старые события связываются с сообщениями по времени', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ruai-mig-'))
  const file = join(dir, 'old.db')
  try {
    const raw = new DatabaseSync(file)
    raw.exec('PRAGMA foreign_keys = OFF; CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    for (const m of MIGRATIONS.slice(0, 3)) raw.exec(m)
    raw.exec("INSERT INTO meta VALUES ('schema', '3')")
    raw.exec("INSERT INTO users (id, login, password_hash, created_at) VALUES ('u1', 'a', 'x', 0), ('u2', 'b', 'x', 0)")
    raw.exec("INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES ('c1', 'u1', 't', 0, 0), ('c2', 'u2', 't', 0, 0)")
    // u1: удачный запрос в 1000, неудачный в 5000 (вопрос без ответа), удачный в 9000
    raw.exec(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES
      ('q1', 'c1', 'user', 'первый', 1003), ('a1', 'c1', 'assistant', 'ответ 1', 1500),
      ('q2', 'c1', 'user', 'второй', 5001),
      ('q3', 'c1', 'user', 'третий', 9002), ('a3', 'c1', 'assistant', 'ответ 3', 9800),
      ('q4', 'c2', 'user', 'чужой', 9001)`)
    raw.exec(`INSERT INTO usage_events (id, user_id, kind, tier, plan_id, model, day_key, status, created_at) VALUES
      (1, 'u1', 'text', 'text', 'week', 'm', 'd', 'ok', 1000),
      (2, 'u1', 'text', 'text', 'week', 'm', 'd', 'error', 5000),
      (3, 'u1', 'text', 'text', 'week', 'm', 'd', 'ok', 9000),
      (4, 'u2', 'text', 'text', 'week', 'm', 'd', 'ok', 9000),
      (5, 'u1', 'text', 'text', 'week', 'm', 'd', 'error', 20000)`)
    raw.close()

    const db = new Db(file)
    const rows = db.all<{ id: number; chat_id: string | null; message_id: string | null; reply_id: string | null }>('SELECT id, chat_id, message_id, reply_id FROM usage_events ORDER BY id').map((r) => ({ ...r }))
    assert.deepEqual(rows, [
      { id: 1, chat_id: 'c1', message_id: 'q1', reply_id: 'a1' },
      { id: 2, chat_id: 'c1', message_id: 'q2', reply_id: null },
      { id: 3, chat_id: 'c1', message_id: 'q3', reply_id: 'a3' },
      { id: 4, chat_id: 'c2', message_id: 'q4', reply_id: null },
      { id: 5, chat_id: null, message_id: null, reply_id: null },
    ])
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------- API админки ----------

const PATH = 'C'.repeat(43)
const AORIGIN = 'https://admin.test'
const H = { 'x-requested-with': 'ruai-admin', origin: AORIGIN, 'user-agent': 'ua' }

async function adminOn(t: ReturnType<typeof setup>) {
  const secret = newTotpSecret()
  const cfg: Config = {
    host: '127.0.0.1',
    port: 0,
    adminPath: PATH,
    login: 'boss',
    passwordHash: await hashPassword('pw-pw-pw-pw'),
    totpSecret: secret,
    origin: AORIGIN,
    dataDir: mkdtempSync(join(tmpdir(), 'ruai-admin-')),
    authLog: '/dev/null',
    demo: false,
    insecureCookie: false,
    idleMs: 30 * 60_000,
    absoluteMs: 12 * 3_600_000,
    dbFile: ':memory:',
    imagesDir: t.files.dir,
  }
  const now = t.clock.t
  const store = new FileStore(cfg.dataDir)
  const app = buildApp(cfg, {
    store,
    repo: sqlRepo(t.db, t.files, () => now),
    settings: { settings: () => readSettings(t.db), saveSettings: (s) => writeSettings(t.db, s) },
    now: () => now,
    log: () => {},
  })
  const r = await app.inject({ method: 'POST', url: `/${PATH}/api/login`, headers: H, payload: { login: 'boss', password: 'pw-pw-pw-pw', code: totpAt(base32Decode(secret), Math.floor(now / 30_000)) } })
  assert.equal(r.statusCode, 200)
  const cookie = String(r.headers['set-cookie']).split(';')[0]!
  const get = (p: string, auth = true) => app.inject({ method: 'GET', url: `/${PATH}/api/${p}`, headers: { ...H, ...(auth ? { cookie } : {}) } })
  return { get, store }
}

test('API админки: лента запросов и картинки только после входа, просмотр в журнале', async () => {
  const { t, userId, photo } = await site()
  const { get, store } = await adminOn(t)

  assert.equal((await get('requests', false)).statusCode, 401)
  assert.equal((await get(`images/${photo}`, false)).statusCode, 401)

  const all = await get('requests')
  assert.equal(all.statusCode, 200)
  assert.equal((all.json() as RequestsPage).items.length, 4)
  const mine = (await get(`requests?user=${userId}&filter=vision`)).json() as RequestsPage
  assert.deepEqual(
    mine.items.map((x) => x.kind),
    ['vision'],
  )
  assert.equal((await get(`requests?before=${mine.items[0]!.id}`)).statusCode, 200)

  // неверные параметры - 400, лишние - тоже
  for (const q of ['filter=gold', 'user=../../etc', 'before=-1', 'before=abc', 'extra=1']) assert.equal((await get(`requests?${q}`)).statusCode, 400, q)

  const img = await get(`images/${photo}`)
  assert.equal(img.statusCode, 200)
  assert.equal(img.headers['content-type'], 'image/png')
  assert.equal(img.headers['x-content-type-options'], 'nosniff')
  assert.match(String(img.headers['content-security-policy']), /default-src 'none'/)
  assert.equal(img.headers['cache-control'], 'no-store')
  assert.equal(img.rawPayload.subarray(1, 4).toString('latin1'), 'PNG')
  assert.equal((await get('images/img_xxxxxxxxxxxxxxxxxxxx')).statusCode, 404)
  assert.equal((await get('images/..%2F..%2Fetc%2Fpasswd')).statusCode, 400)

  const views = store.recentAudit().filter((a) => a.action === 'view_requests')
  assert.deepEqual(
    views.map((a) => a.detail),
    [`${userId} vision`, 'все all'],
    'первая страница выборки - в журнал, только id пользователя; страницы по курсору не пишутся',
  )
})
