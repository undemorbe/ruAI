/** Апдейты бота входа: /start <token>, /status, кнопки 2FA и отвязки. Только личные чаты. */
import type { Auth, Decision, LinkResult } from '../auth.ts'
import type { TgApi, TgUpdate } from './api.ts'

const CALLBACK = /^(ok|no):([\w-]{22})$/
const START = /^\/start(?:@\w+)?(?:\s+(\S{1,64}))?$/
const STATUS = /^\/status(?:@\w+)?$/

const LINK_REPLY: Record<LinkResult, (login: string | null) => string> = {
  linked: (login) => `Аккаунт ${login} подтверждён. Теперь вход подтверждается здесь, а пароль можно восстановить через бота.`,
  bad_token: () => 'Ссылка устарела или уже использована. Откройте новую на сайте: раздел «Аккаунт».',
  tg_taken: () => 'Этот Telegram уже подключён к другому аккаунту. Сначала отключите его там.',
  blocked: () => 'Аккаунт заблокирован. Напишите в поддержку.',
}
const DECISION_TOAST: Record<Decision, string> = {
  approved: 'Вход подтверждён',
  denied: 'Вход отклонён',
  unlinked: 'Telegram отключён',
  kept: 'Отменено',
  not_yours: 'Это не ваш запрос',
  gone: 'Запрос устарел',
}

export class TgBot {
  private auth: Auth
  private api: TgApi
  private host: string
  private now: () => number

  constructor(auth: Auth, api: TgApi, origin: string, now: () => number) {
    this.auth = auth
    this.api = api
    this.host = new URL(origin).host
    this.now = now
  }

  async handle(u: TgUpdate): Promise<void> {
    if (u.callback_query) return this.onCallback(u.callback_query)
    const m = u.message
    if (!m || m.chat.type !== 'private' || !m.from) return
    const text = (m.text ?? '').trim()
    const start = START.exec(text)
    if (start) {
      if (!start[1]) return this.say(m.chat.id, `Этот бот защищает аккаунт на ${this.host}: подтверждает вход и помогает восстановить пароль. Подключить: на сайте, раздел «Аккаунт».`)
      const r = this.auth.linkByToken(start[1], m.from.id, this.now())
      return this.say(m.chat.id, LINK_REPLY[r](this.auth.loginOfTg(m.from.id)))
    }
    if (STATUS.test(text)) {
      const login = this.auth.loginOfTg(m.from.id)
      return this.say(m.chat.id, login ? `Подключён к аккаунту ${login} на ${this.host}.` : 'Этот Telegram не подключён ни к одному аккаунту.')
    }
    return this.say(m.chat.id, 'Здесь только подтверждение входа. С вопросами пишите в бота поддержки, ссылка есть на сайте.')
  }

  private async onCallback(q: NonNullable<TgUpdate['callback_query']>) {
    const m = CALLBACK.exec(q.data ?? '')
    const decision: Decision = m ? await this.auth.decide(m[2]!, q.from.id, m[1] as 'ok' | 'no', this.now()) : 'gone'
    // Telegram ждёт ответа на каждое нажатие, иначе кнопка «крутится»
    await this.api.answerCallbackQuery(q.id, DECISION_TOAST[decision]).catch(() => {})
  }

  private async say(chat: number, text: string) {
    await this.api.sendMessage(chat, text).catch((e: Error) => process.stderr.write(`tg reply failed: ${e.message}\n`))
  }
}
