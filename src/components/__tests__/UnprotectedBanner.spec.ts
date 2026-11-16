import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import UnprotectedBanner from '../ui/UnprotectedBanner.vue'
import { useUserStore } from '@/stores/user'

const base = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: false, tgEnabled: true, subscription: null }
const view = (variant: 'compact' | 'block' | 'inline') => mount(UnprotectedBanner, { props: { variant }, global: { stubs: { TelegramLinkDialog: true } } })

describe('UnprotectedBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('видна без Telegram; скрыта с Telegram, у гостя и при выключенном боте', () => {
    const s = useUserStore()
    s.user = { ...base }
    expect(view('block').text()).toMatch(/Аккаунт не защищён/)
    s.user = { ...base, telegram: true }
    expect(view('block').find('.ub').exists()).toBe(false)
    s.user = { ...base, tgEnabled: false }
    expect(view('block').find('.ub').exists()).toBe(false)
    s.user = { ...base, isGuest: true }
    expect(view('block').find('.ub').exists()).toBe(false)
  })

  it('compact скрывается крестиком на сутки; block и inline не скрываются', async () => {
    const s = useUserStore()
    s.user = { ...base }
    const w = view('compact')
    await w.get('button[aria-label="Скрыть на сутки"]').trigger('click')
    expect(w.find('.ub').exists()).toBe(false)
    expect(view('compact').find('.ub').exists()).toBe(false)
    expect(view('block').find('button[aria-label="Скрыть на сутки"]').exists()).toBe(false)
    expect(view('inline').find('.ub').exists()).toBe(true)
  })

  it('«Подключить Telegram» открывает окно привязки', async () => {
    const s = useUserStore()
    s.user = { ...base }
    const w = view('inline')
    expect(w.findComponent({ name: 'TelegramLinkDialog' }).exists()).toBe(false)
    await w.get('.ub__go').trigger('click')
    expect(w.findComponent({ name: 'TelegramLinkDialog' }).exists()).toBe(true)
  })
})
