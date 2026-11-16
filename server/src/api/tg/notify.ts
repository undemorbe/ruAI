/** Сообщения бота входа. Только отправка: разбор апдейтов в bot.ts. */
import type { TgApi, TgButton } from './api.ts'

export interface TgNotifier {
  readonly botName: string
  linkUrl(token: string): string
  /** id сообщения или null, если отправить не удалось. */
  loginPrompt(tgId: number, p: { ref: string; code: string; device: string; at: number }): Promise<number | null>
  unlinkPrompt(tgId: number, p: { ref: string; at: number }): Promise<number | null>
  resetLink(tgId: number, url: string): Promise<boolean>
  notice(tgId: number, text: string): Promise<void>
  /** Убрать кнопки и заменить текст: решение принято. */
  close(tgId: number, messageId: number, text: string): Promise<void>
}

/** «16.11, 12:04» по Москве (UTC+3 круглый год). */
export const mskStamp = (t: number) => new Date(t + 3 * 3_600_000).toISOString().replace(/^\d{4}-(\d\d)-(\d\d)T(\d\d:\d\d).*$/, '$2.$1, $3')
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

export function tgNotifier(api: TgApi, botName: string, origin: string): TgNotifier {
  const host = new URL(origin).host
  const send = async (chat: number, text: string, buttons?: TgButton[][]) => {
    try {
      return (await api.sendMessage(chat, text, buttons)).message_id
    } catch (e) {
      process.stderr.write(`tg send failed: ${(e as Error).message}\n`)
      return null
    }
  }
  return {
    botName,
    linkUrl: (token) => `https://t.me/${botName}?start=${token}`,
    loginPrompt: (tgId, p) =>
      send(tgId, `Вход в ${host}\n${p.device} · ${mskStamp(p.at)} МСК\nКод: ${spaced(p.code)}\n\nЕсли это не вы, нажмите «Это не я» и смените пароль.`, [
        [
          { text: '✅ Подтвердить', callback_data: `ok:${p.ref}` },
          { text: '⛔ Это не я', callback_data: `no:${p.ref}` },
        ],
      ]),
    unlinkPrompt: (tgId, p) =>
      send(tgId, `Отключить защиту аккаунта на ${host} через Telegram? Запрос ${mskStamp(p.at)} МСК.`, [
        [
          { text: 'Отключить', callback_data: `ok:${p.ref}` },
          { text: 'Отмена', callback_data: `no:${p.ref}` },
        ],
      ]),
    resetLink: async (tgId, url) =>
      (await send(tgId, `Смена пароля на ${host}. Ссылка действует 15 минут. Если вы не просили сменить пароль, ничего не делайте.`, [[{ text: 'Сменить пароль', url }]])) !== null,
    notice: async (tgId, text) => {
      await send(tgId, text)
    },
    close: async (tgId, messageId, text) => {
      await api.editMessageText(tgId, messageId, text).catch(() => {})
    },
  }
}
