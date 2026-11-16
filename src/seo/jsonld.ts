import { faq } from '@/content/landing'
import { OPERATOR } from '@/content/legal/operator'
import { PLAN_TABLE, PRICES, TIER_LABEL } from '@/content/plans'
import type { PlanId, PlanTier } from '@/api/types'
import type { SeoPage } from './pages'
import { DISCLAIMER, LANG, LOGO_PATH, SITE_HOST, SITE_NAME, SITE_URL, absUrl } from './site'

/**
 * Микроразметка schema.org (JSON-LD) для страницы. Без реквизитов владельца,
 * без рейтингов и отзывов (отзывов от реальных клиентов пока нет).
 */

type Node = Record<string, unknown>

const ORG_ID = `${SITE_URL}/#organization`
const SITE_ID = `${SITE_URL}/#website`

export function organization(): Node {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_HOST,
    url: `${SITE_URL}/`,
    logo: { '@type': 'ImageObject', url: absUrl(LOGO_PATH), width: 512, height: 512 },
    email: OPERATOR.email,
    description: DISCLAIMER,
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: OPERATOR.email, availableLanguage: 'Russian' },
  }
}

export function website(): Node {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: SITE_NAME,
    alternateName: SITE_HOST,
    url: `${SITE_URL}/`,
    inLanguage: LANG,
    publisher: { '@id': ORG_ID },
  }
}

/** Сервис и все тарифы с ценами в рублях из PRICES. */
export function application(): Node {
  const offers = (Object.keys(PRICES) as PlanTier[]).flatMap((tier) =>
    (Object.keys(PRICES[tier]) as PlanId[]).map((id) => ({
      '@type': 'Offer',
      name: `${TIER_LABEL[tier]}: ${PLAN_TABLE[id].title}`,
      price: PRICES[tier][id].toFixed(2),
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
      url: absUrl(`/pricing`),
    })),
  )
  return {
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: LANG,
    url: `${SITE_URL}/`,
    description: 'Чат с нейросетью на русском языке в браузере: тексты, учёба, код, анализ фото и генерация изображений. Работает без VPN.',
    publisher: { '@id': ORG_ID },
    offers,
  }
}

export function faqPage(): Node {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
}

export function breadcrumbs(page: SeoPage): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: page.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absUrl(c.path) })),
  }
}

/** Граф JSON-LD для страницы; null - разметка не нужна (служебные страницы). */
export function jsonLdFor(page: SeoPage): Node | null {
  if (page.robots === 'noindex') return null
  const graph: Node[] = []
  if (page.kind === 'landing') graph.push(organization(), website(), application(), faqPage())
  if (page.kind === 'pricing') graph.push(application())
  if (page.crumbs.length > 1) graph.push(breadcrumbs(page))
  return graph.length ? { '@context': 'https://schema.org', '@graph': graph } : null
}

/** JSON для вставки в <script type="application/ld+json">: «<» экранируется, чтобы текст не закрыл тег. */
export const serializeJsonLd = (data: Node) => JSON.stringify(data).replace(/</g, '\\u003c')
