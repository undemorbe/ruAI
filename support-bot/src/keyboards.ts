/**
 * Инлайн-кнопки и разбор callback_data. Данные кнопки клиент может подменить, поэтому:
 * - пользователя для действий сотрудника берём из темы, где нажата кнопка, а не из callback_data;
 * - callback_data разбираем по белому списку, всё остальное — null.
 */
import type { UserRecord } from './store.ts'
import { CATEGORIES, TEMPLATES } from './texts.ts'

export interface InlineButton {
  text: string
  callback_data: string
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][]
}

export type StaffAction = 'work' | 'done' | 'tpl' | 'info' | 'ban' | 'unban'
const STAFF_ACTIONS: readonly StaffAction[] = ['work', 'done', 'tpl', 'info', 'ban', 'unban']

export type Callback =
  | { kind: 'staff'; action: StaffAction }
  | { kind: 'template'; id: string }
  | { kind: 'category'; id: string }

export function parseCallback(data: string | undefined): Callback | null {
  const m = /^([asc]):([a-z]{1,16})$/.exec(data ?? '')
  if (!m) return null
  const [, kind, id = ''] = m
  if (kind === 'a') return STAFF_ACTIONS.includes(id as StaffAction) ? { kind: 'staff', action: id as StaffAction } : null
  if (kind === 's') return TEMPLATES.some((t) => t.id === id) ? { kind: 'template', id } : null
  return CATEGORIES.some((c) => c.id === id) ? { kind: 'category', id } : null
}

/** Кнопки под карточкой пользователя в теме. */
export function cardKeyboard(u: Pick<UserRecord, 'banned'>): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '🟡 В работе', callback_data: 'a:work' },
        { text: '✅ Решено, закрыть', callback_data: 'a:done' },
      ],
      [
        { text: '💬 Шаблоны', callback_data: 'a:tpl' },
        { text: 'ℹ️ Инфо', callback_data: 'a:info' },
        u.banned ? { text: '🔓 Разбанить', callback_data: 'a:unban' } : { text: '⛔ Бан', callback_data: 'a:ban' },
      ],
    ],
  }
}

export function templatesKeyboard(): InlineKeyboard {
  const rows: InlineButton[][] = []
  for (let i = 0; i < TEMPLATES.length; i += 2) {
    rows.push(TEMPLATES.slice(i, i + 2).map((t) => ({ text: t.title, callback_data: `s:${t.id}` })))
  }
  return { inline_keyboard: rows }
}

export function categoriesKeyboard(): InlineKeyboard {
  return { inline_keyboard: CATEGORIES.map((c) => [{ text: c.title, callback_data: `c:${c.id}` }]) }
}
