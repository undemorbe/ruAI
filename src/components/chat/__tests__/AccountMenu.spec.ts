import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountMenu from '../AccountMenu.vue'
import { useUserStore } from '@/stores/user'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))

const base = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: true, tgEnabled: true, subscription: null }
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString()
const paid = { planId: 'week', tier: 'text', startedAt: inDays(-1), expiresAt: inDays(5), autoRenew: false, usage: {} }

let w: ReturnType<typeof mount> | undefined
function view(isPaid = false) {
  w = mount(AccountMenu, { props: { userLabel: 'boris', isPaid }, attachTo: document.body, global: { stubs: { RouterLink: RouterLinkStub } } })
  return w
}
const btn = (v: ReturnType<typeof view>) => v.get('.am__btn')
const labels = (v: ReturnType<typeof view>) => v.findAll('[role="menuitem"]').map((e) => e.text())

describe('AccountMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
  })
  afterEach(() => w?.unmount())

  it('строка пользователя: одна кнопка с аватаром, именем и статусом; меню закрыто', () => {
    useUserStore().user = { ...base }
    const v = view()
    const b = btn(v)
    expect(b.element.tagName).toBe('BUTTON')
    expect(b.text()).toContain('BO')
    expect(b.text()).toContain('boris')
    expect(b.text()).toContain('Без подписки')
    expect(b.attributes('aria-haspopup')).toBe('menu')
    expect(b.attributes('aria-expanded')).toBe('false')
    expect(v.find('[role="menu"]').exists()).toBe(false)
  })

  it('с подпиской во второй строке срок', () => {
    useUserStore().user = { ...base, subscription: paid } as never
    expect(btn(view(true)).text()).toMatch(/Подписка до \d+ \S+/)
  })

  it('нажатие открывает меню над кнопкой: профиль, тариф, аккаунт, помощь, поддержка, выход', async () => {
    useUserStore().user = { ...base }
    const v = view()
    await btn(v).trigger('click')
    expect(btn(v).attributes('aria-expanded')).toBe('true')
    expect(labels(v)[0]).toMatch(/^BOboris\s*Без подписки$/)
    expect(labels(v).slice(1)).toEqual(['Оформить подписку', 'Аккаунт', 'Вопросы и ответы', 'Написать в поддержку', 'Выйти'])
    // меню в DOM стоит перед кнопкой и позиционируется над ней
    expect(v.get('.am').element.firstElementChild!.getAttribute('role')).toBe('menu')
    const support = v.get('a[href="https://t.me/ruchatgptaibot"]')
    expect(support.attributes('rel')).toBe('noopener noreferrer')
    expect(support.attributes('target')).toBe('_blank')
    const to = v.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(to).toEqual([{ name: 'account' }, '/pricing', { name: 'account' }, '/faq'])
  })

  it('подписчику: «Продлить подписку»; без Telegram: «Защитить аккаунт»', async () => {
    useUserStore().user = { ...base, telegram: false, subscription: paid } as never
    const v = view(true)
    await btn(v).trigger('click')
    expect(labels(v)).toContain('Продлить подписку')
    expect(labels(v)).toContain('Защитить аккаунт')
    expect(v.find('.am__badge').exists()).toBe(true)
  })

  it('гостю: войти, тарифы, помощь, поддержка; без профиля и выхода', async () => {
    useUserStore().user = { ...base, isGuest: true }
    const v = view()
    expect(btn(v).text()).toContain('Войти или зарегистрироваться')
    await btn(v).trigger('click')
    expect(labels(v)).toEqual(['Войти или зарегистрироваться', 'Тарифы', 'Вопросы и ответы', 'Написать в поддержку'])
  })

  it('пункт закрывает меню и сообщает сайдбару (закрыть на телефоне)', async () => {
    useUserStore().user = { ...base }
    const v = view()
    await btn(v).trigger('click')
    await v.findAllComponents(RouterLinkStub)[2]!.trigger('click')
    expect(v.find('[role="menu"]').exists()).toBe(false)
    expect(v.emitted('navigate')).toHaveLength(1)
  })

  it('Esc закрывает меню, возвращает фокус на кнопку и не доходит до сайдбара', async () => {
    useUserStore().user = { ...base }
    const v = view()
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    await btn(v).trigger('click')
    await flushPromises()
    expect(document.activeElement?.textContent).toContain('boris')
    v.get('[role="menu"]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(v.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(btn(v).element)
    expect(outer).not.toHaveBeenCalled()
    document.removeEventListener('keydown', outer)
  })

  it('стрелки ходят по пунктам по кругу', async () => {
    useUserStore().user = { ...base }
    const v = view()
    await btn(v).trigger('click')
    await flushPromises()
    const menu = v.get('[role="menu"]')
    await menu.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toContain('Оформить подписку')
    await menu.trigger('keydown', { key: 'ArrowUp' })
    await menu.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement?.textContent).toContain('Выйти')
  })

  it('клик мимо закрывает меню', async () => {
    useUserStore().user = { ...base }
    const v = view()
    await btn(v).trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(v.find('[role="menu"]').exists()).toBe(false)
  })

  it('«Выйти» выходит из аккаунта и ведёт на главную', async () => {
    const s = useUserStore()
    s.user = { ...base }
    const out = vi.spyOn(s, 'logout').mockResolvedValue()
    const v = view()
    await btn(v).trigger('click')
    await v.findAll('[role="menuitem"]').at(-1)!.trigger('click')
    await flushPromises()
    expect(out).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/')
  })
})
