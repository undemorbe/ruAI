import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setup } from '../testkit.ts'
import type { TgApi, TgUpdate } from './api.ts'
import { TgBot } from './bot.ts'
import { pollOnce, runPolling } from './poll.ts'

function fakeApi() {
  const out: { chat: number; text: string }[] = []
  const answers: string[] = []
  const api = {
    sendMessage: async (chat: number, text: string) => (out.push({ chat, text }), { message_id: 1 }),
    answerCallbackQuery: async (_id: string, text?: string) => void answers.push(text ?? ''),
  } as unknown as TgApi
  return { api, out, answers }
}
const msg = (from: number, text: string, type = 'private'): TgUpdate => ({ update_id: 1, message: { message_id: 1, chat: { id: from, type }, from: { id: from }, text } })

test('/start <token> привязывает и отвечает логином; /status показывает логин', async () => {
  const t = setup()
  await t.register()
  const token = new URL((await t.req('POST', '/api/tg/link')).json().url).searchParams.get('start')!
  const f = fakeApi()
  const bot = new TgBot(t.auth, f.api, 'https://ru-chatgpt.test', () => t.clock.t)
  await bot.handle(msg(4242, `/start ${token}`))
  assert.match(f.out.at(-1)!.text, /^Аккаунт boris подтверждён/)
  assert.equal((await t.req('GET', '/api/auth/me')).json().telegram, true)
  await bot.handle(msg(4242, '/status'))
  assert.match(f.out.at(-1)!.text, /boris/)
  await bot.handle(msg(4242, `/start ${token}`))
  assert.match(f.out.at(-1)!.text, /устарела/)
  await bot.handle(msg(5555, '/status'))
  assert.match(f.out.at(-1)!.text, /не подключён/)
})

test('/start без токена и прочий текст: подсказка; группы и каналы игнорируются', async () => {
  const t = setup()
  const f = fakeApi()
  const bot = new TgBot(t.auth, f.api, 'https://ru-chatgpt.test', () => t.clock.t)
  await bot.handle(msg(1, '/start'))
  assert.match(f.out.at(-1)!.text, /ru-chatgpt\.test/)
  await bot.handle(msg(1, 'привет'))
  assert.match(f.out.at(-1)!.text, /поддержк/)
  const n = f.out.length
  await bot.handle(msg(-100, '/start x', 'supergroup'))
  await bot.handle({ update_id: 9 })
  assert.equal(f.out.length, n)
})

test('кнопки: мусор в callback_data не принимается, на каждое нажатие ответ', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  const ch = (await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })).json().challenge
  const f = fakeApi()
  const bot = new TgBot(t.auth, f.api, 'https://ru-chatgpt.test', () => t.clock.t)
  await bot.handle({ update_id: 2, callback_query: { id: 'q1', from: { id: 4242 }, data: 'rm -rf' } })
  assert.deepEqual(f.answers, ['Запрос устарел'])
  await bot.handle({ update_id: 3, callback_query: { id: 'q2', from: { id: 4242 }, data: `ok:${t.tg.sent[0]!.ref}` } })
  assert.equal(f.answers.at(-1), 'Вход подтверждён')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch })).statusCode, 200)
})

test('pollOnce: offset сохраняется в meta, сбой одного апдейта не останавливает остальные', async () => {
  const t = setup()
  const seen: number[] = []
  const offsets: number[] = []
  const api = {
    getUpdates: async (offset: number) => (offsets.push(offset), offset === 0 ? [{ update_id: 10 }, { update_id: 11 }] : []),
  } as unknown as TgApi
  const handle = async (u: TgUpdate) => {
    seen.push(u.update_id)
    if (u.update_id === 10) throw new Error('boom')
  }
  await pollOnce(t.db, api, handle)
  await pollOnce(t.db, api, handle)
  assert.deepEqual(seen, [10, 11])
  assert.deepEqual(offsets, [0, 12])
})

test('runPolling: ошибка сети не роняет цикл, abort останавливает', async () => {
  const t = setup()
  let calls = 0
  const stop = new AbortController()
  const api = {
    getUpdates: async () => {
      calls++
      if (calls === 1) throw new Error('ECONNRESET')
      stop.abort()
      return []
    },
  } as unknown as TgApi
  await runPolling(t.db, api, async () => {}, stop.signal, 1)
  assert.equal(calls, 2)
})
