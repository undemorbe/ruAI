import { jsonLdFor, serializeJsonLd } from './jsonld'
import type { SeoPage } from './pages'
import { LOCALE, OG_IMAGE, SITE_NAME, VERIFICATION, absUrl } from './site'

/** Тег <head>: name/property + content, либо link rel=canonical, либо JSON-LD. Все помечены data-seo. */
export type HeadTag =
  | { tag: 'meta'; key: 'name' | 'property'; id: string; content: string }
  | { tag: 'link'; rel: 'canonical'; href: string }
  | { tag: 'jsonld'; json: string }

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function headTags(page: SeoPage): HeadTag[] {
  const url = absUrl(page.path)
  const image = absUrl(OG_IMAGE.path)
  // canonical и og:url - только у индексируемых: у служебных (noindex) адрес канонизировать незачем
  const known = page.robots === 'index'
  const meta = (key: 'name' | 'property', id: string, content: string): HeadTag => ({ tag: 'meta', key, id, content })
  const tags: HeadTag[] = [
    meta('name', 'description', page.description),
    meta('name', 'robots', page.robots === 'index' ? 'index, follow, max-image-preview:large' : 'noindex, follow'),
  ]
  if (known) tags.push({ tag: 'link', rel: 'canonical', href: url })
  tags.push(
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:locale', LOCALE),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', page.description),
  )
  if (known) tags.push(meta('property', 'og:url', url))
  tags.push(
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', String(OG_IMAGE.width)),
    meta('property', 'og:image:height', String(OG_IMAGE.height)),
    meta('property', 'og:image:alt', OG_IMAGE.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.title),
    meta('name', 'twitter:description', page.description),
    meta('name', 'twitter:image', image),
  )
  const ld = jsonLdFor(page)
  if (ld) tags.push({ tag: 'jsonld', json: serializeJsonLd(ld) })
  return tags
}

/** Мета-теги подтверждения прав: только непустые, без data-seo (не меняются при навигации). */
export function verificationHtml(v: { yandex: string; google: string } = VERIFICATION): string {
  const out: string[] = []
  if (v.yandex) out.push(`<meta name="yandex-verification" content="${escapeHtml(v.yandex)}" />`)
  if (v.google) out.push(`<meta name="google-site-verification" content="${escapeHtml(v.google)}" />`)
  return out.join('\n    ')
}

/** HTML для <head> при сборке: title, мета, canonical, OG, JSON-LD. */
export function renderHead(page: SeoPage): string {
  const lines = [`<title>${escapeHtml(page.title)}</title>`]
  for (const t of headTags(page)) {
    if (t.tag === 'meta') lines.push(`<meta ${t.key}="${t.id}" content="${escapeHtml(t.content)}" data-seo />`)
    else if (t.tag === 'link') lines.push(`<link rel="canonical" href="${escapeHtml(t.href)}" data-seo />`)
    else lines.push(`<script type="application/ld+json" data-seo>${t.json}</script>`)
  }
  const ver = verificationHtml()
  if (ver) lines.push(ver)
  return lines.join('\n    ')
}

/** То же в браузере при переходах внутри SPA: старые теги data-seo заменяются новыми. */
export function applyHead(doc: Document, page: SeoPage): void {
  doc.title = page.title
  doc.head.querySelectorAll('[data-seo]').forEach((el) => el.remove())
  for (const t of headTags(page)) {
    let el: HTMLElement
    if (t.tag === 'meta') {
      el = doc.createElement('meta')
      el.setAttribute(t.key, t.id)
      el.setAttribute('content', t.content)
    } else if (t.tag === 'link') {
      el = doc.createElement('link')
      el.setAttribute('rel', 'canonical')
      el.setAttribute('href', t.href)
    } else {
      el = doc.createElement('script')
      el.setAttribute('type', 'application/ld+json')
      el.textContent = t.json
    }
    el.setAttribute('data-seo', '')
    doc.head.appendChild(el)
  }
}
