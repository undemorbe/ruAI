/**
 * Логика бота поддержки.
 *
 * Личка пользователя → его тема в супергруппе поддержки (copyMessage, без «переслано от»).
 * Ответ сотрудника в теме → личка пользователя. Команды сотрудников: /close, /ban, /unban, /info, /t, /help.
 * Быстрые действия — инлайн-кнопки: под карточкой (статус, шаблоны, бан), шаблоны ответов,
 * выбор темы обращения пользователем после /start. Статус виден значком в названии темы.
 * Принимаем только личку и SUPPORT_CHAT_ID; из остальных групп и каналов бот выходит сам.
 *
 * Сообщения одного пользователя (и одной темы) обрабатываются строго по очереди — так не создаются
 * две темы на одного человека и не путается порядок. Альбомы собираются по media_group_id
 * и отправляются одним copyMessages.
 */
import type { Logger } from './log.ts'
import { silentLogger } from './log.ts'
import { RateLimiter } from './limiter.ts'
import type { SupportStore, TicketStatus, UserRecord } from './store.ts'
import { type InlineKeyboard, type StaffAction, cardKeyboard, categoriesKeyboard, parseCallback, templatesKeyboard } from './keyboards.ts'
import {
  type Caller,
  type TgCallbackQuery,
  type TgChat,
  type TgChatMemberUpdated,
  type TgMessage,
  type TgUpdate,
  TelegramError,
  errText,
  isBlockedByUser,
  isNotModified,
  isThreadGone,
  isTopicClosed,
} from './telegram.ts'
import { T, TEMPLATES, categoryTitle, topicName, userCard } from './texts.ts'

export interface BotConfig {
  supportChatId: number
  rateLimitPerMinute: number
  maxTextLength: number
  newTopicsPerHour: number
  /** Сколько ждать остальные части альбома после последней пришедшей, мс. */
  albumDelayMs: number
}

export interface BotDeps {
  tg: Caller
  store: SupportStore
  config: BotConfig
  now?: () => number
  log?: Logger
}

/** Типы сообщений, которые пересылаем. Остальное (опросы, контакты, геолокация, служебные) — нет. */
const CONTENT = ['text', 'photo', 'document', 'voice', 'video', 'sticker', 'audio', 'video_note', 'animation'] as const
/** Пользовательский контент, о неподдержке которого стоит сказать (служебные сообщения молча игнорируем). */
const UNSUPPORTED = ['contact', 'location', 'venue', 'poll', 'dice', 'game', 'story', 'invoice', 'paid_media', 'checklist']

export function contentKind(m: TgMessage): string | null {
  for (const k of CONTENT) if (m[k] !== undefined) return k
  return null
}

export type Command = { name: string } | 'foreign' | null

/** «/cmd» или «/cmd@бот». Команда другому боту — 'foreign'. */
export function parseCommand(text: string | undefined, botUsername: string): Command {
  const m = /^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]{3,64}))?(?=\s|$)/.exec(text ?? '')
  if (!m) return null
  if (m[2] && m[2].toLowerCase() !== botUsername.toLowerCase()) return 'foreign'
  return { name: (m[1] ?? '').toLowerCase() }
}

interface Album {
  key: string
  msgs: TgMessage[]
  timer: ReturnType<typeof setTimeout>
  process: (msgs: TgMessage[]) => Promise<void>
}

const HOUR = 3_600_000

export class SupportBot {
  private readonly tg: Caller
  private readonly store: SupportStore
  private readonly cfg: BotConfig
  private readonly now: () => number
  private readonly log: Logger
  private readonly userLimiter: RateLimiter
  private readonly topicLimiter: RateLimiter
  private readonly busyNotice = new RateLimiter(1, HOUR)
  private readonly chains = new Map<string, Promise<void>>()
  private readonly albums = new Map<string, Album>()
  private readonly left = new Set<number>()
  /** Меню шаблонов, из которых уже отправили ответ: повторное нажатие ничего не шлёт. */
  private readonly usedMenus = new Set<number>()
  private botUsername = ''

  constructor(deps: BotDeps) {
    this.tg = deps.tg
    this.store = deps.store
    this.cfg = deps.config
    this.now = deps.now ?? Date.now
    this.log = deps.log ?? silentLogger
    this.userLimiter = new RateLimiter(this.cfg.rateLimitPerMinute, 60_000)
    this.topicLimiter = new RateLimiter(this.cfg.newTopicsPerHour, HOUR)
  }

  setBotUsername(username: string): void {
    this.botUsername = username
  }

  handleUpdate(u: TgUpdate): void {
    try {
      if (u.my_chat_member) this.onMembership(u.my_chat_member)
      else if (u.message) this.onMessage(u.message)
      else if (u.callback_query) this.onCallback(u.callback_query)
    } catch (e) {
      this.log('update_error', { error: errText(e) })
    }
  }

  /** Отправить все собранные альбомы и дождаться обработки всего, что в работе. */
  async drain(): Promise<void> {
    for (;;) {
      for (const id of [...this.albums.keys()]) this.flushAlbum(id)
      if (!this.chains.size) return
      await Promise.all([...this.chains.values()])
    }
  }

  // ---------- разбор входящих ----------

  private onMembership(ev: TgChatMemberUpdated): void {
    const { chat } = ev
    if (chat.type === 'private') return
    if (chat.id === this.cfg.supportChatId) {
      if (ev.new_chat_member.status === 'left' || ev.new_chat_member.status === 'kicked') this.log('support_chat_removed')
      return
    }
    if (['member', 'administrator', 'restricted', 'creator'].includes(ev.new_chat_member.status)) this.leave(chat)
  }

  private onMessage(m: TgMessage): void {
    if (m.chat.type === 'private') return this.onPrivate(m)
    if (m.chat.id === this.cfg.supportChatId) return this.onSupport(m)
    this.leave(m.chat)
  }

  private leave(chat: TgChat): void {
    if (chat.type === 'private' || this.left.has(chat.id)) return
    this.left.add(chat.id)
    this.log('foreign_chat_leave', { chat: chat.id })
    this.enqueue(`c:${chat.id}`, () => this.tg.call('leaveChat', { chat_id: chat.id }))
  }

  /**
   * Нажатие инлайн-кнопки. callback_data может подменить клиент, поэтому данные проходят белый список,
   * а пользователь для действий сотрудника определяется по теме, где нажата кнопка.
   */
  private onCallback(q: TgCallbackQuery): void {
    const msg = q.message
    const cb = parseCallback(q.data)
    if (!msg || !cb || q.from.is_bot) return this.answerLater(q)
    if (msg.chat.type === 'private') {
      if (msg.chat.id !== q.from.id || cb.kind !== 'category') return this.answerLater(q)
      this.enqueue(`u:${q.from.id}`, () => this.categoryCallback(q, msg, cb.id))
      return
    }
    if (msg.chat.id !== this.cfg.supportChatId) {
      this.answerLater(q)
      this.leave(msg.chat)
      return
    }
    const thread = msg.is_topic_message ? msg.message_thread_id : undefined
    if (!thread || cb.kind === 'category') return this.answerLater(q)
    this.enqueue(`t:${thread}`, () =>
      cb.kind === 'template' ? this.templateCallback(q, msg, thread, cb.id) : this.staffCallback(q, msg, thread, cb.action),
    )
  }

  private onPrivate(m: TgMessage): void {
    if (!m.from || m.from.is_bot || m.from.id !== m.chat.id) return
    const key = `u:${m.from.id}`
    if (m.media_group_id) this.buffer(key, m, (msgs) => this.userUnit(msgs))
    else {
      this.flushAlbumsFor(key)
      this.enqueue(key, () => this.userUnit([m]))
    }
  }

  private onSupport(m: TgMessage): void {
    if (m.migrate_to_chat_id) {
      this.log('support_chat_migrated', { to: m.migrate_to_chat_id })
      return
    }
    // сотрудник — живой человек или анонимный админ этой же группы; другие боты и каналы — нет
    const staff = m.sender_chat ? m.sender_chat.id === this.cfg.supportChatId : !!m.from && !m.from.is_bot
    if (!staff) return
    const cmd = parseCommand(m.text, this.botUsername)
    if (cmd === 'foreign') return
    const thread = m.is_topic_message ? m.message_thread_id : undefined
    if (!thread) {
      if (cmd) this.enqueue('general', () => this.generalCommand(m, cmd.name))
      return
    }
    const key = `t:${thread}`
    if (cmd) {
      this.flushAlbumsFor(key)
      this.enqueue(key, () => this.staffCommand(m, thread, cmd.name))
      return
    }
    if (!contentKind(m)) return // служебное сообщение
    if (m.media_group_id) this.buffer(key, m, (msgs) => this.staffUnit(thread, msgs))
    else {
      this.flushAlbumsFor(key)
      this.enqueue(key, () => this.staffUnit(thread, [m]))
    }
  }

  // ---------- очереди и альбомы ----------

  private enqueue(key: string, fn: () => Promise<unknown>): void {
    const prev = this.chains.get(key) ?? Promise.resolve()
    const next = prev.then(fn).then(
      () => undefined,
      (e: unknown) => this.log('task_error', { error: errText(e) }),
    )
    this.chains.set(key, next)
    void next.then(() => {
      if (this.chains.get(key) === next) this.chains.delete(key)
    })
  }

  private buffer(key: string, m: TgMessage, process: (msgs: TgMessage[]) => Promise<void>): void {
    const id = `${key}|${m.media_group_id}`
    const timer = setTimeout(() => this.flushAlbum(id), this.cfg.albumDelayMs)
    const a = this.albums.get(id)
    if (a) {
      clearTimeout(a.timer)
      a.timer = timer
      a.msgs.push(m)
      return
    }
    this.flushAlbumsFor(key) // предыдущий альбом этого же отправителя уходит раньше
    this.albums.set(id, { key, msgs: [m], process, timer })
  }

  private flushAlbum(id: string): void {
    const a = this.albums.get(id)
    if (!a) return
    clearTimeout(a.timer)
    this.albums.delete(id)
    const msgs = [...a.msgs].sort((x, y) => x.message_id - y.message_id)
    this.enqueue(a.key, () => a.process(msgs))
  }

  private flushAlbumsFor(key: string): void {
    for (const [id, a] of this.albums) if (a.key === key) this.flushAlbum(id)
  }

  // ---------- пользователь → тема ----------

  private async userUnit(msgs: TgMessage[]): Promise<void> {
    const first = msgs[0]
    if (!first?.from) return
    const user = this.store.touchUser(first.from, this.now())
    const id = user.userId
    if (user.banned) {
      this.log('drop_banned', { user: id })
      return
    }
    const verdict = this.userLimiter.hit(String(id), this.now())
    if (verdict !== 'ok') {
      this.log('rate_limited', { user: id })
      if (verdict === 'warn') await this.say(id, T.tooFast)
      return
    }
    if (msgs.length === 1 && /^\/start(?:@\w+)?(?:\s|$)/.test(first.text ?? '')) {
      await this.say(id, T.welcome, categoriesKeyboard())
      return
    }
    const supported = msgs.filter((m) => contentKind(m))
    if (!supported.length) {
      if (msgs.some((m) => UNSUPPORTED.some((k) => m[k] !== undefined))) await this.say(id, T.unsupported)
      return
    }
    if ((first.text?.length ?? 0) > this.cfg.maxTextLength) {
      await this.say(id, T.tooLong)
      return
    }
    await this.deliverToTopic(user, supported)
  }

  private async deliverToTopic(user: UserRecord, msgs: TgMessage[]): Promise<void> {
    let created = false
    let recreated = false
    let reopened = false
    for (let attempt = 0; attempt < 3; attempt++) {
      if (user.threadId === null) {
        const thread = await this.createTopic(user, recreated)
        if (thread === null) return
        created = true
      }
      const thread = user.threadId as number
      try {
        if (user.closed) {
          await this.reopen(thread)
          this.store.setClosed(user.userId, false)
          user.closed = false
        }
        // решённое обращение, в которое снова написали, — опять новое
        if (user.status === 'done') await this.setStatus(user, 'new')
        await this.copyToTopic(user, thread, msgs)
        if (created) await this.say(user.userId, T.received)
        return
      } catch (e) {
        if (isThreadGone(e) && !recreated) {
          this.log('topic_gone', { user: user.userId, thread })
          this.store.setThread(user.userId, null)
          user.threadId = null
          user.closed = false
          recreated = true
          continue
        }
        if (isTopicClosed(e) && !reopened) {
          reopened = true
          user.closed = true
          continue
        }
        throw e
      }
    }
  }

  private async createTopic(user: UserRecord, recreated: boolean): Promise<number | null> {
    const now = this.now()
    if (this.topicLimiter.hit('all', now) !== 'ok') {
      this.log('topic_limit', { user: user.userId })
      if (this.busyNotice.hit(String(user.userId), now) === 'ok') await this.say(user.userId, T.busy)
      return null
    }
    const t = await this.tg.call<{ message_thread_id: number }>('createForumTopic', {
      chat_id: this.cfg.supportChatId,
      name: topicName(user),
    })
    const thread = t.message_thread_id
    this.store.setThread(user.userId, thread)
    user.threadId = thread
    user.closed = false
    user.status = 'new'
    this.log('topic_created', { user: user.userId, thread })
    try {
      await this.tg.call('sendMessage', {
        chat_id: this.cfg.supportChatId,
        message_thread_id: thread,
        text: userCard(user, { recreated }),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: cardKeyboard(user),
      })
    } catch (e) {
      // без карточки тема всё равно рабочая; если тема уже исчезла — разберётся copyToTopic
      this.log('card_failed', { user: user.userId, error: errText(e) })
    }
    return thread
  }

  private async reopen(thread: number): Promise<void> {
    try {
      await this.tg.call('reopenForumTopic', { chat_id: this.cfg.supportChatId, message_thread_id: thread })
    } catch (e) {
      if (!isNotModified(e)) throw e
    }
  }

  private async copyToTopic(user: UserRecord, thread: number, msgs: TgMessage[]): Promise<void> {
    const chat = this.cfg.supportChatId
    const first = msgs[0]
    if (!first) return
    if (msgs.length === 1) {
      const replyTo = first.reply_to_message ? this.store.findGroupMsg(user.userId, first.reply_to_message.message_id) : undefined
      const r = await this.tg.call<{ message_id: number }>('copyMessage', {
        chat_id: chat,
        message_thread_id: thread,
        from_chat_id: user.userId,
        message_id: first.message_id,
        ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      })
      this.store.mapMessage(r.message_id, user.userId, first.message_id, this.now())
    } else {
      const r = await this.tg.call<{ message_id: number }[]>('copyMessages', {
        chat_id: chat,
        message_thread_id: thread,
        from_chat_id: user.userId,
        message_ids: msgs.map((m) => m.message_id),
      })
      r.forEach((sent, i) => {
        const orig = msgs[i]
        if (orig) this.store.mapMessage(sent.message_id, user.userId, orig.message_id, this.now())
      })
    }
    this.log('user_message', { user: user.userId, parts: msgs.length })
  }

  // ---------- тема → пользователь ----------

  private async staffUnit(thread: number, msgs: TgMessage[]): Promise<void> {
    const user = this.store.getUserByThread(thread)
    const first = msgs[0]
    if (!user || !first) return
    try {
      if (msgs.length === 1) {
        const replyTo = this.replyTarget(first, user.userId)
        const r = await this.tg.call<{ message_id: number }>('copyMessage', {
          chat_id: user.userId,
          from_chat_id: this.cfg.supportChatId,
          message_id: first.message_id,
          ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
        })
        this.store.mapMessage(first.message_id, user.userId, r.message_id, this.now())
      } else {
        const r = await this.tg.call<{ message_id: number }[]>('copyMessages', {
          chat_id: user.userId,
          from_chat_id: this.cfg.supportChatId,
          message_ids: msgs.map((m) => m.message_id),
        })
        r.forEach((sent, i) => {
          const orig = msgs[i]
          if (orig) this.store.mapMessage(orig.message_id, user.userId, sent.message_id, this.now())
        })
      }
      this.log('staff_reply', { user: user.userId, parts: msgs.length })
      if (user.status === 'new') await this.setStatus(user, 'work')
    } catch (e) {
      this.log('staff_reply_failed', { user: user.userId, error: errText(e) })
      const reason = e instanceof TelegramError ? e.description : 'ошибка отправки'
      await this.notice(thread, isBlockedByUser(e) ? T.blocked : T.deliveryFailed(reason), { replyTo: first.message_id })
    }
  }

  /** Сотрудник ответил на конкретное сообщение — найти парное ему в личке пользователя. */
  private replyTarget(m: TgMessage, userId: number): number | undefined {
    const r = m.reply_to_message
    // в теме без явного ответа reply_to_message указывает на служебное «тема создана»
    if (!r || r.forum_topic_created !== undefined || r.message_id === m.message_thread_id) return undefined
    const pair = this.store.findUserMsg(r.message_id)
    return pair && pair.userId === userId ? pair.userMsgId : undefined
  }

  private async staffCommand(m: TgMessage, thread: number, name: string): Promise<void> {
    if (name === 'help') return this.notice(thread, T.help)
    const user = this.store.getUserByThread(thread)
    if (!user) return this.notice(thread, T.noUser)
    switch (name) {
      case 'close':
        return this.closeTicket(user, thread)
      case 'ban':
        return this.setBan(user, thread, true)
      case 'unban':
        return this.setBan(user, thread, false)
      case 'info':
        return this.notice(thread, userCard(user, { status: true }), { html: true, keyboard: cardKeyboard(user) })
      case 't':
        return this.notice(thread, T.templatesMenu, { keyboard: templatesKeyboard() })
      default:
        return this.notice(thread, T.unknownCommand, { replyTo: m.message_id })
    }
  }

  // ---------- быстрые действия ----------

  private async staffCallback(q: TgCallbackQuery, msg: TgMessage, thread: number, action: StaffAction): Promise<void> {
    await this.answer(q)
    const user = this.store.getUserByThread(thread)
    if (!user) return this.notice(thread, T.noUser)
    switch (action) {
      case 'work':
        return this.markInWork(user, thread)
      case 'done':
        return this.closeTicket(user, thread)
      case 'tpl':
        return this.notice(thread, T.templatesMenu, { keyboard: templatesKeyboard() })
      case 'info':
        return this.notice(thread, userCard(user, { status: true }), { html: true, keyboard: cardKeyboard(user) })
      case 'ban':
      case 'unban':
        await this.setBan(user, thread, action === 'ban')
        // кнопка под нажатой карточкой меняется на противоположную
        await this.tg
          .call('editMessageReplyMarkup', { chat_id: this.cfg.supportChatId, message_id: msg.message_id, reply_markup: cardKeyboard(user) })
          .catch((e: unknown) => this.log('edit_failed', { error: errText(e) }))
    }
  }

  private async templateCallback(q: TgCallbackQuery, msg: TgMessage, thread: number, id: string): Promise<void> {
    const tpl = TEMPLATES.find((t) => t.id === id)
    const user = this.store.getUserByThread(thread)
    if (!tpl || !user || this.usedMenus.has(msg.message_id)) return this.answer(q, T.templateGone)
    if (this.usedMenus.size > 5000) this.usedMenus.clear()
    this.usedMenus.add(msg.message_id)
    let sentId: number
    try {
      sentId = (await this.tg.call<{ message_id: number }>('sendMessage', { chat_id: user.userId, text: tpl.text })).message_id
    } catch (e) {
      this.usedMenus.delete(msg.message_id)
      await this.answer(q, 'Не доставлено')
      const reason = e instanceof TelegramError ? e.description : 'ошибка отправки'
      return this.notice(thread, isBlockedByUser(e) ? T.blocked : T.deliveryFailed(reason))
    }
    await this.answer(q, 'Отправлено')
    // меню превращается в запись «что ушло пользователю»; ответ пользователя на шаблон процитирует её
    this.store.mapMessage(msg.message_id, user.userId, sentId, this.now())
    await this.tg
      .call('editMessageText', { chat_id: this.cfg.supportChatId, message_id: msg.message_id, text: `${T.templateSent(tpl.title)}\n${tpl.text}` })
      .catch((e: unknown) => this.log('edit_failed', { error: errText(e) }))
    this.log('template_sent', { user: user.userId, template: tpl.id })
    if (user.status === 'new') await this.setStatus(user, 'work')
  }

  private async categoryCallback(q: TgCallbackQuery, msg: TgMessage, id: string): Promise<void> {
    const title = categoryTitle(id)
    const user = this.store.touchUser(q.from, this.now())
    if (!title || user.banned || this.userLimiter.hit(String(user.userId), this.now()) !== 'ok') return this.answer(q)
    this.store.setCategory(user.userId, id)
    user.category = id
    await this.answer(q)
    await this.tg
      .call('editMessageText', { chat_id: user.userId, message_id: msg.message_id, text: T.categoryChosen(title) })
      .catch((e: unknown) => this.log('edit_failed', { error: errText(e) }))
    if (user.threadId !== null) {
      await this.notice(user.threadId, T.categoryStaff(title)).catch((e: unknown) => this.log('notice_failed', { error: errText(e) }))
    }
    this.log('category_chosen', { user: user.userId, category: id })
  }

  private async closeTicket(user: UserRecord, thread: number): Promise<void> {
    await this.notice(thread, T.closedStaff)
    await this.setStatus(user, 'done')
    try {
      await this.tg.call('closeForumTopic', { chat_id: this.cfg.supportChatId, message_thread_id: thread })
    } catch (e) {
      if (!isNotModified(e)) throw e
    }
    this.store.setClosed(user.userId, true)
    user.closed = true
    await this.say(user.userId, T.closedUser)
    this.log('topic_closed', { user: user.userId, thread })
  }

  private async markInWork(user: UserRecord, thread: number): Promise<void> {
    await this.setStatus(user, 'work')
    await this.notice(thread, T.inWorkStaff)
    await this.say(user.userId, T.inWorkUser)
    this.log('ticket_in_work', { user: user.userId })
  }

  private async setBan(user: UserRecord, thread: number, banned: boolean): Promise<void> {
    this.store.setBanned(user.userId, banned)
    user.banned = banned
    if (!banned) this.userLimiter.reset(String(user.userId))
    this.log(banned ? 'user_banned' : 'user_unbanned', { user: user.userId })
    await this.notice(thread, banned ? T.banned : T.unbanned)
  }

  /** Сменить статус и значок в названии темы. Ошибка переименования не мешает работе. */
  private async setStatus(user: UserRecord, status: TicketStatus): Promise<void> {
    if (user.status === status) return
    this.store.setStatus(user.userId, status)
    user.status = status
    if (user.threadId === null) return
    try {
      await this.tg.call('editForumTopic', { chat_id: this.cfg.supportChatId, message_thread_id: user.threadId, name: topicName(user) })
    } catch (e) {
      if (!isNotModified(e)) this.log('topic_rename_failed', { user: user.userId, error: errText(e) })
    }
  }

  private async generalCommand(m: TgMessage, name: string): Promise<void> {
    await this.tg.call('sendMessage', {
      chat_id: this.cfg.supportChatId,
      text: name === 'help' ? T.help : T.inTopicOnly,
      reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
    })
  }

  // ---------- отправка ----------

  private async notice(thread: number, text: string, opts: { html?: boolean; replyTo?: number; keyboard?: InlineKeyboard } = {}): Promise<void> {
    await this.tg.call('sendMessage', {
      chat_id: this.cfg.supportChatId,
      message_thread_id: thread,
      text,
      ...(opts.keyboard ? { reply_markup: opts.keyboard } : {}),
      ...(opts.html ? { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } : {}),
      ...(opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}),
    })
  }

  /** Сообщение пользователю; если он заблокировал бота — только запись в журнал. */
  private async say(userId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    try {
      await this.tg.call('sendMessage', { chat_id: userId, text, ...(keyboard ? { reply_markup: keyboard } : {}) })
    } catch (e) {
      this.log('say_failed', { user: userId, error: errText(e) })
    }
  }

  /** Ответ на нажатие (убирает «часики» на кнопке). Ошибка — только в журнал: запрос мог устареть. */
  private async answer(q: TgCallbackQuery, text?: string): Promise<void> {
    await this.tg
      .call('answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) })
      .catch((e: unknown) => this.log('answer_failed', { error: errText(e) }))
  }

  private answerLater(q: TgCallbackQuery): void {
    this.enqueue('callbacks', () => this.answer(q))
  }
}
