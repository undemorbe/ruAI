import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Message } from '@/api'
import MessageItem from '../MessageItem.vue'

const message = (role: Message['role'], content: string): Message => ({
  id: 'm_abcdefghijklmnopqrst',
  chatId: 'c_abcdefghijklmnopqrst',
  role,
  content,
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'done',
})

describe('MessageItem', () => {
  it('renders assistant Markdown as formatted content', () => {
    const wrapper = mount(MessageItem, {
      props: { message: message('assistant', '# Заголовок\n\n- пункт') },
      global: { stubs: { Icon: true, BrandMark: true } },
    })

    expect(wrapper.find('.msg__markdown h1').text()).toBe('Заголовок')
    expect(wrapper.find('.msg__markdown li').text()).toBe('пункт')
  })

  it('keeps user messages as plain text', () => {
    const wrapper = mount(MessageItem, {
      props: { message: message('user', '# Не заголовок') },
      global: { stubs: { Icon: true, BrandMark: true } },
    })

    expect(wrapper.find('.msg__markdown').exists()).toBe(false)
    expect(wrapper.find('.msg__text').text()).toBe('# Не заголовок')
  })

  it('shows an animated status while the assistant has not sent visible text', () => {
    const wrapper = mount(MessageItem, {
      props: { message: { ...message('assistant', ''), status: 'streaming' } },
      global: { stubs: { Icon: true, BrandMark: true } },
    })

    expect(wrapper.find('[role="status"]').text()).toBe('Размышляю...')
    expect(wrapper.findAll('.msg__wait-dots i')).toHaveLength(3)
  })
})
