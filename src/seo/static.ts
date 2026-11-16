import { FAQ_INTRO, MAIN_NAV, PRICING_INTRO, landingSeo } from '@/content/landing-seo'
import { AUTH_TEXT } from '@/content/auth'
import { askExamples, faq } from '@/content/landing'
import { LEGAL_DOCS, LEGAL_ORDER, type Block } from '@/content/legal/docs'
import { OPERATOR, legalDate, tgHandle, tgLink } from '@/content/legal/operator'
import { paymentPage } from '@/content/payment'
import { TIER_LABEL, getPlans } from '@/content/plans'
import type { PlanTier } from '@/api/types'
import { escapeHtml as e } from './head'
import type { SeoPage } from './pages'
import { DISCLAIMER, SHORT_NAME } from './site'

/**
 * Статическая HTML-разметка страницы для роботов и для первого кадра до загрузки JS.
 * Тексты те же, что во Vue-страницах (общие модули src/content). Vue при монтировании
 * заменяет содержимое #app, поэтому стили здесь минимальные.
 */


const a = (href: string, text: string) => `<a href="${e(href)}">${e(text)}</a>`
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`

function header(): string {
  const nav = [...MAIN_NAV.map((n) => a(n.to, n.label)), a('/chat', 'Открыть чат')].join(' ')
  return `<header><a href="/" class="seo-static__brand">${e(SHORT_NAME)}</a> <nav aria-label="Разделы">${nav}</nav></header>`
}

function crumbs(page: SeoPage): string {
  if (page.crumbs.length < 2) return ''
  const items = page.crumbs.map((c, i) => (i === page.crumbs.length - 1 ? `<span aria-current="page">${e(c.name)}</span>` : a(c.path, c.name)))
  return `<nav aria-label="Навигационная цепочка" class="seo-static__crumbs">${items.join(' › ')}</nav>`
}

function footer(): string {
  const links = [a('/chat', 'Чат'), ...MAIN_NAV.map((n) => a(n.to, n.label)), a('/legal', 'Документы'), a('/legal/privacy', 'Конфиденциальность'), a('/legal/terms', 'Условия использования')]
  return `<footer><nav aria-label="Подвал">${links.join(' · ')}</nav><p>Поддержка: ${e(OPERATOR.email)}, Telegram ${a(tgLink(OPERATOR.supportBot), tgHandle(OPERATOR.supportBot))}</p><p>${e(DISCLAIMER)}</p></footer>`
}

function plans(tier: PlanTier, level: 'h2' | 'h3'): string {
  const sub = level === 'h2' ? 'h3' : 'h4'
  const cards = getPlans(tier).map(
    (p) =>
      `<article><${sub}>${e(p.title)}: ${e(String(p.price))} ₽</${sub}><p>${e(p.tagline)}. ${e(String(p.requestsTotal))} запросов на период.</p>${ul(p.features.map((f) => e(f.text)))}</article>`,
  )
  return `<section><${level}>${e(TIER_LABEL[tier])}</${level}>${cards.join('')}</section>`
}

const faqList = () => `<dl>${faq.map((f) => `<dt>${e(f.q)}</dt><dd>${e(f.a)}</dd>`).join('')}</dl>`

function block(b: Block): string {
  if (typeof b === 'string') return `<p>${e(b)}</p>`
  if ('list' in b) return ul(b.list.map(e))
  const head = b.table.head.map((h) => `<th scope="col">${e(h)}</th>`).join('')
  const rows = b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
}

function main(page: SeoPage): string {
  const h1 = `<h1>${e(page.h1)}</h1>`
  switch (page.kind) {
    case 'landing':
      return [
        h1,
        `<p>${e(landingSeo.sub)}</p>`,
        `<p>${a('/chat', 'Открыть чат')}</p>`,
        `<section id="words"><h2>${e(landingSeo.hWhat)}</h2>${askExamples.map((x) => `<article><h3>${e(x.q)}</h3><p>${e(x.a)}</p></article>`).join('')}</section>`,
        `<section id="price"><h2>${e(landingSeo.hPrice)}</h2>${plans('text', 'h3')}${plans('media', 'h3')}<p>${a('/pricing', 'Все тарифы')} · ${a('/payment', 'Как оплатить российской картой')}</p></section>`,
        `<section id="faq"><h2>${e(landingSeo.hFaq)}</h2>${faqList()}</section>`,
      ].join('')
    case 'pricing':
      return [h1, `<p>${e(PRICING_INTRO)}</p>`, plans('text', 'h2'), plans('media', 'h2'), `<p>${a('/payment', 'Оплата в рублях: карты МИР, СБП и SberPay')}</p>`].join('')
    case 'payment':
      return [
        h1,
        `<p>${e(paymentPage.lead)}</p>`,
        `<section><h2>Способы оплаты</h2>${paymentPage.methods.map((m) => `<h3>${e(m.title)}</h3><p>${e(m.text)}</p>`).join('')}</section>`,
        `<section><h2>Как оформить подписку</h2><ol>${paymentPage.steps.map((s) => `<li><b>${e(s.title)}.</b> ${e(s.text)}</li>`).join('')}</ol></section>`,
        `<section><h2>Цены и отмена</h2>${paymentPage.notes.map((n) => `<h3>${e(n.title)}</h3><p>${e(n.text)}</p>`).join('')}</section>`,
        `<p>${a('/pricing', 'Выбрать тариф')}</p>`,
      ].join('')
    case 'faq':
      return [h1, `<p>${e(FAQ_INTRO)}</p>`, faqList(), `<p>${a('/pricing', 'Тарифы')} · ${a('/payment', 'Оплата в рублях')}</p>`].join('')
    case 'legal-index':
      return [
        h1,
        `<p>${e(DISCLAIMER)}</p>`,
        `<p>Email для обращений: ${e(OPERATOR.email)}</p>`,
        `<p>Поддержка в Telegram: ${a(tgLink(OPERATOR.supportBot), tgHandle(OPERATOR.supportBot))}</p>`,
        `<p>Вход и двухфакторная аутентификация: ${a(tgLink(OPERATOR.authBot), tgHandle(OPERATOR.authBot))}. Обращения не принимает, пароль и коды никогда не спрашивает.</p>`,
        ul(LEGAL_ORDER.map((s) => `${a(`/legal/${s}`, LEGAL_DOCS[s].title)}, редакция от ${e(legalDate(LEGAL_DOCS[s].version))}`)),
      ].join('')
    case 'legal-doc': {
      const d = LEGAL_DOCS[page.legal!]
      return [h1, `<p>Редакция от ${e(legalDate(d.version))}</p>`, `<p>${e(d.lead)}</p>`, ...d.sections.map((s) => `<section><h2>${e(s.h)}</h2>${s.body.map(block).join('')}</section>`)].join('')
    }
    case 'login':
      return [h1, `<p>${e(AUTH_TEXT.login)}</p>`, `<p>Нет аккаунта? ${a('/register', 'Регистрация')}</p>`].join('')
    case 'register':
      return [h1, `<p>${e(AUTH_TEXT.register)}</p>`, `<p>Уже есть аккаунт? ${a('/login', 'Вход')}</p>`].join('')
    case 'not-found':
      return [h1, `<p>Адрес устарел или набран с ошибкой.</p>`, `<p>${a('/', 'На главную')} · ${a('/pricing', 'Тарифы')} · ${a('/faq', 'Вопросы')}</p>`].join('')
    default:
      return h1
  }
}

/** Содержимое #app для пререндера; у страниц shell тело пустое. */
export function renderBody(page: SeoPage): string {
  if (page.prerender !== 'content') return ''
  const tone = page.kind === 'landing' ? ' seo-static--dark' : ''
  return `<div class="seo-static${tone}" data-prerendered="${e(page.path)}">${header()}${crumbs(page)}<main>${main(page)}</main>${footer()}</div>`
}

/** Стили первого кадра: читабельно до загрузки приложения, без влияния на Vue-страницы. */
export const STATIC_CSS =
  '.seo-static{max-width:760px;margin:0 auto;padding:24px 16px 48px;font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}' +
  '.seo-static--dark{max-width:none;min-height:100vh;background:#0a0a0a;color:#f5f5f5}' +
  '.seo-static--dark>*{max-width:760px;margin-inline:auto}' +
  '.seo-static a{color:inherit}.seo-static header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-bottom:24px}' +
  '.seo-static nav a{margin-right:12px}.seo-static__brand{font-weight:700;font-size:20px;text-decoration:none}' +
  '.seo-static__crumbs{font-size:14px;opacity:.7}.seo-static table{border-collapse:collapse;display:block;overflow-x:auto}' +
  '.seo-static td,.seo-static th{border:1px solid currentColor;padding:4px 8px}.seo-static footer{margin-top:48px;font-size:14px;opacity:.75}'
