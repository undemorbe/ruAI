/**
 * Контакты сервиса для юридических документов и подвалов. Имена и регистрационные данные
 * владельца на сайте пока не публикуются — в документах он назван «администрацией сервиса».
 */
export interface Operator {
  email: string
  site: string
}

export const OPERATOR: Operator = {
  email: 'support@ru-chatgpt.com',
  site: 'https://ru-chatgpt.com',
}

/**
 * Версия всех документов (дата редакции). Её записывает сервер вместе с фактом согласия;
 * при любом изменении текста документов — новая дата.
 */
export const LEGAL_VERSION = '2026-11-16'

/** Как исполнитель назван в тексте документов. */
export function operatorLine(o: Operator = OPERATOR): string {
  return `администрация сервиса ${o.site.replace(/^https?:\/\//, '')}`
}

/** Дата редакции по-русски: «15 ноября 2026 г.» */
export function legalDate(version: string = LEGAL_VERSION): string {
  const d = new Date(`${version}T00:00:00Z`)
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
}
