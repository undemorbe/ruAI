import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountPage from '../AccountPage.vue'
import { useUserStore } from '@/stores/user'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))

const base = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: true, tgEnabled: true, subscription: null }
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString()

async function view() {
  const s = useUserStore()
  s.ready = true // профиль уже загружен: ensure() не ходит в API
  const w = mount(AccountPage, { global: { stubs: { RouterLink: RouterLinkStub, AppHeader: true, UnprotectedBanner: true } } })
  await flushPromises()
  return w
}

/** Содержимое dd сразу после dt «Подписка». */
const subCell = (w: Awaited<ReturnType<typeof view>>) => {
  const dt = w.findAll('dt').find((d) => d.text() === 'Подписка')!
  return dt.element.nextElementSibling as HTMLElement
}

describe('AccountPage: блок «Подписка»', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    replace.mockClear()
  })

  it('с подпиской: срок и под ним «Написать в поддержку» на бота поддержки', async () => {
    useUserStore().user = { ...base, subscription: { tier: 'text', expiresAt: inDays(5) } } as never
    const cell = subCell(await view())
    const help = cell.querySelector('a.kv__help') as HTMLAnchorElement
    expect(cell.firstElementChild!.textContent).toMatch(/, до /)
    expect(cell.lastElementChild).toBe(help)
    expect(help.textContent).toBe('Написать в поддержку')
    expect(help.getAttribute('href')).toBe('https://t.me/ruchatgptaibot')
    expect(help.getAttribute('target')).toBe('_blank')
    expect(help.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('без подписки: «Выбрать тариф» и поддержка тоже на месте', async () => {
    useUserStore().user = { ...base }
    const cell = subCell(await view())
    expect(cell.textContent).toMatch(/Нет активной\. Выбрать тариф/)
    expect(cell.querySelector('a.kv__help')).not.toBeNull()
  })

  it('истёкшая подписка считается отсутствующей', async () => {
    useUserStore().user = { ...base, subscription: { tier: 'text', expiresAt: inDays(-1) } } as never
    expect(subCell(await view()).textContent).toMatch(/Нет активной/)
  })
})
