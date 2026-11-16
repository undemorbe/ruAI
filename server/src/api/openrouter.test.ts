import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LlmError, openRouter } from './openrouter.ts'

function sse(lines: string[], status = 200) {
  const body = new ReadableStream({
    start(c) {
      // режем на куски посреди строк — парсер должен склеивать
      const all = new TextEncoder().encode(lines.join('\n') + '\n')
      for (let i = 0; i < all.length; i += 7) c.enqueue(all.subarray(i, i + 7))
      c.close()
    },
  })
  return new Response(body, { status })
}

test('stream: склейка кусков, комментарии, usage и finish_reason; ключ только в заголовке', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const f = (async (url: string, init: RequestInit) => {
    seen = { url, init }
    return sse([
      ': OPENROUTER PROCESSING',
      'data: {"choices":[{"delta":{"content":"При"}}]}',
      'data: {"choices":[{"delta":{"content":"вет"},"finish_reason":"length"}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"cost":0.0042}}',
      'data: [DONE]',
    ])
  }) as typeof fetch
  const llm = openRouter('sk-or-secret', 'https://ru-chatgpt.com', f)
  const out = []
  for await (const ch of llm.stream({ model: 'm', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10, user: 'u', signal: new AbortController().signal })) out.push(ch)
  assert.deepEqual(out, [
    { type: 'text', text: 'При' },
    { type: 'text', text: 'вет' },
    { type: 'end', finish: 'length', usage: { tokensIn: 12, tokensOut: 3, costUsd: 0.0042 } },
  ])
  const s = seen as unknown as { url: string; init: RequestInit }
  assert.equal(new Headers(s.init.headers).get('Authorization'), 'Bearer sk-or-secret')
  const body = JSON.parse(String(s.init.body))
  assert.equal(body.max_tokens, 10)
  assert.deepEqual(body.usage, { include: true })
  assert.ok(!String(s.init.body).includes('sk-or-secret'))
})

test('ошибки: HTTP-статус и error внутри стрима', async () => {
  const bad = openRouter('k', 'o', (async () => new Response('{"error":"no credits"}', { status: 402 })) as unknown as typeof fetch)
  await assert.rejects(async () => {
    for await (const _ of bad.stream({ model: 'm', messages: [], maxTokens: 1, user: 'u', signal: new AbortController().signal })) void _
  }, (e: unknown) => e instanceof LlmError && e.status === 402)
  const mid = openRouter('k', 'o', (async () => sse(['data: {"choices":[{"delta":{"content":"a"}}]}', 'data: {"error":{"message":"overloaded"}}'])) as unknown as typeof fetch)
  await assert.rejects(async () => {
    for await (const _ of mid.stream({ model: 'm', messages: [], maxTokens: 1, user: 'u', signal: new AbortController().signal })) void _
  }, LlmError)
})

test('image: берёт только data:image base64, остальное игнорирует', async () => {
  const png = Buffer.from([1, 2, 3]).toString('base64')
  const f = (async () =>
    Response.json({
      choices: [{ message: { content: 'ok', images: [{ image_url: { url: `data:image/png;base64,${png}` } }, { image_url: { url: 'https://evil.example/x.png' } }, { image_url: { url: 'data:image/svg+xml;base64,PHN2Zz4=' } }] } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.04 },
    })) as unknown as typeof fetch
  const r = await openRouter('k', 'o', f).image({ model: 'm', messages: [], user: 'u', signal: new AbortController().signal })
  assert.equal(r.images.length, 1)
  assert.deepEqual([...r.images[0]!], [1, 2, 3])
  assert.equal(r.usage?.costUsd, 0.04)
})
