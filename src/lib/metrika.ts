import { TRACKING_PARAMS } from '@/seo/path'
import { SITE_HOST } from '@/seo/site'

/**
 * Яндекс Метрика. Грузится только после согласия посетителя (плашка CookieBanner, Политика п. 7)
 * и только на боевом домене. В Метрику уходят очищенные адреса: без хэша (там токен сброса пароля),
 * без id чатов и без параметров, кроме рекламных меток.
 */

export const METRIKA_ID = 114282306
export const METRIKA_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`
export const CONSENT_KEY = 'ruai.analytics'

export type Consent = 'granted' | 'denied'

type Ym = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
type MetrikaWindow = Window & { ym?: Ym; dataLayer?: unknown[] }

export function readConsent(storage: Pick<Storage, 'getItem'> | undefined): Consent | null {
  try {
    const v = storage?.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null // приватный режим или запрет хранилища: спросим ещё раз
  }
}

export function saveConsent(storage: Pick<Storage, 'setItem'> | undefined, consent: Consent): void {
  try {
    storage?.setItem(CONSENT_KEY, consent)
  } catch {
    // выбор действует до перезагрузки
  }
}

/** Метрика работает только в прод-сборке на боевом домене: локальные и демо-запуски статистику не портят. */
export const metrikaAllowed = (hostname: string, prod: boolean) => prod && hostname === SITE_HOST

/** Адрес для Метрики: без хэша, /chat/<id> как /chat, из параметров только рекламные метки. */
export function cleanUrl(href: string): string {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return ''
  }
  const path = u.pathname.startsWith('/chat/') ? '/chat' : u.pathname
  const kept = new URLSearchParams()
  for (const [k, v] of u.searchParams) if (TRACKING_PARAMS.includes(k) || k.startsWith('utm_')) kept.append(k, v)
  const q = kept.toString()
  return `${u.origin}${path}${q ? `?${q}` : ''}`
}

/** Реферер: свои адреса чистим так же, чужие (поисковик, соцсеть) передаём как есть. */
export function cleanReferrer(referrer: string, origin: string): string {
  return referrer.startsWith(origin + '/') || referrer === origin ? cleanUrl(referrer) : referrer
}

/** Код счётчика из Метрики (с параметрами init из кабинета), но с очищенными url и referrer. Повторный вызов ничего не делает. */
export function loadMetrika(win: MetrikaWindow, doc: Document): boolean {
  if (win.ym) return false
  const ym: Ym = (...args: unknown[]) => {
    ;(ym.a = ym.a || []).push(args)
  }
  ym.l = Date.now()
  win.ym = ym
  win.dataLayer = win.dataLayer || []
  const s = doc.createElement('script')
  s.async = true
  s.src = METRIKA_SRC
  doc.head.appendChild(s)
  ym(METRIKA_ID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: cleanReferrer(doc.referrer, win.location.origin),
    url: cleanUrl(win.location.href),
    accurateTrackBounce: true,
    trackLinks: true,
  })
  return true
}

/** Просмотр страницы при переходе внутри SPA (Метрика сама видит только первую загрузку). */
export function hit(win: MetrikaWindow, href: string, referer: string): void {
  win.ym?.(METRIKA_ID, 'hit', cleanUrl(href), { referer: cleanUrl(referer) })
}
