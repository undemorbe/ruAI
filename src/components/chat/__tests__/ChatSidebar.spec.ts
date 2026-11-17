import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import ChatSidebar from '../ChatSidebar.vue'
import { useUserStore } from '@/stores/user'

const base = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: true, tgEnabled: true, subscription: null }
const view = (isPaid = false) =>
  mount(ChatSidebar, {
    props: { chats: [], activeId: null, open: false, userLabel: 'boris', isPaid },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

describe('ChatSidebar: логотип', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('логотип: кнопка «новый чат», не ссылка на главную', async () => {
    useUserStore().user = { ...base }
    const w = view()
    const brand = w.get('.side__brand')
    expect(brand.element.tagName).toBe('BUTTON')
    expect(brand.attributes('type')).toBe('button')
    expect(brand.attributes('aria-label')).toBe('ChatGPT: новый чат')
    expect(w.findAllComponents(RouterLinkStub).some((l) => l.props('to') === '/')).toBe(false)
    await brand.trigger('click')
    expect(w.emitted('select')).toEqual([[null]])
  })
})

describe('ChatSidebar: меню аккаунта', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('внизу сайдбара меню аккаунта; выбор пункта закрывает сайдбар', async () => {
    useUserStore().user = { ...base }
    const w = view()
    const menu = w.getComponent({ name: 'AccountMenu' })
    expect(menu.props()).toEqual({ userLabel: 'boris', isPaid: false })
    menu.vm.$emit('navigate')
    expect(w.emitted('close')).toHaveLength(1)
  })
})
