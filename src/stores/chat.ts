import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, ApiError, type ChatSummary, type LimitCode, type Message } from '@/api'
import { CONTINUE_PROMPT, MODEL } from '@/config/app'
import { uid } from '@/lib/id'
import { limitMessage } from '@/lib/limits'
import { useUserStore } from './user'

/** Отказ сервера по лимитам: запрос не принят, сообщение не отправлено. */
export interface Refusal {
  code: LimitCode
  message: string
  retryAfter?: number
  /** Текст, который не ушёл, — вернуть в поле ввода. */
  draft: string
}

const LIMIT_CODES = new Set<string>(['no_subscription', 'daily_limit', 'total_limit', 'budget', 'rate_limit', 'busy', 'too_long'])

export const useChatStore = defineStore('chat', () => {
  const user = useUserStore()
  const chats = ref<ChatSummary[]>([])
  const messages = ref<Message[]>([])
  const activeId = ref<string | null>(null)
  const streaming = ref(false)
  const error = ref<string | null>(null)
  const refusal = ref<Refusal | null>(null)
  let controller: AbortController | null = null

  const activeChat = computed(() => chats.value.find((c) => c.id === activeId.value) ?? null)
  /** Последний ответ обрезан лимитом токенов — показываем кнопку «Продолжить». */
  const canContinue = computed(() => {
    const last = messages.value.at(-1)
    return !streaming.value && last?.role === 'assistant' && !!last.truncated
  })

  async function loadChats() {
    chats.value = await api.chat.list()
  }

  async function open(chatId: string | null) {
    stop()
    activeId.value = chatId
    error.value = null
    refusal.value = null
    messages.value = chatId ? await api.chat.messages(chatId) : []
  }

  /** Sends a message and consumes the stream. Returns the chat id (new or existing). */
  async function send(content: string): Promise<string | null> {
    const text = content.trim()
    if (!text || streaming.value) return activeId.value

    error.value = null
    refusal.value = null
    streaming.value = true
    controller = new AbortController()

    const now = new Date().toISOString()
    const before = messages.value.length
    messages.value.push({ id: uid('tmp_'), chatId: activeId.value ?? '', role: 'user', content: text, createdAt: now, status: 'done' })
    const reply: Message = { id: uid('tmp_'), chatId: activeId.value ?? '', role: 'assistant', content: '', createdAt: now, status: 'streaming' }
    messages.value.push(reply)
    const live = messages.value[messages.value.length - 1]!
    let accepted = false

    try {
      for await (const ev of api.chat.send({ chatId: activeId.value, content: text, model: MODEL.id }, controller.signal)) {
        if (ev.type === 'chat') {
          accepted = true
          activeId.value = ev.chat.id
          const i = chats.value.findIndex((c) => c.id === ev.chat.id)
          if (i >= 0) chats.value.splice(i, 1)
          chats.value.unshift(ev.chat)
        } else if (ev.type === 'delta') {
          live.content += ev.text
        } else if (ev.type === 'done') {
          live.id = ev.message.id
          live.truncated = ev.message.truncated
          if (ev.usage) user.setUsage(ev.usage)
        } else if (ev.type === 'error') {
          throw new ApiError(ev.error || limitMessage(ev.code), 0, ev.code, ev.retryAfter)
        }
      }
      live.status = 'done'
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined
      if ((e as Error).name === 'AbortError') {
        live.status = 'done'
      } else if (!accepted && code && LIMIT_CODES.has(code)) {
        // запрос отклонён до модели — убираем черновые сообщения и возвращаем текст
        messages.value.splice(before)
        const err = e as ApiError
        refusal.value = { code: code as LimitCode, message: err.message || limitMessage(code as LimitCode, err.retryAfter), retryAfter: err.retryAfter, draft: text }
      } else {
        live.status = 'error'
        error.value = (e as Error).message || limitMessage(code as LimitCode | undefined)
      }
    } finally {
      streaming.value = false
      controller = null
    }
    return activeId.value
  }

  /** «Продолжи» — отдельный запрос, списывается как обычный. */
  const continueReply = () => send(CONTINUE_PROMPT)

  function stop() {
    controller?.abort()
  }

  async function remove(chatId: string) {
    await api.chat.remove(chatId)
    chats.value = chats.value.filter((c) => c.id !== chatId)
    if (activeId.value === chatId) await open(null)
  }

  return { chats, messages, activeId, activeChat, streaming, error, refusal, canContinue, loadChats, open, send, continueReply, stop, remove }
})
