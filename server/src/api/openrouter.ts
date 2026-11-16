/**
 * Клиент OpenRouter. Ключ — только здесь, в заголовке запроса с сервера.
 * fetch передаётся снаружи: в тестах — подделка, без сети и без расходов.
 */

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Part[]
}
export interface LlmUsage {
  tokensIn: number
  tokensOut: number
  /** Фактическая стоимость от OpenRouter, $. */
  costUsd: number
}
export type LlmChunk = { type: 'text'; text: string } | { type: 'end'; finish: string | null; usage: LlmUsage | null }
/** Ответ оркестратора: текст, картинки от инструмента генерации, итог. */
export type AgentChunk = LlmChunk | { type: 'image'; data: Buffer }

/** Серверный инструмент OpenRouter: модель-оркестратор сама решает, когда рисовать. */
export const IMAGE_TOOL = 'openrouter:image_generation'

export interface AgentRequest {
  model: string
  /** Системная инструкция (уходит в `instructions`). */
  instructions: string
  messages: LlmMessage[]
  maxTokens: number
  user: string
  signal: AbortSignal
  /** null: генерация недоступна, инструмент не передаём. */
  imageTool: { model: string } | null
  /** Пользователь явно попросил картинку: вызов инструмента обязателен. */
  forceImage?: boolean
}

export class LlmError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Llm {
  stream(req: { model: string; messages: LlmMessage[]; maxTokens: number; user: string; signal: AbortSignal }): AsyncGenerator<LlmChunk>
  /** Responses API с инструментом `openrouter:image_generation` (расширенный тариф). */
  respond(req: AgentRequest): AsyncGenerator<AgentChunk>
}

type Fetch = typeof fetch
const BASE = 'https://openrouter.ai/api/v1'

function usageOf(u: unknown): LlmUsage | null {
  if (!u || typeof u !== 'object') return null
  const o = u as Record<string, unknown>
  return {
    tokensIn: Number(o.prompt_tokens ?? o.input_tokens) || 0,
    tokensOut: Number(o.completion_tokens ?? o.output_tokens) || 0,
    costUsd: Number(o.cost) || 0,
  }
}

/** Только растровые data:URL; внешние ссылки и SVG не принимаем. */
export function dataImage(url: unknown): Buffer | null {
  const m = typeof url === 'string' ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url) : null
  return m ? Buffer.from(m[2]!, 'base64') : null
}

/** Сообщения чата в формат `input` Responses API. */
export function toResponsesInput(messages: LlmMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content }
    return {
      role: m.role,
      content: m.content.map((p) => (p.type === 'text' ? { type: 'input_text', text: p.text } : { type: 'input_image', image_url: p.image_url.url, detail: 'auto' })),
    }
  })
}

/** Построчный разбор SSE: отдаёт JSON каждой строки `data:`. */
async function* sseJson(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue // комментарии «: OPENROUTER PROCESSING», строки event:
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        yield JSON.parse(data) as Record<string, unknown>
      } catch {
        continue
      }
    }
  }
}

export function openRouter(key: string, referer: string, f: Fetch = fetch): Llm {
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': referer,
    'X-Title': 'ruAI',
  }
  async function post(path: string, body: object, signal: AbortSignal) {
    const res = await f(BASE + path, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!res.ok) {
      // тело ошибки не пробрасываем пользователю: там бывают детали аккаунта
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      throw new LlmError(res.status, `openrouter ${res.status}: ${detail}`)
    }
    return res
  }

  return {
    async *stream({ model, messages, maxTokens, user, signal }) {
      const res = await post('/chat/completions', { model, messages, stream: true, max_tokens: maxTokens, usage: { include: true }, user }, signal)
      if (!res.body) throw new LlmError(502, 'openrouter: empty body')
      let finish: string | null = null
      let usage: LlmUsage | null = null
      for await (const j of sseJson(res.body)) {
        if (j.error) throw new LlmError(502, `openrouter stream error: ${JSON.stringify(j.error).slice(0, 300)}`)
        const choice = (j.choices as { delta?: { content?: string }; finish_reason?: string | null }[] | undefined)?.[0]
        const text = choice?.delta?.content
        if (text) yield { type: 'text', text }
        if (choice?.finish_reason) finish = choice.finish_reason
        if (j.usage) usage = usageOf(j.usage)
      }
      yield { type: 'end', finish, usage }
    },

    async *respond({ model, instructions, messages, maxTokens, user, signal, imageTool, forceImage }) {
      const body: Record<string, unknown> = {
        model,
        instructions,
        input: toResponsesInput(messages),
        stream: true,
        max_output_tokens: maxTokens,
        user,
      }
      if (imageTool) {
        // quality medium: auto может выбрать high, это в разы дороже при той же пользе в чате
        body.tools = [{ type: IMAGE_TOOL, parameters: { model: imageTool.model, quality: 'medium' } }]
        body.tool_choice = forceImage ? 'required' : 'auto'
        // одна генерация на сообщение: так совпадает со счётчиком генераций и бюджетом
        body.max_tool_calls = 1
      }
      const res = await post('/responses', body, signal)
      if (!res.body) throw new LlmError(502, 'openrouter: empty body')
      const seen = new Set<string>()
      let finish: string | null = null
      let usage: LlmUsage | null = null
      const pick = (item: unknown): Buffer | null => {
        const it = item as { type?: string; id?: string; result?: unknown; imageUrl?: unknown } | null
        if (it?.type !== IMAGE_TOOL) return null
        // id может не прийти: тогда ключ по хвосту данных (один и тот же элемент бывает и в item.done, и в completed)
        const key = it.id ?? String(it.result ?? it.imageUrl ?? '').slice(-96)
        if (seen.has(key)) return null
        const data = dataImage(it.result) ?? dataImage(it.imageUrl)
        if (data) seen.add(key)
        return data
      }
      for await (const j of sseJson(res.body)) {
        const type = String(j.type ?? '')
        if (j.error || type === 'error' || type === 'response.failed') {
          const err = j.error ?? (j.response as { error?: unknown } | undefined)?.error ?? type
          throw new LlmError(502, `openrouter stream error: ${JSON.stringify(err).slice(0, 300)}`)
        }
        if ((type === 'response.output_text.delta' || type === 'response.content_part.delta') && typeof j.delta === 'string' && j.delta) {
          yield { type: 'text', text: j.delta }
        } else if (type === 'response.output_item.done') {
          const data = pick(j.item)
          if (data) yield { type: 'image', data }
        } else if (type === 'response.completed' || type === 'response.done' || type === 'response.incomplete') {
          const r = (j.response ?? {}) as { status?: string; usage?: unknown; output?: unknown[]; incomplete_details?: { reason?: string } | null }
          for (const item of r.output ?? []) {
            const data = pick(item)
            if (data) yield { type: 'image', data }
          }
          usage = usageOf(r.usage) ?? usage
          finish = r.status === 'incomplete' ? (r.incomplete_details?.reason === 'max_output_tokens' ? 'length' : (r.incomplete_details?.reason ?? 'incomplete')) : 'stop'
        }
      }
      yield { type: 'end', finish, usage }
    },
  }
}

/** Заглушка для локальной разработки: потоковый ответ и картинка без сети и денег. */
export function stubLlm(): Llm {
  // 1×1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  return {
    async *stream({ messages }) {
      const last = messages.at(-1)
      const text = typeof last?.content === 'string' ? last.content : 'фото'
      for (const w of `Локальная заглушка вместо модели. Вы написали: «${text.slice(0, 200)}».`.split(/(?<= )/)) {
        await new Promise((r) => setTimeout(r, 25))
        yield { type: 'text', text: w }
      }
      yield { type: 'end', finish: 'stop', usage: { tokensIn: 50, tokensOut: 20, costUsd: 0.0001 } }
    },
    async *respond({ messages, imageTool, forceImage }) {
      const last = messages.at(-1)
      const said = typeof last?.content === 'string' ? last.content : (last?.content.find((p) => p.type === 'text') as { text?: string } | undefined)?.text ?? ''
      if (imageTool && (forceImage || /нарису|изобрази|сгенерир|картинк|draw/i.test(said))) {
        await new Promise((r) => setTimeout(r, 300))
        yield { type: 'image', data: png }
      }
      for (const w of `Локальная заглушка вместо модели. Вы написали: «${said.slice(0, 200)}».`.split(/(?<= )/)) {
        await new Promise((r) => setTimeout(r, 25))
        yield { type: 'text', text: w }
      }
      yield { type: 'end', finish: 'stop', usage: { tokensIn: 50, tokensOut: 20, costUsd: 0.001 } }
    },
  }
}
