import { LEGAL_DOCS, LEGAL_ORDER, type LegalSlug } from '@/content/legal/docs'
import { paymentPage } from '@/content/payment'
import { PRICES } from '@/content/plans'
import { normalizePath } from './path'
import { SHORT_NAME } from './site'

/**
 * Реестр страниц для поисковиков: title, description, H1, robots, хлебные крошки и sitemap.
 * Отсюда берут данные пререндер (vite.config.ts), клиентский роутер, robots.txt и sitemap.xml.
 * Служебные адреса (API, админка) здесь не перечисляются.
 */

export type PageKind = 'landing' | 'pricing' | 'payment' | 'faq' | 'legal-index' | 'legal-doc' | 'login' | 'register' | 'app' | 'not-found'

export interface Crumb {
  name: string
  path: string
}

export interface SeoPage {
  /** Канонический путь без завершающего слэша (кроме главной). */
  path: string
  kind: PageKind
  title: string
  description: string
  h1: string
  /** index - страницу можно показывать в поиске; noindex - нельзя (ссылки с неё учитываются). */
  robots: 'index' | 'noindex'
  /** Цепочка крошек от главной до страницы включительно; у главной пусто. */
  crumbs: Crumb[]
  /** Приоритет в sitemap.xml; нет - страница в sitemap не попадает. */
  priority?: number
  /** Статический HTML: content - текст страницы для роботов, shell - только мета, тело пустое. */
  prerender?: 'content' | 'shell'
  legal?: LegalSlug
}

const HOME: Crumb = { name: 'Главная', path: '/' }
const minText = Math.min(...Object.values(PRICES.text))
const minMedia = Math.min(...Object.values(PRICES.media))

const LEGAL_SEO: Record<LegalSlug, { title: string; description: string }> = {
  terms: {
    title: `Условия использования | ${SHORT_NAME}`,
    description:
      'Условия использования сервиса ChatGPT на русском (публичная оферта): регистрация, правила, права на контент, оплата подписки, автопродление и возврат денег.',
  },
  privacy: {
    title: `Политика обработки персональных данных | ${SHORT_NAME}`,
    description:
      'Политика обработки персональных данных сервиса ChatGPT на русском по 152-ФЗ: какие данные собираются, зачем, кому передаются, как их удалить.',
  },
  consent: {
    title: `Согласие на обработку персональных данных | ${SHORT_NAME}`,
    description:
      'Согласие пользователя сервиса ChatGPT на русском на обработку персональных данных по ч. 4 ст. 9 152-ФЗ: состав данных, цели, сроки и порядок отзыва.',
  },
}

export const PUBLIC_PAGES: SeoPage[] = [
  {
    path: '/',
    kind: 'landing',
    title: 'ChatGPT на русском без VPN: полный доступ к чату онлайн',
    description:
      'ChatGPT на русском без VPN: тексты, учёба, код и анализ фото. Чат GPT онлайн в браузере и на телефоне, оплата российской картой МИР и через СБП.',
    h1: 'ChatGPT на русском без VPN',
    robots: 'index',
    crumbs: [],
    priority: 1,
    prerender: 'content',
  },
  {
    path: '/pricing',
    kind: 'pricing',
    title: `Тарифы ChatGPT от ${minText} ₽: 7, 30 и 90 дней, оплата в рублях`,
    description: `Тарифы ChatGPT на русском: текстовый от ${minText} ₽ и с изображениями от ${minMedia} ₽ за 7 дней. Подписка на 7, 30 или 90 дней, оплата картой МИР и через СБП.`,
    h1: 'Тарифы ChatGPT',
    robots: 'index',
    crumbs: [HOME, { name: 'Тарифы', path: '/pricing' }],
    priority: 0.9,
    prerender: 'content',
  },
  {
    path: '/payment',
    kind: 'payment',
    title: 'Оплата ChatGPT в рублях: карта МИР, СБП и SberPay',
    description:
      'Как оплатить ChatGPT российской картой: МИР, Visa и Mastercard банков РФ, СБП и SberPay. Без VPN и зарубежных карт, цены в рублях, отмена в один клик.',
    h1: paymentPage.h1,
    robots: 'index',
    crumbs: [HOME, { name: 'Оплата в рублях', path: '/payment' }],
    priority: 0.8,
    prerender: 'content',
  },
  {
    path: '/faq',
    kind: 'faq',
    title: 'Вопросы о ChatGPT на русском: VPN, оплата и тарифы',
    description:
      'Частые вопросы о ChatGPT на русском: нужен ли VPN, как оплатить российской картой, чем отличаются тарифы, что считается запросом и как отменить подписку.',
    h1: 'Частые вопросы о ChatGPT',
    robots: 'index',
    crumbs: [HOME, { name: 'Вопросы', path: '/faq' }],
    priority: 0.7,
    prerender: 'content',
  },
  {
    path: '/login',
    kind: 'login',
    title: 'Вход в ChatGPT на русском',
    description:
      'Вход в ChatGPT на русском по логину и паролю, с подтверждением в Telegram. История чатов и подписка сохраняются в аккаунте, VPN не нужен.',
    h1: 'Вход',
    robots: 'index',
    crumbs: [HOME, { name: 'Вход', path: '/login' }],
    priority: 0.4,
    prerender: 'content',
  },
  {
    path: '/register',
    kind: 'register',
    title: 'Регистрация в ChatGPT на русском',
    description:
      'Регистрация в ChatGPT на русском за минуту: логин и пароль, без номера телефона. Аккаунт сохраняет историю чатов и подписку, работает без VPN.',
    h1: 'Регистрация',
    robots: 'noindex',
    crumbs: [HOME, { name: 'Регистрация', path: '/register' }],
    prerender: 'content',
  },
  {
    path: '/legal',
    kind: 'legal-index',
    title: 'Документы сервиса ChatGPT на русском',
    description:
      'Документы сервиса ChatGPT на русском (ru-chatgpt.com): условия использования, политика обработки персональных данных, согласие на обработку данных и контакты.',
    h1: 'Документы',
    robots: 'index',
    crumbs: [HOME, { name: 'Документы', path: '/legal' }],
    priority: 0.3,
    prerender: 'content',
  },
  ...LEGAL_ORDER.map(
    (slug): SeoPage => ({
      path: `/legal/${slug}`,
      kind: 'legal-doc',
      legal: slug,
      ...LEGAL_SEO[slug],
      h1: LEGAL_DOCS[slug].title,
      robots: 'index',
      crumbs: [HOME, { name: 'Документы', path: '/legal' }, { name: LEGAL_DOCS[slug].title, path: `/legal/${slug}` }],
      priority: 0.3,
      prerender: 'content',
    }),
  ),
]

/** Страницы приложения: в поиск не попадают (noindex), в robots.txt закрыты. */
const APP = (path: string, title: string, prerender?: 'shell'): SeoPage => ({
  path,
  kind: 'app',
  title: `${title} | ${SHORT_NAME}`,
  description: PUBLIC_PAGES[0]!.description,
  h1: title,
  robots: 'noindex',
  crumbs: [],
  prerender,
})

// У каждой страницы приложения своя пустая оболочка с noindex: nginx отдаёт её на свои адреса,
// а на неизвестные - 404.html с кодом 404 (не копию главной).
export const APP_PAGES = {
  chat: APP('/chat', 'Чат', 'shell'),
  checkout: APP('/checkout', 'Оформление подписки', 'shell'),
  paymentResult: APP('/payment/result', 'Статус оплаты', 'shell'),
  account: APP('/account', 'Аккаунт', 'shell'),
  reset: APP('/reset', 'Смена пароля', 'shell'),
  notFound: { ...APP('/404', 'Страница не найдена'), kind: 'not-found', prerender: 'content' } satisfies SeoPage,
}

/**
 * Пути, закрытые в robots.txt (префиксы). /chat открыт: робот должен увидеть noindex оболочки,
 * иначе Google может показать в выдаче закрытый адрес без описания; отдельные чаты (/chat/…) закрыты.
 */
export const DISALLOW = ['/api/', '/chat/', '/checkout/', '/payment/result', '/account', '/reset']

export { normalizePath }

const BY_PATH = new Map(PUBLIC_PAGES.map((p) => [p.path, p]))

/** SEO-данные для адреса. Неизвестный адрес - «не найдено» с noindex. */
export function seoForPath(path: string): SeoPage {
  const p = normalizePath(path)
  const hit = BY_PATH.get(p)
  if (hit) return hit
  if (p === '/chat' || p.startsWith('/chat/')) return APP_PAGES.chat
  if (p.startsWith('/checkout/')) return APP_PAGES.checkout
  if (p === '/payment/result') return APP_PAGES.paymentResult
  if (p === '/account') return APP_PAGES.account
  if (p === '/reset') return APP_PAGES.reset
  return APP_PAGES.notFound
}

/** Все страницы, для которых при сборке пишется свой HTML-файл. */
export const PRERENDERED: SeoPage[] = [...PUBLIC_PAGES, ...Object.values(APP_PAGES)].filter((p) => p.prerender)

/** Файл в dist для страницы: / -> index.html, /404 -> 404.html (error_page nginx), /pricing -> pricing/index.html. */
export const fileFor = (path: string) => (path === '/' ? 'index.html' : path === '/404' ? '404.html' : `${path.slice(1)}/index.html`)
