import assert from 'node:assert/strict'
import { test } from 'node:test'
import { httpTgApi, TgError } from './api.ts'

const TOKEN = '123456:' + 'A'.repeat(35)

test('запрос идёт POST JSON на метод бота, ответ разворачивается из result', async () => {
  const calls: { url: string; body: unknown }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 })
  }) as unknown as typeof fetch
  const tg = httpTgApi(TOKEN, f)
  const r = await tg.sendMessage(42, 'hi', [[{ text: 'Да', callback_data: 'ok:x' }]])
  assert.equal(r.message_id, 7)
  assert.equal(calls[0]!.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`)
  assert.deepEqual(calls[0]!.body, {
    chat_id: 42,
    text: 'hi',
    reply_markup: { inline_keyboard: [[{ text: 'Да', callback_data: 'ok:x' }]] },
    link_preview_options: { is_disabled: true },
  })
})

test('ошибка Telegram и сбой сети: TgError без токена в тексте', async () => {
  const bad = (async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })) as unknown as typeof fetch
  await assert.rejects(httpTgApi(TOKEN, bad).sendMessage(1, 'x'), (e: unknown) => e instanceof TgError && e.status === 403 && !e.message.includes('AAAA'))
  const down = (async (url: string) => {
    throw new TypeError(`fetch failed ${url}`)
  }) as unknown as typeof fetch
  await assert.rejects(httpTgApi(TOKEN, down).getMe(), (e: unknown) => e instanceof TgError && e.status === 0 && !e.message.includes('AAAA'))
})
