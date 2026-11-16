import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { LEGAL_DOCS } from '@/content/legal/docs'
import CookieBanner from '@/components/ui/CookieBanner.vue'
import { consent, initAnalytics, resetAnalyticsForTest, resetConsent, setConsent } from '../analytics'
import { CONSENT_KEY, METRIKA_ID, METRIKA_SRC, cleanReferrer, cleanUrl, loadMetrika, metrikaAllowed, readConsent, saveConsent } from '../metrika'

const pages = import.meta.glob('../../pages/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const tgDialog = Object.values(import.meta.glob('../../components/ui/TelegramLinkDialog.vue', { query: '?raw', import: 'default', eager: true }))[0] as string

const PROD = 'https://ru-chatgpt.com'

/** Окно-заглушка: свой document, адрес и хранилище, без настоящей загрузки скрипта. */
function fakeWin(href: string, store: Record<string, string> = {}) {
  const doc = document.implementation.createHTMLDocument('t')
  Object.defineProperty(doc, 'referrer', { value: 'https://yandex.ru/search/?text=chatgpt' })
  const url = new URL(href)
  const win = {
    document: doc,
    location: { href, origin: url.origin, hostname: url.hostname, reload: vi.fn() },
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    },
  } as unknown as Window & { ym?: ((...args: unknown[]) => void) & { a?: unknown[][] } }
  return { win, doc, store }
}

function testRouter(): Router {
  const C = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: C },
      { path: '/pricing', component: C },
      { path: '/chat/:id?', component: C },
    ],
  })
}

describe('адреса для Метрики', () => {
  it('без хэша (токен сброса пароля), без id чата, только рекламные метки', () => {
    expect(cleanUrl(`${PROD}/reset#abcdef0123456789`)).toBe(`${PROD}/reset`)
    expect(cleanUrl(`${PROD}/chat/8f3a1c?x=1`)).toBe(`${PROD}/chat`)
    expect(cleanUrl(`${PROD}/pricing?utm_source=ya&utm_campaign=x&yclid=5&session=secret&tier=media`)).toBe(
      `${PROD}/pricing?utm_source=ya&utm_campaign=x&yclid=5`,
    )
    expect(cleanUrl(`${PROD}/payment/result?orderId=123&paymentId=abc`)).toBe(`${PROD}/payment/result`)
    expect(cleanUrl('не адрес')).toBe('')
  })

  it('свой реферер чистится, чужой передаётся как есть', () => {
    expect(cleanReferrer(`${PROD}/chat/123`, PROD)).toBe(`${PROD}/chat`)
    expect(cleanReferrer('https://yandex.ru/search/?text=chatgpt', PROD)).toBe('https://yandex.ru/search/?text=chatgpt')
    expect(cleanReferrer('', PROD)).toBe('')
  })

  it('только прод-сборка на боевом домене', () => {
    expect(metrikaAllowed('ru-chatgpt.com', true)).toBe(true)
    expect(metrikaAllowed('ru-chatgpt.com', false)).toBe(false)
    expect(metrikaAllowed('localhost', true)).toBe(false)
    expect(metrikaAllowed('www.ru-chatgpt.com', true)).toBe(false)
  })
})

describe('согласие', () => {
  it('читается и сохраняется, мусор и сбой хранилища - «не выбрано»', () => {
    const store: Record<string, string> = {}
    const s = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) }
    expect(readConsent(s)).toBeNull()
    saveConsent(s, 'granted')
    expect(store[CONSENT_KEY]).toBe('granted')
    expect(readConsent(s)).toBe('granted')
    store[CONSENT_KEY] = 'yes'
    expect(readConsent(s)).toBeNull()
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readConsent(broken)).toBeNull()
    expect(() => saveConsent(broken, 'denied')).not.toThrow()
  })
})

describe('загрузка счётчика', () => {
  it('один скрипт и init с параметрами из кабинета, очищенными url и referrer', () => {
    const { win, doc } = fakeWin(`${PROD}/chat/42#frag`)
    expect(loadMetrika(win, doc)).toBe(true)
    expect(loadMetrika(win, doc)).toBe(false)
    const scripts = doc.querySelectorAll(`script[src="${METRIKA_SRC}"]`)
    expect(scripts).toHaveLength(1)
    expect((scripts[0] as HTMLScriptElement).async).toBe(true)
    const [id, cmd, opts] = win.ym!.a![0]! as [number, string, Record<string, unknown>]
    expect([id, cmd]).toEqual([METRIKA_ID, 'init'])
    expect(opts).toMatchObject({ webvisor: true, clickmap: true, trackLinks: true, accurateTrackBounce: true, ecommerce: 'dataLayer' })
    expect(opts.url).toBe(`${PROD}/chat`)
    expect(opts.referrer).toBe('https://yandex.ru/search/?text=chatgpt')
  })
})

describe('запуск по согласию', () => {
  beforeEach(() => resetAnalyticsForTest())
  afterEach(() => resetAnalyticsForTest())

  it('без согласия скрипт не грузится', async () => {
    const { win, doc } = fakeWin(`${PROD}/`)
    const r = testRouter()
    await r.push('/')
    initAnalytics(r, { win, prod: true })
    expect(consent.value).toBeNull()
    expect(doc.querySelector('script')).toBeNull()
    setConsent('denied')
    expect(doc.querySelector('script')).toBeNull()
  })

  it('«Принять»: счётчик и просмотры при переходах внутри SPA, без лишних при смене хэша', async () => {
    const { win, doc, store } = fakeWin(`${PROD}/`)
    const r = testRouter()
    await r.push('/')
    initAnalytics(r, { win, prod: true })
    setConsent('granted')
    expect(store[CONSENT_KEY]).toBe('granted')
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    await r.push('/pricing?utm_source=ya&token=x')
    await r.push('/pricing?utm_source=ya#faq')
    await r.push('/chat/abc')
    const hits = win.ym!.a!.filter((c) => c[1] === 'hit')
    expect(hits).toEqual([
      [METRIKA_ID, 'hit', `${PROD}/pricing?utm_source=ya`, { referer: `${PROD}/` }],
      [METRIKA_ID, 'hit', `${PROD}/chat`, { referer: `${PROD}/pricing?utm_source=ya` }],
    ])
  })

  it('сохранённое согласие действует при следующем заходе, но не вне боевого домена', async () => {
    const r = testRouter()
    await r.push('/')
    const prod = fakeWin(`${PROD}/`, { [CONSENT_KEY]: 'granted' })
    initAnalytics(r, { win: prod.win, prod: true })
    expect(prod.doc.querySelectorAll('script')).toHaveLength(1)

    resetAnalyticsForTest()
    const local = fakeWin('http://localhost:5173/', { [CONSENT_KEY]: 'granted' })
    initAnalytics(r, { win: local.win, prod: true })
    expect(consent.value).toBe('granted')
    expect(local.doc.querySelector('script')).toBeNull()
  })

  it('отзыв после запуска: выбор стирается, отказ перезагружает страницу', async () => {
    const r = testRouter()
    await r.push('/')
    const { win, store } = fakeWin(`${PROD}/`, { [CONSENT_KEY]: 'granted' })
    initAnalytics(r, { win, prod: true })
    resetConsent()
    expect(consent.value).toBeNull()
    expect(store[CONSENT_KEY]).toBeUndefined()
    setConsent('denied')
    expect(store[CONSENT_KEY]).toBe('denied')
    expect(win.location.reload).toHaveBeenCalledOnce()
  })
})

describe('плашка cookies', () => {
  beforeEach(() => resetAnalyticsForTest())

  it('видна до выбора, кнопки сохраняют выбор и прячут её', async () => {
    const r = testRouter()
    await r.push('/')
    initAnalytics(r, { win: fakeWin(`${PROD}/`).win, prod: true })
    const w = mount(CookieBanner, { global: { plugins: [r] } })
    expect(w.text()).toContain('Яндекс Метрику')
    expect(w.find('a').attributes('href')).toBe('/legal/privacy')
    const [decline, accept] = w.findAll('button')
    expect(decline!.text()).toBe('Отказаться')
    expect(accept!.text()).toBe('Принять')
    await decline!.trigger('click')
    expect(consent.value).toBe('denied')
    expect(w.find('aside').exists()).toBe(false)
  })
})

describe('приватность', () => {
  it('Вебвизор не записывает чат, вход, аккаунт, оплату, сброс пароля и привязку Telegram', () => {
    for (const name of ['ChatPage', 'AuthPage', 'AccountPage', 'CheckoutPage', 'ResetPage', 'PaymentResultPage']) {
      const src = pages[`../../pages/${name}.vue`]!
      const root = src.slice(src.indexOf('<template>') + 10).match(/<\w+[^>]*>/)![0]
      expect(root, name).toContain('ym-hide-content')
      expect(root, name).toContain('ym-disable-keys')
    }
    expect(tgDialog).toMatch(/<div class="tl ym-hide-content ym-disable-keys"/)
  })

  it('Политика описывает Метрику, согласие и отзыв, без старого «трекеров нет»', () => {
    const text = JSON.stringify(LEGAL_DOCS.privacy)
    expect(text).toContain('Яндекс Метрика')
    expect(text).toContain('ООО «ЯНДЕКС»')
    expect(text).toContain('Изменить выбор')
    expect(text).not.toContain('аналитических трекеров нет')
    expect(text).not.toContain('—')
  })
})
