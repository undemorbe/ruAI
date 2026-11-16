import { DISALLOW, PUBLIC_PAGES } from './pages'
import { TRACKING_PARAMS } from './path'
import { INDEXNOW_KEY, SHORT_NAME, SITE_HOST, SITE_NAME, SITE_URL, THEME_COLOR, absUrl } from './site'

/**
 * Генераторы public/robots.txt, public/sitemap.xml и public/manifest.webmanifest.
 * Файлы лежат в public/ как статика; тест src/seo/__tests__ сверяет их с генераторами.
 * Перегенерировать: node scripts/seo-assets.mjs (или поправить файлы так, чтобы тест прошёл).
 */

export { TRACKING_PARAMS }

export function robotsTxt(): string {
  const disallow = DISALLOW.map((p) => `Disallow: ${p}`)
  return [
    'User-agent: *',
    ...disallow,
    'Allow: /',
    '',
    'User-agent: Yandex',
    ...disallow,
    'Allow: /',
    `Clean-param: ${TRACKING_PARAMS.join('&')}`,
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n')
}

export const SITEMAP_PAGES = PUBLIC_PAGES.filter((p) => p.robots === 'index' && p.priority !== undefined)

export function sitemapXml(): string {
  const urls = SITEMAP_PAGES.map((p) => `  <url>\n    <loc>${absUrl(p.path)}</loc>\n    <priority>${p.priority!.toFixed(1)}</priority>\n  </url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

/** Тело запроса IndexNow: адреса из sitemap и ключ, подтверждённый файлом /<ключ>.txt. */
export function indexNowPayload(key = INDEXNOW_KEY) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error('IndexNow: ключ - 32 шестнадцатеричных символа')
  return { host: SITE_HOST, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: SITEMAP_PAGES.map((p) => absUrl(p.path)) }
}

export function webManifest(): string {
  const manifest = {
    name: SITE_NAME,
    short_name: SHORT_NAME,
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/favicon-120.png', sizes: '120x120', type: 'image/png' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
  return JSON.stringify(manifest, null, 2) + '\n'
}
