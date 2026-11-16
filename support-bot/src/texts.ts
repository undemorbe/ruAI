/**
 * Тексты бота и карточка пользователя. Пользователю не называем внутренние лимиты (частоту, числа).
 */
import type { TicketStatus, UserRecord } from './store.ts'

export const T = {
  welcome: 'Здравствуйте! Это поддержка ru-chatgpt.com.\nНапишите вопрос — ответим здесь же. Можно сначала выбрать тему:',
  categoryChosen: (title: string) => `Тема: ${title}.\nОпишите, пожалуйста, вопрос — ответим здесь же.`,
  inWorkUser: 'Взяли ваш вопрос в работу — скоро ответим.',
  received: 'Спасибо! Передали вопрос команде — ответим здесь же.',
  tooFast: 'Слишком много сообщений подряд. Подождите немного — пока новые сообщения не доставляются.',
  tooLong: 'Сообщение слишком длинное. Разбейте его, пожалуйста, на несколько частей.',
  unsupported: 'Такой тип сообщений не поддерживается. Отправьте текст, фото, документ, голосовое или видео.',
  busy: 'Сейчас очень много обращений. Напишите, пожалуйста, ещё раз через несколько минут.',
  closedUser: 'Обращение закрыто. Если остались вопросы — просто напишите сюда.',

  closedStaff: 'Обращение решено, тема закрыта, пользователь уведомлён. Его новое сообщение снова откроет тему.',
  inWorkStaff: 'Статус: в работе, пользователь уведомлён.',
  categoryStaff: (title: string) => `Пользователь выбрал тему: ${title}`,
  templatesMenu: 'Шаблоны ответов — нажмите, чтобы отправить пользователю:',
  templateSent: (title: string) => `Отправлен шаблон «${title}»:`,
  templateGone: 'Шаблон уже отправлен или меню устарело.',
  banned: 'Пользователь заблокирован: его сообщения больше не доставляются. Снять блок — /unban.',
  unbanned: 'Блокировка снята.',
  blocked: 'Не доставлено: пользователь заблокировал бота.',
  deliveryFailed: (reason: string) => `Не доставлено: ${reason}`,
  unknownCommand: 'Неизвестная команда, пользователю не отправлено. Список команд — /help.',
  inTopicOnly: 'Эта команда работает внутри темы пользователя.',
  noUser: 'Эта тема не связана с пользователем.',
  help: [
    'Ответ в теме пользователя уходит ему от имени бота.',
    '/close — закрыть обращение (пользователь получит уведомление)',
    '/ban — заблокировать пользователя, /unban — снять блок',
    '/info — карточка пользователя с кнопками',
    '/t — шаблоны ответов',
    'Текст, начинающийся с «/», пользователю не отправляется.',
  ].join('\n'),
}

/** Темы обращений, которые пользователь выбирает кнопкой после /start. id — в callback_data. */
export const CATEGORIES = [
  { id: 'pay', title: 'Оплата и подписка' },
  { id: 'chat', title: 'Не работает чат' },
  { id: 'refund', title: 'Возврат денег' },
  { id: 'other', title: 'Другое' },
] as const

export function categoryTitle(id: string | null): string | null {
  return CATEGORIES.find((c) => c.id === id)?.title ?? null
}

/** Готовые ответы сотрудников. Текст уходит пользователю как есть, без разметки. */
export const TEMPLATES = [
  { id: 'hello', title: 'Приветствие', text: 'Здравствуйте! Уже смотрим ваш вопрос, скоро ответим.' },
  {
    id: 'details',
    title: 'Уточнить детали',
    text: 'Подскажите, пожалуйста, email аккаунта на ru-chatgpt.com и опишите, что происходит. Если есть ошибка — приложите скриншот.',
  },
  {
    id: 'pay',
    title: 'Оплата не прошла',
    text: 'Если деньги списались, а подписка не появилась, пришлите, пожалуйста, email аккаунта, время и сумму оплаты — проверим платёж.',
  },
  {
    id: 'refund',
    title: 'Возврат',
    text: 'Чтобы оформить возврат, пришлите, пожалуйста, email аккаунта и дату оплаты. Проверим платёж и вернёмся с ответом.',
  },
  {
    id: 'browser',
    title: 'Обновить и перезайти',
    text: 'Попробуйте, пожалуйста, обновить страницу и заново войти в аккаунт. Если не поможет — пришлите скриншот и название браузера.',
  },
  { id: 'done', title: 'Вопрос решён', text: 'Рады, что всё получилось! Если появятся вопросы — пишите сюда.' },
] as const

export const STATUS_ICON: Record<TicketStatus, string> = { new: '🆕', work: '🟡', done: '✅' }
const STATUS_TITLE: Record<TicketStatus, string> = { new: 'новое', work: 'в работе', done: 'решено' }

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Убрать управляющие символы и лишние пробелы из пользовательских строк. */
function tidy(s: string | null): string {
  return (s ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()
}

export function fullName(u: Pick<UserRecord, 'firstName' | 'lastName'>): string {
  return tidy([u.firstName, u.lastName].filter(Boolean).join(' '))
}

/** Название темы: «🆕 Имя Фамилия @username» (значок — статус), не длиннее 128 символов (лимит Telegram). */
export function topicName(u: UserRecord): string {
  const parts = [fullName(u), u.username ? `@${tidy(u.username)}` : ''].filter(Boolean)
  const name = `${STATUS_ICON[u.status]} ${parts.join(' ') || `Пользователь ${u.userId}`}`
  const chars = [...name]
  return chars.length > 128 ? `${chars.slice(0, 127).join('')}…` : name
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(ms: number): string {
  return `${dateFmt.format(new Date(ms))} МСК`
}

/** Карточка пользователя (HTML для parse_mode). */
export function userCard(u: UserRecord, opts: { recreated?: boolean; status?: boolean } = {}): string {
  const lines = [
    opts.recreated ? '<b>Обращение (тема создана заново — прежнюю удалили)</b>' : '<b>Обращение в поддержку</b>',
    `ID: <code>${u.userId}</code>`,
    `Имя: ${escapeHtml(fullName(u)) || '—'}`,
    `Username: ${u.username ? `@${escapeHtml(tidy(u.username))}` : '—'}`,
    `Язык: ${u.language ? escapeHtml(tidy(u.language)) : '—'}`,
    `Первое обращение: ${formatDate(u.firstSeen)}`,
  ]
  const cat = categoryTitle(u.category)
  if (cat) lines.push(`Тема: ${escapeHtml(cat)}`)
  if (opts.status) {
    lines.push(`Статус: ${STATUS_ICON[u.status]} ${STATUS_TITLE[u.status]}, ${u.banned ? 'заблокирован' : 'не заблокирован'}, тема ${u.closed ? 'закрыта' : 'открыта'}`)
  }
  lines.push(`<a href="tg://user?id=${u.userId}">Профиль</a>`)
  return lines.join('\n')
}
