import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, type ChatSummary, type Message } from '@/api'
import { MODELS } from '@/config/app'
import { uid } from '@/lib/id'
import { storage } from '@/lib/storage'

export const useChatStore = defineStore('chat', () => {
  const chats = ref<ChatSummary[]>([])
  const messages = ref<Message[]>([])
  const activeId = ref<string | null>(null)
  const model = ref<string>(storage.get('ruai.model', MODELS[0]!.id))
  const streaming = ref(false)
  const error = ref<string | null>(null)
  let controller: AbortController | null = null

  const activeChat = computed(() => chats.value.find((c) => c.id === activeId.value) ?? null)

  async function loadChats() {
    chats.value = await api.chat.list()
  }

  async function open(chatId: string | null) {
    stop()
    activeId.value = chatId
    error.value = null
    messages.value = chatId ? await api.chat.messages(chatId) : []
  }

  function setModel(id: string) {
    model.value = id
    storage.set('ruai.model', id)
  }

  /** Sends a message and consumes the stream. Returns the chat id (new or existing). */
  async function send(content: string): Promise<string | null> {
    const text = content.trim()
    if (!text || streaming.value) return activeId.value

    error.value = null
    streaming.value = true
    controller = new AbortController()

    const now = new Date().toISOString()
    messages.value.push({ id: uid('tmp_'), chatId: activeId.value ?? '', role: 'user', content: text, createdAt: now, status: 'done' })
    const reply: Message = { id: uid('tmp_'), chatId: activeId.value ?? '', role: 'assistant', content: '', createdAt: now, status: 'streaming' }
    messages.value.push(reply)
    const live = messages.value[messages.value.length - 1]!

    try {
      for await (const ev of api.chat.send({ chatId: activeId.value, content: text, model: model.value }, controller.signal)) {
        if (ev.type === 'chat') {
          activeId.value = ev.chat.id
          const i = chats.value.findIndex((c) => c.id === ev.chat.id)
          if (i >= 0) chats.value.splice(i, 1)
          chats.value.unshift(ev.chat)
        } else if (ev.type === 'delta') {
          live.content += ev.text
        } else if (ev.type === 'done') {
          live.id = ev.message.id
        } else if (ev.type === 'error') {
          throw new Error(ev.error)
        }
      }
      live.status = 'done'
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        live.status = 'done'
      } else {
        live.status = 'error'
        error.value = (e as Error).message || 'Не удалось получить ответ'
      }
    } finally {
      streaming.value = false
      controller = null
    }
    return activeId.value
  }

  function stop() {
    controller?.abort()
  }

  async function remove(chatId: string) {
    await api.chat.remove(chatId)
    chats.value = chats.value.filter((c) => c.id !== chatId)
    if (activeId.value === chatId) await open(null)
  }

  return { chats, messages, activeId, activeChat, model, streaming, error, loadChats, open, send, stop, remove, setModel }
})
