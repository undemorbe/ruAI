import { describe, expect, it } from 'vitest'
import { faq } from '@/content/landing'
import { PRICES } from '@/content/plans'
import { MODELS } from '@/config/app'
import { router } from '@/router'
import { applyHead, escapeHtml, renderHead, verificationHtml } from '../head'
import { application, jsonLdFor, serializeJsonLd } from '../jsonld'
import { APP_PAGES, DISALLOW, PRERENDERED, PUBLIC_PAGES, fileFor, normalizePath, seoForPath } from '../pages'
import { SITEMAP_PAGES, indexNowPayload, robotsTxt, sitemapXml, webManifest } from '../files'
import { BODY_MARK, HEAD_MARK, prerenderAll, renderPage, renderPath } from '../prerender'
import { isStalePrerender } from '../path'
import { renderBody } from '../static'
import { INDEXNOW_KEY, SITE_HOST, SITE_URL, VERIFICATION } from '../site'
import { AUTH_TEXT } from '@/content/auth'
import { paymentPage } from '@/content/payment'
import authPage from '../../pages/AuthPage.vue?raw'
import nginxConf from '../../../deploy/nginx/ruai.conf?raw'
import indexHtml from '../../../index.html?raw'
import robotsFile from '../../../public/robots.txt?raw'
import sitemapFile from '../../../public/sitemap.xml?raw'
import manifestFile from '../../../public/manifest.webmanifest?raw'
import fav120 from '../../../public/favicon-120.png?inline'
import icon192 from '../../../public/icon-192.png?inline'
import touchIcon from '../../../public/apple-touch-icon.png?inline'
import ogPng from '../../../public/og.png?inline'
import favIco from '../../../public/favicon.ico?inline'

/** Байты файла из data: URL (импорт ?inline). */
const bytes = (dataUrl: string) => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return new DataView(Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer)
}
const SHELL = `<html lang="ru"><head>${HEAD_MARK}</head><body><div id="app">${BODY_MARK}</div></body></html>`
const ALL = [...PUBLIC_PAGES, ...Object.values(APP_PAGES)]
const LONG_DASH = '\u2014'

describe('реестр страниц', () => {
  it('у каждой страницы свои title (до 60 символов) и description (100-170)', () => {
    for (const p of ALL) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(60)
      expect(p.title.length, p.path).toBeGreaterThan(10)
    }
    for (const p of PUBLIC_PAGES) {
      expect(p.description.length, p.path).toBeGreaterThanOrEqual(100)
      expect(p.description.length, p.path).toBeLessThanOrEqual(170)
    }
    expect(new Set(ALL.map((p) => p.title)).size).toBe(ALL.length)
    expect(new Set(PUBLIC_PAGES.map((p) => p.description)).size).toBe(PUBLIC_PAGES.length)
  })

  it('в title, description, H1 и крошках нет длинного тире', () => {
    for (const p of ALL) {
      for (const s of [p.title, p.description, p.h1, ...p.crumbs.map((c) => c.name)]) expect(s, p.path).not.toContain(LONG_DASH)
    }
  })

  it('каждая публичная страница есть в роутере и не попадает на «не найдено»', () => {
    for (const p of PUBLIC_PAGES) expect(router.resolve(p.path).name, p.path).not.toBe('not-found')
  })

  it('тексты честные: без «бесплатно», без GPT-5.6 у текстового тарифа, без внутренних лимитов', () => {
    expect(MODELS.text.name).not.toMatch(/5\.6/)
    const text = PUBLIC_PAGES.map((p) => [p.title, p.description, renderBody(p)].join(' ')).join(' ')
    expect(text).not.toMatch(/бесплатн|безлимит/i)
    expect(text).not.toMatch(/токен|контекстн|в минуту|в день/i)
  })

  it('seoForPath: нормализует путь, служебные страницы - noindex', () => {
    expect(normalizePath('/pricing/?tier=media#x')).toBe('/pricing')
    expect(normalizePath('')).toBe('/')
    expect(seoForPath('/pricing/').path).toBe('/pricing')
    expect(seoForPath('/chat/abc').robots).toBe('noindex')
    expect(seoForPath('/checkout/week').robots).toBe('noindex')
    expect(seoForPath('/payment/result').robots).toBe('noindex')
    expect(seoForPath('/payment').robots).toBe('index')
    expect(seoForPath('/legal/nope')).toBe(APP_PAGES.notFound)
    expect(fileFor('/')).toBe('index.html')
    expect(fileFor('/legal/terms')).toBe('legal/terms/index.html')
  })
})

describe('head', () => {
  it('title, description, canonical, robots, OG и Twitter для страницы', () => {
    const html = renderHead(seoForPath('/pricing'))
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/pricing" data-seo />`)
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large" data-seo />')
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og.png" data-seo />`)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" data-seo />')
    expect(html).toMatch(/<title>Тарифы ChatGPT/)
    expect(renderHead(seoForPath('/chat'))).toContain('content="noindex, follow"')
    expect(renderHead(APP_PAGES.notFound)).not.toContain('rel="canonical"')
  })

  it('экранирует HTML в значениях', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
  })

  it('мета верификации выводятся только при заданных кодах', () => {
    expect(verificationHtml({ yandex: '', google: '' })).toBe('')
    const v = verificationHtml({ yandex: 'abc123', google: 'g"x' })
    expect(v).toContain('<meta name="yandex-verification" content="abc123" />')
    expect(v).toContain('<meta name="google-site-verification" content="g&quot;x" />')
  })

  it('applyHead заменяет теги при переходе, не дублируя их', () => {
    applyHead(document, seoForPath('/'))
    applyHead(document, seoForPath('/faq'))
    expect(document.title).toBe(seoForPath('/faq').title)
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_URL}/faq`)
    applyHead(document, seoForPath('/chat'))
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow')
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0)
  })
})

describe('JSON-LD', () => {
  it('валидный JSON, цены всех тарифов из PRICES в рублях', () => {
    const ld = JSON.parse(serializeJsonLd(jsonLdFor(seoForPath('/'))!))
    const types = ld['@graph'].map((n: { '@type': string }) => n['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage'])
    const offers = application().offers as { price: string; priceCurrency: string }[]
    const expected = Object.values(PRICES).flatMap((t) => Object.values(t))
    expect(offers.map((o) => Number(o.price))).toEqual(expected)
    expect(offers.every((o) => o.priceCurrency === 'RUB')).toBe(true)
  })

  it('FAQPage повторяет FAQ лендинга, крошки - на внутренних страницах', () => {
    const ld = jsonLdFor(seoForPath('/'))! as { '@graph': { '@type': string; mainEntity?: { name: string }[] }[] }
    expect(ld['@graph'].find((n) => n['@type'] === 'FAQPage')!.mainEntity!.map((q) => q.name)).toEqual(faq.map((f) => f.q))
    const crumbs = (jsonLdFor(seoForPath('/legal/terms'))! as { '@graph': { itemListElement: { item: string }[] }[] })['@graph'][0]!
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual([`${SITE_URL}/`, `${SITE_URL}/legal`, `${SITE_URL}/legal/terms`])
    expect(jsonLdFor(seoForPath('/chat'))).toBeNull()
  })

  it('без реквизитов владельца и рейтингов', () => {
    const all = PUBLIC_PAGES.map((p) => JSON.stringify(jsonLdFor(p))).join('')
    expect(all).not.toMatch(/ИНН|ОГРН|taxID|vatID|aggregateRating|"review"/i)
  })

  it('«<» экранирован: текст не может закрыть тег script', () => {
    expect(serializeJsonLd({ a: '</script><b>' })).toBe('{"a":"\\u003c/script>\\u003cb>"}')
  })
})

describe('пререндер', () => {
  it('в HTML страницы есть title, description, H1 и основной текст', () => {
    const html = renderPath(SHELL, '/')
    expect(html).toContain(`<title>${escapeHtml(seoForPath('/').title)}</title>`)
    expect(html).toContain('<h1>ChatGPT на русском без VPN</h1>')
    expect(html).toContain('application/ld+json')
    expect(html).toContain(escapeHtml(faq[0]!.q))
    expect(html).toContain(`${PRICES.text.week} ₽`)
    expect(html).toContain('href="/payment"')
    expect(html).not.toContain(HEAD_MARK)
  })

  it('пишет файл для каждой публичной страницы и пустую оболочку чата', () => {
    const files = prerenderAll(SHELL)
    expect(files.map((f) => f.file)).toEqual(PRERENDERED.map((p) => fileFor(p.path)))
    for (const p of PUBLIC_PAGES) expect(files.some((f) => f.file === fileFor(p.path))).toBe(true)
    const chat = files.find((f) => f.file === 'chat/index.html')!.html
    expect(chat).toContain('<div id="app"></div>')
    expect(chat).toContain('noindex')
  })

  it('служебные страницы - пустые оболочки с noindex, 404 - отдельный файл с текстом и noindex', () => {
    const files = new Map(prerenderAll(SHELL).map((f) => [f.file, f.html]))
    for (const file of ['checkout/index.html', 'payment/result/index.html', 'account/index.html', 'reset/index.html']) {
      const html = files.get(file)
      expect(html, file).toContain('<div id="app"></div>')
      expect(html, file).toContain('noindex, follow')
      expect(html, file).not.toContain('rel="canonical"')
    }
    expect(fileFor('/404')).toBe('404.html')
    const nf = files.get('404.html')!
    expect(nf).toContain('<h1>Страница не найдена</h1>')
    expect(nf).toContain('noindex, follow')
    expect(nf).not.toContain('rel="canonical"')
    expect(nf).not.toContain('application/ld+json')
    expect(nf).toContain('href="/"')
  })

  it('каждый адрес роутера отдаётся nginx: файл пререндера или своя location', () => {
    const files = new Set(prerenderAll(SHELL).map((f) => f.file))
    for (const r of router.getRoutes()) {
      if (r.name === 'not-found') continue
      if (r.path === '/legal/:doc?') {
        for (const p of PUBLIC_PAGES.filter((x) => x.kind.startsWith('legal'))) expect(files.has(fileFor(p.path)), p.path).toBe(true)
      } else if (r.path === '/chat/:id?') {
        expect(nginxConf).toContain('location ^~ /chat/ { try_files $uri /chat/index.html; }')
        expect(files.has('chat/index.html')).toBe(true)
      } else if (r.path === '/checkout/:plan') {
        expect(nginxConf).toContain('location ^~ /checkout/ { try_files /checkout/index.html =404; }')
        expect(files.has('checkout/index.html')).toBe(true)
      } else {
        expect(r.path, 'новый параметр в маршруте: добавьте location в deploy/nginx/ruai.conf').not.toContain(':')
        expect(files.has(fileFor(r.path)), r.path).toBe(true)
      }
    }
  })

  it('тексты входа и оплаты: как на странице, вход по логину и паролю, без кодов из письма', () => {
    expect(authPage).toContain('AUTH_TEXT.login')
    expect(authPage).toContain('AUTH_TEXT.register')
    expect(renderBody(seoForPath('/login'))).toContain(escapeHtml(AUTH_TEXT.login))
    expect(renderBody(seoForPath('/register'))).toContain(escapeHtml(AUTH_TEXT.register))
    const text = [renderBody(seoForPath('/login')), renderBody(seoForPath('/register')), JSON.stringify(paymentPage)].join(' ')
    expect(text).not.toMatch(/код[а-я]* из письма|пароль не нужен|на почту код/i)
  })

  it('без меток в шаблоне - ошибка сборки, а не молча пустая страница', () => {
    expect(() => renderPage('<html></html>', seoForPath('/'))).toThrow(/seo-head/)
  })

  it('«$» в тексте не ломает замену', () => {
    const page = { ...seoForPath('/faq'), title: 'Цена $& и $1 | ChatGPT' }
    expect(renderPage(SHELL, page)).toContain('<title>Цена $&amp; и $1 | ChatGPT</title>')
  })

  it('чужой пререндер убирается до монтирования', () => {
    expect(isStalePrerender('/', '/chat/123')).toBe(true)
    expect(isStalePrerender('/pricing', '/pricing/')).toBe(false)
    expect(isStalePrerender(null, '/x')).toBe(false)
  })
})

describe('robots.txt, sitemap.xml, manifest, иконки', () => {
  it('файлы в public совпадают с генераторами', () => {
    expect(robotsFile).toBe(robotsTxt())
    expect(sitemapFile).toBe(sitemapXml())
    expect(manifestFile).toBe(webManifest())
  })

  it('sitemap: ровно индексируемые публичные страницы', () => {
    const locs = [...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    const expected = PUBLIC_PAGES.filter((p) => p.robots === 'index').map((p) => SITE_URL + (p.path === '/' ? '/' : p.path))
    expect(locs).toEqual(expected)
    expect(SITEMAP_PAGES.length).toBe(expected.length)
    for (const l of locs) for (const d of DISALLOW) expect(l!.slice(SITE_URL.length).startsWith(d), l).toBe(false)
  })

  it('robots: закрыты API и чат, есть sitemap и Clean-param, нет админки', () => {
    const r = robotsTxt()
    expect(r).toContain('Disallow: /api/')
    // /chat открыт: робот видит noindex оболочки; отдельные чаты закрыты
    expect(r).toContain('Disallow: /chat/\n')
    expect(r).not.toMatch(/^Disallow: \/chat$/m)
    expect(r).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
    expect(r).toMatch(/^Clean-param: utm_source&/m)
    expect(r).not.toMatch(/admin/i)
    expect(r).not.toMatch(/^Host:/m)
  })

  it('в публичных SEO-файлах нет служебных путей и секретов', () => {
    const files = [robotsFile, sitemapFile, manifestFile].join('\n')
    expect(files).not.toMatch(/admin|VITE_|token|secret|127\.0\.0\.1|195\.133/i)
  })

  it('иконки и OG-картинка нужных размеров', () => {
    const png = (src: string) => {
      const b = bytes(src)
      return [b.getUint32(16), b.getUint32(20)]
    }
    expect(png(fav120)).toEqual([120, 120])
    expect(png(icon192)).toEqual([192, 192])
    expect(png(touchIcon)).toEqual([180, 180])
    expect(png(ogPng)).toEqual([1200, 630])
    const ico = bytes(favIco)
    expect(ico.getUint16(2, true)).toBe(1)
    expect([...Array(ico.getUint16(4, true))].map((_, i) => ico.getUint8(6 + 16 * i))).toContain(32)
  })

  it('index.html: lang="ru", метки пререндера, иконки и манифест', () => {
    const html = indexHtml
    expect(html).toContain('<html lang="ru">')
    expect(html).toContain(HEAD_MARK)
    expect(html).toContain(`<div id="app">${BODY_MARK}</div>`)
    for (const href of ['/favicon.ico', '/favicon.svg', '/favicon-120.png', '/apple-touch-icon.png', '/manifest.webmanifest']) expect(html).toContain(`href="${href}"`)
    expect(html).toContain('name="theme-color"')
  })
})

describe('IndexNow', () => {
  it('файл ключа в public совпадает с ключом, адреса - ровно sitemap', () => {
    const keyFiles = import.meta.glob('../../../public/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(keyFiles[`../../../public/${INDEXNOW_KEY}.txt`]).toBe(INDEXNOW_KEY)
    const p = indexNowPayload()
    expect(p.host).toBe(SITE_HOST)
    expect(p.keyLocation).toBe(`${SITE_URL}/${INDEXNOW_KEY}.txt`)
    expect(p.urlList).toEqual([...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))
  })

  it('неверный ключ - ошибка, а не запрос', () => {
    expect(() => indexNowPayload('../etc/passwd')).toThrow(/IndexNow/)
    expect(() => indexNowPayload('')).toThrow(/IndexNow/)
  })
})

describe('nginx публичного сайта', () => {
  it('неизвестный адрес - 404 со страницей 404.html, без отдачи главной', () => {
    expect(nginxConf).toContain('error_page 404 /404.html;')
    expect(nginxConf).toContain('location = /404.html { internal; }')
    expect(nginxConf).toContain('try_files $uri $uri/index.html =404;')
    expect(nginxConf).not.toMatch(/try_files[^;]*\s\/index\.html;/)
  })

  it('адрес со слэшем на конце - 301 без слэша, только для простых путей', () => {
    const m = nginxConf.match(/rewrite (\S+) \$1 permanent;/)
    expect(m).not.toBeNull()
    const re = new RegExp(m![1]!)
    const target = (uri: string) => uri.match(re)?.[1] ?? null
    expect(target('/pricing/')).toBe('/pricing')
    expect(target('/legal/terms/')).toBe('/legal/terms')
    expect(target('/')).toBeNull()
    expect(target('/pricing')).toBeNull()
    expect(target('/a\r\nSet-Cookie:x/')).toBeNull()
    expect(target('/a b/')).toBeNull()
  })

  it('gzip сжимает статику, но не JSON API', () => {
    const types = nginxConf.match(/gzip_types ([^;]+);/)?.[1]?.split(/\s+/) ?? []
    expect(types).toEqual(expect.arrayContaining(['text/css', 'application/javascript', 'image/svg+xml']))
    expect(types).not.toContain('application/json')
    expect(nginxConf).toContain('gzip_vary on;')
  })
})

describe('подтверждение прав в Вебмастере и Search Console', () => {
  const htmlFiles = import.meta.glob('../../../public/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

  it('файл Яндекса с тем же кодом, что в мета-теге', () => {
    const file = htmlFiles[`../../../public/yandex_${VERIFICATION.yandex}.html`]
    expect(file).toContain(`Verification: ${VERIFICATION.yandex}`)
    expect(renderHead(seoForPath('/'))).toContain(`<meta name="yandex-verification" content="${VERIFICATION.yandex}" />`)
    // старых файлов с другим кодом нет: иначе непонятно, какой код настоящий
    expect(Object.keys(htmlFiles).filter((f) => /\/yandex_/.test(f))).toHaveLength(1)
  })

  it('файл Google в формате Search Console', () => {
    const google = Object.entries(htmlFiles).filter(([f]) => /\/google[0-9a-f]+\.html$/.test(f))
    expect(google).toHaveLength(1)
    const [path, body] = google[0]!
    expect(body).toBe(`google-site-verification: ${path.split('/').pop()}`)
  })

  it('контакты: везде бот поддержки ссылкой, email не публикуется', () => {
    const all = PUBLIC_PAGES.map((p) => renderBody(p)).join('\n')
    expect(all).not.toMatch(/support@|mailto:/)
    const terms = renderBody(seoForPath('/legal/terms'))
    expect(terms).toContain('<a href="https://t.me/ruchatgptaibot">@ruchatgptaibot</a>')
    expect(renderBody(seoForPath('/legal'))).toContain('href="https://t.me/ruchatgptaibot"')
    const org = JSON.stringify(jsonLdFor(seoForPath('/')))
    expect(org).not.toMatch(/"email"/)
    expect(org).toContain('https://t.me/ruchatgptaibot')
  })
})
