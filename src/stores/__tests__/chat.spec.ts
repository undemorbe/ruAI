import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'

/** Чем ответит сервер на следующую отправку. */
const next = vi.hoisted(() => ({ err: null as null | { message: string; status: number; code: string } }))

vi.mock('@/api', async (orig) => {
  const real = await orig<typeof import('@/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      chat: {
        ...real.api.chat,
        // сервер отказал до потока
        async *send() {
          const e = next.err!
          throw new ApiError(e.message, e.status, e.code)
        },
      },
    },
  }
})

const { useChatStore } = await import('../chat')

describe('chat store refusals', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it.each([
    ['model_off', 503, 'Ответы модели временно недоступны. Попробуйте позже.'],
    ['auth_required', 401, 'Войдите или зарегистрируйтесь, чтобы отправлять запросы.'],
  ])('%s: отказ до модели, черновик возвращается, лента пуста', async (code, status, message) => {
    next.err = { code, status, message }
    const chat = useChatStore()
    await chat.send('Привет')
    expect(chat.messages).toHaveLength(0)
    expect(chat.refusal).toMatchObject({ code, draft: 'Привет', message })
    expect(chat.error).toBeNull()
  })
})
