import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestEntry, RequestsPage, RequestsQuery } from '../api/types'

const entry = (over: Partial<RequestEntry> = {}): RequestEntry => ({
  id: 10,
  at: '2026-11-16T09:00:00.000Z',
  userId: 'u_aaaaaaaaaaaaaaaaaaaa',
  login: 'alice',
  kind: 'image',
  tier: 'media',
  model: 'm/media',
  status: 'ok',
  errorCode: null,
  tokensIn: 120,
  tokensOut: 30,
  costUsd: 0.0245,
  costRub: 2.33,
  chatId: 'c1',
  chatTitle: 'Кот',
  prompt: 'Нарисуй кота',
  answer: 'Готово',
  clipped: false,
  truncated: false,
  photos: [],
  generated: [{ id: 'img_gggggggggggggggggggg', width: 512, height: 512 }],
  ...over,
})

const calls: RequestsQuery[] = []
let pages: RequestsPage[] = []
vi.mock('../api', () => ({
  adminApi: {
    requests: async (q: RequestsQuery) => {
      calls.push(q)
      return pages.shift() ?? { items: [], next: null }
    },
    imageUrl: (id: string) => `/api/images/${id}`,
  },
}))

const { default: RequestFeed } = await import('../ui/RequestFeed.vue')
const { userCard } = await import('../state')

describe('RequestFeed', () => {
  beforeEach(() => {
    calls.length = 0
    userCard.value = null
  })
  afterEach(() => {
    pages = []
  })

  it('вопрос, ответ, генерация и цена; картинка открывается и закрывается по Escape', async () => {
    pages = [{ items: [entry()], next: null }]
    const w = mount(RequestFeed, { props: { userId: 'u_aaaaaaaaaaaaaaaaaaaa' }, attachTo: document.body })
    await flushPromises()
    expect(calls).toEqual([{ userId: 'u_aaaaaaaaaaaaaaaaaaaa', filter: 'all' }])
    const t = w.text()
    expect(t).toContain('Нарисуй кота')
    expect(t).toContain('Готово')
    expect(t).toContain('Генерация')
    expect(t).toMatch(/2,33\s₽/)
    expect(t).toContain('$0.0245')
    expect(w.find('.rf__pic img').attributes('src')).toBe('/api/images/img_gggggggggggggggggggg')
    expect(w.find('button.link').exists()).toBe(false)

    await w.find('.rf__pic').trigger('click')
    expect(w.find('.rf__lb').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await w.vm.$nextTick()
    expect(w.find('.rf__lb').exists()).toBe(false)
    w.unmount()
  })

  it('общая лента: логин открывает карточку, фильтр и «Показать ещё» передают параметры', async () => {
    pages = [{ items: [entry({ id: 50 })], next: 50 }, { items: [entry({ id: 40, prompt: null, answer: null, generated: [], status: 'error', errorCode: 'upstream', costUsd: 0, costRub: 0 })], next: null }, { items: [], next: null }]
    const w = mount(RequestFeed)
    await flushPromises()
    await w.find('button.link').trigger('click')
    expect(userCard.value).toBe('u_aaaaaaaaaaaaaaaaaaaa')

    await w.find('.rf__load').trigger('click')
    await flushPromises()
    expect(calls[1]).toEqual({ filter: 'all', before: 50 })
    expect(w.findAll('.rf__item')).toHaveLength(2)
    expect(w.text()).toContain('Модель не ответила')
    expect(w.text()).toContain('Текст недоступен')
    expect(w.find('.rf__load').exists()).toBe(false)

    const errors = w.findAll('.rf__chip').find((b) => b.text() === 'Ошибки')!
    await errors.trigger('click')
    await flushPromises()
    expect(calls[2]).toEqual({ filter: 'error' })
    expect(errors.attributes('aria-pressed')).toBe('true')
    expect(w.text()).toContain('Запросов нет')
  })

  it('длинный текст свёрнут, разворачивается по кнопке', async () => {
    const long = 'а'.repeat(900)
    pages = [{ items: [entry({ prompt: long, generated: [] })], next: null }]
    const w = mount(RequestFeed, { props: { userId: 'u_aaaaaaaaaaaaaaaaaaaa' } })
    await flushPromises()
    expect(w.find('.rf__text').text().length).toBeLessThan(700)
    await w.findAll('button').find((b) => b.text() === 'Показать полностью')!.trigger('click')
    expect(w.find('.rf__text').text()).toBe(long)
  })
})
