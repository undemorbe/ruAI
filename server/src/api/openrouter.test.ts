import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LlmError, dataImage, openRouter, toResponsesInput, type AgentRequest } from './openrouter.ts'

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

const respondReq = (over: Partial<AgentRequest> = {}): AgentRequest => ({
  model: 'openai/gpt-5.6-luna',
  instructions: 'sys',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Нарисуй осла' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }] }],
  maxTokens: 100,
  user: 'u',
  signal: new AbortController().signal,
  imageTool: { model: 'openai/gpt-image-2.6-flare' },
  ...over,
})

test('respond: Responses API с инструментом openrouter:image_generation, одна генерация, ключ только в заголовке', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const png = Buffer.from([1, 2, 3]).toString('base64')
  const item = { type: 'openrouter:image_generation', id: 'ig_1', status: 'completed', result: `data:image/png;base64,${png}`, prompt: 'a donkey' }
  const f = (async (url: string, init: RequestInit) => {
    seen = { url, init }
    return sse([
      'event: response.created',
      'data: {"type":"response.created","response":{"status":"in_progress"}}',
      'data: {"type":"response.reasoning_text.delta","delta":"думаю"}',
      `data: ${JSON.stringify({ type: 'response.output_item.done', item })}`,
      'data: {"type":"response.output_text.delta","delta":"Вот "}',
      'data: {"type":"response.content_part.delta","delta":"осёл"}',
      `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [item, { type: 'openrouter:image_generation', id: 'ig_2', result: 'https://evil.example/x.png' }], usage: { input_tokens: 20, output_tokens: 5, cost: 0.051 } } })}`,
      'data: [DONE]',
    ])
  }) as typeof fetch
  const out = []
  for await (const ch of openRouter('sk-or-secret', 'o', f).respond(respondReq())) out.push(ch)
  assert.deepEqual(out, [
    { type: 'image', data: Buffer.from([1, 2, 3]) },
    { type: 'text', text: 'Вот ' },
    { type: 'text', text: 'осёл' },
    { type: 'end', finish: 'stop', usage: { tokensIn: 20, tokensOut: 5, costUsd: 0.051 } },
  ])
  const s = seen as unknown as { url: string; init: RequestInit }
  assert.equal(s.url, 'https://openrouter.ai/api/v1/responses')
  assert.equal(new Headers(s.init.headers).get('Authorization'), 'Bearer sk-or-secret')
  assert.ok(!String(s.init.body).includes('sk-or-secret'))
  const body = JSON.parse(String(s.init.body))
  assert.equal(body.model, 'openai/gpt-5.6-luna')
  assert.equal(body.instructions, 'sys')
  assert.deepEqual(body.tools, [{ type: 'openrouter:image_generation', parameters: { model: 'openai/gpt-image-2.6-flare', quality: 'medium' } }])
  assert.equal(body.tool_choice, 'auto')
  assert.equal(body.max_tool_calls, 1)
  assert.equal(body.max_output_tokens, 100)
  assert.deepEqual(body.input, [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Нарисуй осла' },
        { type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA', detail: 'auto' },
      ],
    },
  ])
})

test('respond: без инструмента - без tools; forceImage - tool_choice required; обрыв по длине; ошибки', async () => {
  const bodies: Record<string, unknown>[] = []
  const f = (async (_u: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    return sse(['data: {"type":"response.output_text.delta","delta":"а"}', 'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}}'])
  }) as unknown as typeof fetch
  const llm = openRouter('k', 'o', f)
  const out = []
  for await (const ch of llm.respond(respondReq({ imageTool: null, forceImage: true }))) out.push(ch)
  assert.deepEqual(out.at(-1), { type: 'end', finish: 'length', usage: null })
  assert.equal(bodies[0]!.tools, undefined)
  assert.equal(bodies[0]!.tool_choice, undefined)
  for await (const _ of llm.respond(respondReq({ forceImage: true }))) void _
  assert.equal(bodies[1]!.tool_choice, 'required')

  const failed = openRouter('k', 'o', (async () => sse(['data: {"type":"response.failed","response":{"error":{"message":"content policy"}}}'])) as unknown as typeof fetch)
  await assert.rejects(async () => {
    for await (const _ of failed.respond(respondReq())) void _
  }, LlmError)
  const http = openRouter('k', 'o', (async () => new Response('{"error":"no credits"}', { status: 402 })) as unknown as typeof fetch)
  await assert.rejects(async () => {
    for await (const _ of http.respond(respondReq())) void _
  }, (e: unknown) => e instanceof LlmError && e.status === 402)
})

test('dataImage: только растровые data:URL', () => {
  assert.deepEqual([...dataImage(`data:image/webp;base64,${Buffer.from([7]).toString('base64')}`)!], [7])
  assert.equal(dataImage('data:image/svg+xml;base64,PHN2Zz4='), null)
  assert.equal(dataImage('https://evil.example/x.png'), null)
  assert.equal(dataImage(undefined), null)
})

test('toResponsesInput: строки как есть, картинки как input_image', () => {
  assert.deepEqual(toResponsesInput([{ role: 'assistant', content: 'привет' }]), [{ role: 'assistant', content: 'привет' }])
})
