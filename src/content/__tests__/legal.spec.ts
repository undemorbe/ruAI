import { describe, expect, it } from 'vitest'
import { router } from '@/router'
import { formatPrice } from '@/lib/format'
import { getPlans } from '../plans'
import { AI_PROVIDER, LEGAL_DOCS, LEGAL_ORDER, isLegalSlug, type Block } from '../legal/docs'
import { LEGAL_VERSION, OPERATOR, legalDate, operatorLine, tgHandle, tgLink } from '../legal/operator'

const text = (blocks: Block[]) =>
  blocks.map((b) => (typeof b === 'string' ? b : 'list' in b ? b.list.join('\n') : [...b.table.head, ...b.table.rows.flat()].join('\n'))).join('\n')
const whole = (slug: keyof typeof LEGAL_DOCS) => LEGAL_DOCS[slug].sections.map((s) => `${s.h}\n${text(s.body)}`).join('\n')

describe('legal documents', () => {
  it('every document is complete and versioned', () => {
    expect(LEGAL_ORDER).toEqual(Object.keys(LEGAL_DOCS))
    for (const slug of LEGAL_ORDER) {
      const d = LEGAL_DOCS[slug]
      expect(d.slug).toBe(slug)
      expect(d.version).toBe(LEGAL_VERSION)
      expect(d.sections.length).toBeGreaterThan(4)
      for (const s of d.sections) expect(s.body.length, `${slug}: ${s.h}`).toBeGreaterThan(0)
      // ни одной неподставленной переменной шаблона
      expect(whole(slug)).not.toMatch(/\$\{|undefined|NaN|\[object/)
    }
    expect(isLegalSlug('privacy')).toBe(true)
    expect(isLegalSlug('constructor')).toBe(false)
  })

  it('offer lists every plan with the same prices and quotas as the storefront', () => {
    const terms = whole('terms')
    for (const tier of ['text', 'media'] as const)
      for (const p of getPlans(tier)) {
        expect(terms).toContain(`${formatPrice(p.price)} ₽`)
        expect(terms).toContain(p.requestsTotal.toLocaleString('ru-RU'))
      }
    expect(terms).toMatch(/автоматически/)
    expect(terms).toMatch(/ст\. 32/)
    expect(terms).toContain(OPERATOR.email)
  })

  it('privacy policy and consent name the cross-border transfer, retention and rights', () => {
    const privacy = whole('privacy')
    const consent = whole('consent')
    for (const t of [privacy, consent]) {
      expect(t).toContain(AI_PROVIDER)
      expect(t).toMatch(/трансграничн/)
      expect(t).toMatch(/30 дней/)
    }
    expect(privacy).toMatch(/10 рабочих дней/)
    expect(privacy).toMatch(/Роскомнадзор/)
    expect(privacy).toMatch(/территории Российской Федерации/)
    expect(consent).toMatch(/отозвать/i)
  })

  it('documents publish no personal names or registration numbers, only the contact email', () => {
    expect(operatorLine()).toBe('администрация сервиса ru-chatgpt.com')
    for (const slug of LEGAL_ORDER) {
      const t = whole(slug)
      expect(t).not.toMatch(/ИНН|ОГРН|предприниматель|\[[^\]]+\]/)
      expect(t).toContain(OPERATOR.email)
    }
    expect(legalDate('2026-11-15')).toBe('15 ноября 2026 г.')
  })

  it('routes exist for documents and auth screens', () => {
    for (const slug of LEGAL_ORDER) expect(router.resolve({ name: 'legal', params: { doc: slug } }).name).toBe('legal')
    expect(router.resolve('/legal').name).toBe('legal')
    expect(router.resolve('/login').meta.mode).toBe('login')
    expect(router.resolve('/register').meta.mode).toBe('register')
  })

  it('условия использования: доступ, контент, подписка и возврат по образцу рынка', () => {
    const terms = whole('terms')
    expect(LEGAL_DOCS.terms.title).toBe('Условия использования')
    expect(LEGAL_DOCS.terms.lead).toMatch(/публичная оферта/)
    for (const h of ['Регистрация и доступ', 'Использование Сервиса', 'Контент', 'Платные подписки', 'Прекращение и приостановка', 'Возврат денежных средств', 'Наши обязательства', 'Общие условия'])
      expect(LEGAL_DOCS.terms.sections.map((s) => s.h).join('\n')).toContain(h)
    expect(terms).toMatch(/не менее 14 лет/)
    expect(terms).toContain(`${OPERATOR.site}/pricing`)
    // возврат: фактические расходы, журналы, chargeback, срок
    expect(terms).toMatch(/фактически понесённых/)
    expect(terms).toMatch(/техническим журналам/)
    expect(terms).toMatch(/chargeback/)
    expect(terms).toMatch(/10 календарных дней/)
    expect(terms).toMatch(/Ошибочное или повторное списание возвращается полностью/)
    // повышение цены: уведомление за 30 дней
    expect(terms).toMatch(/не менее чем за 30 дней/)
    expect(terms).toMatch(/владеете Результатами/)
  })

  it('политика: банковские карты не хранятся, данные не продаются, ссылка на действующую редакцию', () => {
    const privacy = whole('privacy')
    expect(privacy).toMatch(/Реквизиты банковских карт Оператор не получает и не хранит/)
    expect(privacy).toMatch(/не продаёт/)
    expect(privacy).toContain(`${OPERATOR.site}/legal/privacy`)
    expect(router.resolve('/legal/privacy').name).toBe('legal')
    expect(router.resolve('/pricing').name).toBe('pricing')
  })

  it('в новых текстах условий и политики нет длинного тире', () => {
    for (const slug of ['terms', 'privacy'] as const) {
      const d = LEGAL_DOCS[slug]
      expect(`${d.title}\n${d.lead}\n${whole(slug)}`, slug).not.toContain('—')
    }
  })

  it('боты: поддержка и вход с 2FA названы в документах, ссылки собираются безопасно', () => {
    expect(OPERATOR.email).toBe('support@mail.ru-chatgpt.com')
    expect(OPERATOR.supportBot).toBe('ruchatgptaibot')
    expect(OPERATOR.authBot).toBe('ru_chat_gpt_auth_bot')
    expect(tgHandle(OPERATOR.authBot)).toBe('@ru_chat_gpt_auth_bot')
    expect(tgLink(OPERATOR.supportBot)).toBe('https://t.me/ruchatgptaibot')
    for (const bad of ['', 'ab', 'bot/../x', 'x?start=1', 'evil.com', 'бот_поддержки', '1startsdigit']) expect(() => tgLink(bad), bad).toThrow()

    const terms = whole('terms')
    const privacy = whole('privacy')
    const consent = whole('consent')
    for (const t of [terms, privacy, consent]) {
      expect(t).toContain('@ruchatgptaibot')
      expect(t).toContain('@ru_chat_gpt_auth_bot')
    }
    // бот входа: второй фактор, не принимает обращения, пароль и коды не спрашиваем
    expect(terms).toMatch(/@ru_chat_gpt_auth_bot: через него вход подтверждается вторым фактором/)
    expect(terms).toMatch(/не принимает обращения/)
    expect(terms).toMatch(/никогда не просим пароль, коды подтверждения и данные карты/)
    // отмена автопродления, возврат и претензии принимаются и в боте поддержки
    expect(terms.match(/или в бот поддержки @ruchatgptaibot/g)?.length).toBeGreaterThanOrEqual(3)
    // FreeKassa без автосписаний: условия не обещают автопродление
    expect(terms).toMatch(/Автопродления нет/)
    expect(terms).not.toMatch(/Отмена автопродления/)
    expect(privacy).toMatch(/переписка, если вы пишете в бот поддержки @ruchatgptaibot/)
  })

  it('документы описывают вход по логину и Telegram, без кодов из письма', () => {
    const all = LEGAL_ORDER.map(whole).join('\n')
    expect(all).toMatch(/логин/i)
    expect(all).toMatch(/Telegram/)
    expect(all).not.toMatch(/одноразовому коду|сервису отправки писем|с адреса, указанного в аккаунте/i)
    expect(LEGAL_VERSION).toBe('2026-11-16')
  })
})
