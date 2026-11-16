/**
 * Контакты сервиса для юридических документов и подвалов. Имена и регистрационные данные
 * владельца на сайте пока не публикуются — в документах он назван «администрацией сервиса».
 */
export interface Operator {
  email: string
  site: string
  /** Бот поддержки в Telegram (username без @): вопросы, оплата, возвраты. */
  supportBot: string
  /** Бот входа (username без @): привязка Telegram, 2FA, сброс пароля. Сам ни о чём не спрашивает. */
  authBot: string
}

export const OPERATOR: Operator = {
  email: 'support@mail.ru-chatgpt.com',
  site: 'https://ru-chatgpt.com',
  supportBot: 'ruchatgptaibot',
  authBot: 'ru_chat_gpt_auth_bot',
}

/** «@username» для текста. */
export const tgHandle = (bot: string): string => `@${bot}`

/** Ссылка на бота: только латиница, цифры и «_», иначе ошибка (защита от опечатки и подмены ссылки). */
export function tgLink(bot: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(bot)) throw new Error(`bad telegram username: ${bot}`)
  return `https://t.me/${bot}`
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
