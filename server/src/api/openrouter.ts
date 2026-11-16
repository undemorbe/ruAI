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

export class LlmError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Llm {
  stream(req: { model: string; messages: LlmMessage[]; maxTokens: number; user: string; signal: AbortSignal }): AsyncGenerator<LlmChunk>
  image(req: { model: string; messages: LlmMessage[]; user: string; signal: AbortSignal }): Promise<{ images: Buffer[]; text: string; usage: LlmUsage | null }>
}

type Fetch = typeof fetch
const URL_ = 'https://openrouter.ai/api/v1/chat/completions'

function usageOf(u: unknown): LlmUsage | null {
  if (!u || typeof u !== 'object') return null
  const o = u as Record<string, unknown>
  return { tokensIn: Number(o.prompt_tokens) || 0, tokensOut: Number(o.completion_tokens) || 0, costUsd: Number(o.cost) || 0 }
}

export function openRouter(key: string, referer: string, f: Fetch = fetch): Llm {
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': referer,
    'X-Title': 'ruAI',
  }
  async function post(body: object, signal: AbortSignal) {
    const res = await f(URL_, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!res.ok) {
      // тело ошибки не пробрасываем пользователю: там бывают детали аккаунта
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      throw new LlmError(res.status, `openrouter ${res.status}: ${detail}`)
    }
    return res
  }

  return {
    async *stream({ model, messages, maxTokens, user, signal }) {
      const res = await post({ model, messages, stream: true, max_tokens: maxTokens, usage: { include: true }, user }, signal)
      if (!res.body) throw new LlmError(502, 'openrouter: empty body')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let finish: string | null = null
      let usage: LlmUsage | null = null
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue // комментарии «: OPENROUTER PROCESSING»
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          let j: Record<string, unknown>
          try {
            j = JSON.parse(data) as Record<string, unknown>
          } catch {
            continue
          }
          if (j.error) throw new LlmError(502, `openrouter stream error: ${JSON.stringify(j.error).slice(0, 300)}`)
          const choice = (j.choices as { delta?: { content?: string }; finish_reason?: string | null }[] | undefined)?.[0]
          const text = choice?.delta?.content
          if (text) yield { type: 'text', text }
          if (choice?.finish_reason) finish = choice.finish_reason
          if (j.usage) usage = usageOf(j.usage)
        }
      }
      yield { type: 'end', finish, usage }
    },

    async image({ model, messages, user, signal }) {
      const res = await post({ model, messages, modalities: ['image', 'text'], usage: { include: true }, user }, signal)
      const j = (await res.json()) as { choices?: { message?: { content?: string; images?: { image_url?: { url?: string } }[] } }[]; usage?: unknown }
      const msg = j.choices?.[0]?.message
      const images: Buffer[] = []
      for (const im of msg?.images ?? []) {
        const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(im.image_url?.url ?? '')
        if (m) images.push(Buffer.from(m[2]!, 'base64'))
      }
      return { images, text: typeof msg?.content === 'string' ? msg.content : '', usage: usageOf(j.usage) }
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
    async image() {
      return { images: [png], text: 'Заглушка изображения', usage: { tokensIn: 10, tokensOut: 10, costUsd: 0.001 } }
    },
  }
}
