import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppHeader from '../ui/AppHeader.vue'
import PricingPage from '@/pages/PricingPage.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/pricing', path: '/pricing', query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const stubs = { RouterLink: RouterLinkStub }
const logo = (w: ReturnType<typeof mount>) => w.findAllComponents(RouterLinkStub).find((l) => l.classes().includes('hdr__logo'))!

describe('AppHeader: логотип', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('по умолчанию ведёт на главную', () => {
    const l = logo(mount(AppHeader, { global: { stubs } }))
    expect(l.props('to')).toBe('/')
    expect(l.attributes('aria-label')).toBe('ChatGPT: на главную')
  })

  it('logo="chat" ведёт в новый чат (/chat без id)', () => {
    const l = logo(mount(AppHeader, { props: { logo: 'chat' }, global: { stubs } }))
    expect(l.props('to')).toEqual({ name: 'chat' })
    expect(l.attributes('aria-label')).toBe('ChatGPT: новый чат')
  })

  it('на странице тарифов логотип ведёт в новый чат', () => {
    const w = mount(PricingPage, { global: { stubs: { ...stubs, AppHeader: false, Crumbs: true, TierToggle: true } } })
    expect(w.getComponent(AppHeader).props('logo')).toBe('chat')
  })

  it('внизу страницы тарифов: «Написать в поддержку» на бота поддержки', () => {
    const w = mount(PricingPage, { global: { stubs: { ...stubs, AppHeader: true, Crumbs: true, TierToggle: true } } })
    const help = w.get('main').element.lastElementChild as HTMLElement
    expect(help.classList.contains('pay-help')).toBe(true)
    const a = help.querySelector('a')!
    expect(a.textContent).toBe('Написать в поддержку')
    expect(a.getAttribute('href')).toBe('https://t.me/ruchatgptaibot')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
