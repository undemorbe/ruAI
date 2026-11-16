import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grantSubscription } from './billing.ts'
import { LlmError } from './openrouter.ts'
import { setup } from './testkit.ts'
import { initializeSettings, writeSettings, readSettings } from './ledger.ts'

const send = (t: ReturnType<typeof setup>, body: object) => t.req('POST', '/api/chats/messages', { chatId: null, content: 'Привет', ...body })

async function paid(tier: 'text' | 'media' = 'text', planId: 'week' | 'month' | 'quarter' = 'week') {
  const t = setup()
  const userId = await t.register()
  grantSubscription(t.db, { userId, tier, planId, now: t.clock.t })
  return { t, userId }
}

test('гость - 401 auth_required, пользователь без подписки - 402 no_subscription, модель не вызывается', async () => {
  const t = setup()
  const g = await send(t, {})
  assert.equal(g.statusCode, 401)
  assert.equal(g.json().code, 'auth_required')
  assert.equal((await t.req('POST', '/api/uploads')).json().code, 'auth_required', 'загрузка фото - тоже после входа')
  await t.register()
  assert.equal((await send(t, {})).json().code, 'no_subscription')
  assert.equal(t.llm.calls.length, 0)
})

test('ответ стримом: chat → delta → done, счётчики и стоимость записаны, история в БД', async () => {
  const { t } = await paid()
  const r = await send(t, { content: 'Как дела?' })
  assert.equal(r.statusCode, 200)
  assert.match(String(r.headers['content-type']), /text\/event-stream/)
  const ev = t.events(r.body)
  assert.deepEqual(
    ev.map((e) => e.type),
    ['chat', 'delta', 'delta', 'done'],
  )
  const done = ev.at(-1) as { message: { content: string; chatId: string }; usage: { totalUsed: number; dailyUsed: number } }
  assert.equal(done.message.content, 'Привет, мир')
  assert.equal(done.usage.totalUsed, 1)
  assert.equal(done.usage.dailyUsed, 1)
  assert.equal(t.llm.calls[0]!.model, 'm/text', 'модель по тарифу выбирает сервер')
  assert.equal(t.llm.calls[0]!.messages[0]!.role, 'system')

  const usage = t.db.get<{ status: string; cost_usd: number; tokens_in: number }>('SELECT status, cost_usd, tokens_in FROM usage_events')!
  assert.deepEqual({ ...usage }, { status: 'ok', cost_usd: 0.001, tokens_in: 100 })
  assert.equal(t.db.get<{ spent_usd: number }>('SELECT spent_usd FROM subscriptions')!.spent_usd, 0.001)

  const chats = (await t.req('GET', '/api/chats')).json() as { id: string; title: string }[]
  assert.equal(chats.length, 1)
  assert.equal(chats[0]!.title, 'Как дела?')
  const msgs = (await t.req('GET', `/api/chats/${chats[0]!.id}/messages`)).json() as { role: string }[]
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'assistant'],
  )
})

test('текстовая модель запроса берётся из настроек, заданных администратором', async () => {
  const { t } = await paid()
  const current = readSettings(t.db)
  writeSettings(t.db, { ...current, models: { ...current.models, text: 'custom/text-model' } })

  await send(t, {})

  assert.equal(t.llm.calls[0]!.model, 'custom/text-model')
})

test('размышления не уходят в поток или историю, видимый ответ приходит словами', async () => {
  const { t } = await paid()
  t.llm.script = [
    { type: 'text', text: '<think>Private reasoning' },
    { type: 'text', text: '</think>Финальный' },
    { type: 'text', text: ' ответ.' },
    { type: 'end', finish: 'stop', usage: { tokensIn: 10, tokensOut: 5, costUsd: 0.001 } },
  ]

  const events = t.events((await send(t, {})).body)
  const deltas = events.filter((event) => event.type === 'delta').map((event) => (event as { text: string }).text)
  const done = events.at(-1) as { message: { content: string } }

  assert.deepEqual(deltas, ['Финальный ', 'ответ.'])
  assert.equal(done.message.content, 'Финальный ответ.')
  assert.doesNotMatch(JSON.stringify(events), /Private reasoning|<think>/)
})

test('старые размеченные размышления скрываются из истории и контекста', async () => {
  const { t } = await paid()
  const initial = t.events((await send(t, {})).body)
  const chatId = (initial[0] as { chat: { id: string } }).chat.id
  t.db.run("UPDATE messages SET content = ? WHERE chat_id = ? AND role = 'assistant'", '<think>Private reasoning</think>Visible answer', chatId)

  const history = (await t.req('GET', `/api/chats/${chatId}/messages`)).json() as { role: string; content: string }[]
  assert.equal(history.at(-1)!.content, 'Visible answer')
  assert.doesNotMatch(JSON.stringify(history), /Private reasoning|<think>/)

  t.clock.t += 61_000
  await t.req('POST', '/api/chats/messages', { chatId, content: 'Continue' })
  assert.ok(t.llm.calls.at(-1)!.messages.some((message) => message.role === 'assistant' && message.content === 'Visible answer'))
})

test('модели из API окружения заполняют настройки без ID в старых данных', () => {
  const t = setup()
  t.db.run('UPDATE settings SET value = ? WHERE key = ?', JSON.stringify({ generationEnabled: false }), 'admin')
  const configured = { text: 'env/text-model', media: 'env/media-model', image: 'env/image-model' }

  initializeSettings(t.db, configured)

  assert.deepEqual(readSettings(t.db).models, configured)
  assert.equal(readSettings(t.db).generationEnabled, false)
})

test('продолжение чата: в модель уходит история', async () => {
  const { t } = await paid()
  const first = t.events((await send(t, { content: 'Раз' })).body)
  const chatId = (first[0] as { chat: { id: string } }).chat.id
  t.clock.t += 61_000
  await send(t, { chatId, content: 'Два' })
  const roles = t.llm.calls[1]!.messages.map((m) => m.role)
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user'])
})

test('обрезанный ответ помечается truncated', async () => {
  const { t } = await paid()
  t.llm.script = [
    { type: 'text', text: 'Длинно' },
    { type: 'end', finish: 'length', usage: { tokensIn: 1, tokensOut: 16000, costUsd: 0.01 } },
  ]
  const done = t.events((await send(t, {})).body).at(-1) as { message: { truncated?: boolean } }
  assert.equal(done.message.truncated, true)
})

test('ошибка OpenRouter без ответа — запрос не списывается, расход не растёт', async () => {
  const { t } = await paid()
  t.llm.script = new LlmError(502, 'boom')
  const ev = t.events((await send(t, {})).body)
  assert.deepEqual(
    ev.map((e) => e.type),
    ['chat', 'error'],
  )
  assert.equal((ev[1] as { code: string }).code, 'upstream')
  const sub = t.db.get<{ total_used: number; daily_used: number }>('SELECT total_used, daily_used FROM subscriptions')!
  assert.deepEqual({ ...sub }, { total_used: 0, daily_used: 0 })
  assert.equal(t.db.get<{ status: string }>('SELECT status FROM usage_events')!.status, 'error')
  // текст ошибки провайдера пользователю не уходит
  assert.doesNotMatch(JSON.stringify(ev), /boom/)
})

test('частота: шестой запрос за минуту — 429 rate_limit с Retry-After', async () => {
  const { t } = await paid()
  for (let i = 0; i < 5; i++) assert.equal((await send(t, {})).statusCode, 200)
  const r = await send(t, {})
  assert.equal(r.statusCode, 429)
  assert.equal(r.json().code, 'rate_limit')
  assert.ok(Number(r.headers['retry-after']) > 0)
  t.clock.t += 60_001
  assert.equal((await send(t, {})).statusCode, 200)
})

test('суточный лимит сбрасывается в полночь по Москве, общий — нет', async () => {
  const { t } = await paid()
  t.db.run('UPDATE subscriptions SET daily_used = daily_limit, daily_key = ?', '2026-11-16')
  const r = await send(t, {})
  assert.equal(r.statusCode, 429)
  assert.equal(r.json().code, 'daily_limit')
  t.clock.t = Date.parse('2026-11-16T21:00:00Z') // 00:00 МСК 17 ноября
  assert.equal((await send(t, {})).statusCode, 200)

  t.db.run('UPDATE subscriptions SET total_used = total_limit')
  t.clock.t += 61_000
  assert.equal((await send(t, {})).json().code, 'total_limit')
})

test('бюджет подписки: расход ≥ бюджета — 402 budget', async () => {
  const { t } = await paid()
  const s = readSettings(t.db)
  t.db.run('UPDATE subscriptions SET spent_usd = ?', s.budgetsRub.text.week / s.usdRub)
  assert.equal((await send(t, {})).json().code, 'budget')
})

test('суточный предохранитель расходов на весь сервис', async () => {
  const { t } = await paid()
  t.db.run(
    "INSERT INTO usage_events (user_id, kind, tier, plan_id, model, day_key, status, cost_usd, created_at) VALUES (NULL, 'text', 'text', 'week', 'x', '2026-11-16', 'ok', 30, 0)",
  )
  const r = await send(t, {})
  assert.equal(r.statusCode, 502)
  assert.match(r.json().message, /перегружен/)
})

test('один запрос одновременно: второй — 409 busy', async () => {
  const { t } = await paid()
  let open!: () => void
  t.llm.gate = new Promise((r) => (open = r))
  const first = send(t, {})
  await new Promise((r) => setTimeout(r, 20))
  const second = await send(t, {})
  assert.equal(second.statusCode, 409)
  assert.equal(second.json().code, 'busy')
  t.llm.gate = null
  open()
  assert.equal((await first).statusCode, 200)
  t.clock.t += 61_000
  assert.equal((await send(t, {})).statusCode, 200, 'после ответа можно снова')
})

test('слишком длинное сообщение — 413 too_long до вызова модели', async () => {
  const { t } = await paid()
  const r = await send(t, { content: 'я'.repeat(48_100) })
  assert.equal(r.statusCode, 413)
  assert.equal(r.json().code, 'too_long')
  assert.equal(t.llm.calls.length, 0)
})

test('картинки и фото — только тариф media; генерацию можно выключить и ограничить', async () => {
  const { t } = await paid('text')
  assert.equal((await send(t, { mode: 'image' })).json().code, 'media_required')

  const m = await paid('media', 'month')
  const s = readSettings(m.t.db)
  writeSettings(m.t.db, { ...s, generationEnabled: false })
  assert.equal((await send(m.t, { mode: 'image' })).json().code, 'generation_disabled')
  writeSettings(m.t.db, { ...s, generationLimits: { ...s.generationLimits, month: 0 } })
  assert.equal((await send(m.t, { mode: 'image' })).json().code, 'generation_limit')
})

test('чужой чат — 404, как несуществующий; удалить и переименовать чужой нельзя', async () => {
  const { t } = await paid()
  const chatId = (t.events((await send(t, {})).body)[0] as { chat: { id: string } }).chat.id
  const mine = t.cookie
  t.cookie = ''
  await t.register('other')
  assert.equal((await t.req('GET', `/api/chats/${chatId}/messages`)).statusCode, 404)
  assert.equal((await t.req('PATCH', `/api/chats/${chatId}`, { title: 'x' })).statusCode, 404)
  assert.equal((await t.req('DELETE', `/api/chats/${chatId}`)).statusCode, 404)
  assert.equal((await t.req('POST', '/api/chats/messages', { chatId, content: 'hi' })).statusCode, 404)
  t.cookie = mine
  assert.equal((await t.req('PATCH', `/api/chats/${chatId}`, { title: '  Новое\nимя ' })).statusCode, 200)
  assert.equal(t.db.get<{ title: string }>('SELECT title FROM chats')!.title, 'Новое имя')
  assert.equal((await t.req('DELETE', `/api/chats/${chatId}`)).statusCode, 200)
  assert.equal(t.db.get('SELECT * FROM messages'), undefined, 'сообщения удалены каскадом')
})

test('незакрытый резерв после падения возвращается', async () => {
  const { t, userId } = await paid()
  const { reserve, releaseStale } = await import('./ledger.ts')
  reserve(t.db, { userId, kind: 'text', model: 'x', now: t.clock.t, dailyUsdCap: 30 })
  assert.equal(t.db.get<{ total_used: number }>('SELECT total_used FROM subscriptions')!.total_used, 1)
  assert.equal(releaseStale(t.db, t.clock.t + 11 * 60_000), 1)
  assert.equal(t.db.get<{ total_used: number }>('SELECT total_used FROM subscriptions')!.total_used, 0)
})

test('модель не подключена (нет ключа) — 503 model_off до резерва, запрос не списывается', async () => {
  const t = setup({ deps: { llm: null } })
  const userId = await t.register()
  grantSubscription(t.db, { userId, tier: 'text', planId: 'week', now: t.clock.t })
  const r = await send(t, {})
  assert.equal(r.statusCode, 503)
  assert.equal(r.json().code, 'model_off')
  assert.equal(t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM usage_events')!.n, 0)
  assert.equal(t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages')!.n, 0)
  // остальное API работает
  assert.equal((await t.req('GET', '/api/chats')).statusCode, 200)
})
