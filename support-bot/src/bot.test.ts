import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { type BotConfig, SupportBot, contentKind, parseCommand } from './bot.ts'
import { SupportStore } from './store.ts'
import { TelegramError, type TgMessage, type TgUpdate, type TgUser } from './telegram.ts'
import { FakeTg, SUPPORT, alice, bob, privateMsg, staffer, topicMsg } from './testing.ts'
import { T } from './texts.ts'

const baseConfig: BotConfig = {
  supportChatId: SUPPORT,
  rateLimitPerMinute: 20,
  maxTextLength: 3000,
  newTopicsPerHour: 60,
  albumDelayMs: 10_000, // в тестах альбомы отправляет drain()
}

let tg: FakeTg
let store: SupportStore
let clock: number
let logs: string[]
let bot: SupportBot

function make(over: Partial<BotConfig> = {}, st: SupportStore = store) {
  const b = new SupportBot({
    tg,
    store: st,
    config: { ...baseConfig, ...over },
    now: () => clock,
    log: (e, f) => logs.push(`${e} ${JSON.stringify(f ?? {})}`),
  })
  b.setBotUsername('ruai_support_bot')
  return b
}

/** callback_data всех кнопок сообщения по порядку. */
function buttons(params: Record<string, unknown> | undefined): string[] {
  const kb = params?.reply_markup as { inline_keyboard: { callback_data: string }[][] } | undefined
  return kb ? kb.inline_keyboard.flat().map((b) => b.callback_data) : []
}

let qSeq = 1
function press(data: string, message: TgMessage | undefined, from: TgUser = staffer): TgUpdate {
  return { update_id: 1, callback_query: { id: `q${qSeq++}`, from, message, data } }
}

async function send(...updates: TgUpdate[]) {
  for (const u of updates) bot.handleUpdate(u)
  await bot.drain()
}

beforeEach(() => {
  tg = new FakeTg()
  store = new SupportStore(':memory:')
  clock = Date.UTC(2026, 10, 16, 9, 0, 0)
  logs = []
  bot = make()
})

describe('разбор команд и типов', () => {
  it('parseCommand: своя, чужая, не команда', () => {
    assert.deepEqual(parseCommand('/close', 'ruai_support_bot'), { name: 'close' })
    assert.deepEqual(parseCommand('/BAN@RuAI_Support_Bot причина', 'ruai_support_bot'), { name: 'ban' })
    assert.equal(parseCommand('/close@other_bot', 'ruai_support_bot'), 'foreign')
    assert.equal(parseCommand('привет /close', 'ruai_support_bot'), null)
    assert.equal(parseCommand(undefined, 'ruai_support_bot'), null)
  })

  it('contentKind: поддерживаемые типы и служебные', () => {
    const base = { message_id: 1, date: 1, chat: { id: 1, type: 'private' as const } }
    assert.equal(contentKind({ ...base, text: 'a' }), 'text')
    assert.equal(contentKind({ ...base, photo: [{}] }), 'photo')
    assert.equal(contentKind({ ...base, voice: {} }), 'voice')
    assert.equal(contentKind({ ...base, sticker: {} }), 'sticker')
    assert.equal(contentKind({ ...base, forum_topic_created: {} }), null)
  })
})

describe('личка → тема', () => {
  it('/start — приветствие, тема не создаётся', async () => {
    await send(privateMsg(alice, { text: '/start' }))
    assert.equal(tg.of('createForumTopic').length, 0)
    const hello = tg.last('sendMessage')?.params
    assert.equal(hello?.chat_id, alice.id)
    assert.equal(hello?.text, T.welcome)
    assert.match(T.welcome, /Напишите вопрос — ответим здесь же/)
    assert.deepEqual(buttons(hello), ['c:pay', 'c:chat', 'c:refund', 'c:other'])
  })

  it('первое сообщение: тема с именем и @username, карточка, копия без «переслано», подтверждение', async () => {
    const u = privateMsg(alice, { text: 'Не проходит оплата' })
    await send(u)
    const topic = tg.of('createForumTopic')
    assert.equal(topic.length, 1)
    assert.deepEqual(topic[0]?.params, { chat_id: SUPPORT, name: '🆕 Алиса Иванова @alice' })

    const card = tg.of('sendMessage').find((c) => c.params.chat_id === SUPPORT)
    assert.equal(card?.params.message_thread_id, 101)
    assert.equal(card?.params.parse_mode, 'HTML')
    assert.deepEqual(buttons(card?.params), ['a:work', 'a:done', 'a:tpl', 'a:info', 'a:ban'])
    const text = String(card?.params.text)
    for (const part of ['<code>111</code>', 'Алиса Иванова', '@alice', 'Язык: ru', '16.11.2026']) assert.ok(text.includes(part), part)

    const copy = tg.last('copyMessage')
    assert.deepEqual(copy?.params, { chat_id: SUPPORT, message_thread_id: 101, from_chat_id: alice.id, message_id: u.message?.message_id })
    assert.equal(tg.of('forwardMessage').length, 0)
    assert.deepEqual(tg.last('sendMessage')?.params, { chat_id: alice.id, text: T.received })
    assert.equal(store.getUser(alice.id)?.threadId, 101)
  })

  it('второе сообщение идёт в ту же тему', async () => {
    await send(privateMsg(alice, { text: 'раз' }))
    await send(privateMsg(alice, { text: 'два' }))
    assert.equal(tg.of('createForumTopic').length, 1)
    assert.equal(tg.of('copyMessage').length, 2)
    assert.equal(tg.last('copyMessage')?.params.message_thread_id, 101)
  })

  it('несколько сообщений подряд от нового пользователя — одна тема', async () => {
    await send(privateMsg(bob, { text: '1' }), privateMsg(bob, { text: '2' }), privateMsg(bob, { text: '3' }))
    assert.equal(tg.of('createForumTopic').length, 1)
    assert.equal(tg.of('copyMessage').length, 3)
    assert.equal(tg.of('createForumTopic')[0]?.params.name, '🆕 Боб')
  })

  it('после перезапуска (та же база) тема находится, новая не создаётся', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ruai-bot-')), 'support.db')
    const st1 = new SupportStore(path)
    bot = make({}, st1)
    await send(privateMsg(alice, { text: 'до перезапуска' }))
    st1.close()

    const st2 = new SupportStore(path)
    bot = make({}, st2)
    tg.reset()
    await send(privateMsg(alice, { text: 'после перезапуска' }))
    assert.equal(tg.of('createForumTopic').length, 0)
    assert.equal(tg.last('copyMessage')?.params.message_thread_id, 101)
    st2.close()
  })

  it('тему удалили вручную — создаётся новая и сообщение доставляется в неё', async () => {
    await send(privateMsg(alice, { text: 'первое' }))
    tg.handlers.copyMessage = (p) => {
      if (p.message_thread_id === 101) throw new TelegramError(400, 'Bad Request: message thread not found')
      return { message_id: 7777 }
    }
    await send(privateMsg(alice, { text: 'второе' }))
    assert.equal(tg.of('createForumTopic').length, 2)
    assert.equal(store.getUser(alice.id)?.threadId, 102)
    assert.equal(tg.last('copyMessage')?.params.message_thread_id, 102)
    const card = tg.of('sendMessage').filter((c) => c.params.message_thread_id === 102)[0]
    assert.match(String(card?.params.text), /создана заново/)
    assert.ok(logs.some((l) => l.startsWith('topic_gone')))
  })

  it('тема закрыта вручную (TOPIC_CLOSED) — бот открывает её и доставляет', async () => {
    await send(privateMsg(alice, { text: 'первое' }))
    let closed = true
    tg.handlers.copyMessage = () => {
      if (closed) throw new TelegramError(400, 'Bad Request: TOPIC_CLOSED')
      return { message_id: 1 }
    }
    tg.handlers.reopenForumTopic = () => {
      closed = false
      return true
    }
    await send(privateMsg(alice, { text: 'второе' }))
    assert.equal(tg.of('reopenForumTopic').length, 1)
    assert.equal(tg.of('copyMessage').length, 3)
    assert.equal(tg.of('createForumTopic').length, 1)
  })

  it('ответ пользователя на сообщение бота становится ответом на сообщение сотрудника в теме', async () => {
    await send(privateMsg(alice, { text: 'вопрос' }))
    tg.handlers.copyMessage = (p) => ({ message_id: p.chat_id === alice.id ? 9001 : 9500 })
    const staffMsg = topicMsg(101, { text: 'ответ' })
    await send(staffMsg)
    await send(privateMsg(alice, { text: 'а подробнее?', reply_to_message: { message_id: 9001, date: 1, chat: { id: alice.id, type: 'private' } } }))
    assert.deepEqual(tg.last('copyMessage')?.params.reply_parameters, {
      message_id: staffMsg.message?.message_id,
      allow_sending_without_reply: true,
    })
  })

  it('неподдерживаемый тип — подсказка, тема не создаётся; служебное — молча', async () => {
    await send(privateMsg(alice, { location: { latitude: 1, longitude: 2 } }))
    assert.deepEqual(tg.last('sendMessage')?.params, { chat_id: alice.id, text: T.unsupported })
    tg.reset()
    await send(privateMsg(alice, { pinned_message: {} }))
    assert.equal(tg.calls.length, 0)
    assert.equal(tg.of('createForumTopic').length, 0)
  })

  it('фото, документ, голосовое, видео, стикер доставляются', async () => {
    for (const extra of [{ photo: [{}] }, { document: {} }, { voice: {} }, { video: {} }, { sticker: {} }]) {
      await send(privateMsg(alice, extra))
    }
    assert.equal(tg.of('copyMessage').length, 5)
  })

  it('слишком длинный текст не пересылается', async () => {
    bot = make({ maxTextLength: 10 })
    await send(privateMsg(alice, { text: 'x'.repeat(11) }))
    assert.equal(tg.of('copyMessage').length, 0)
    assert.deepEqual(tg.last('sendMessage')?.params, { chat_id: alice.id, text: T.tooLong })
  })

  it('сообщения ботов в личке игнорируются', async () => {
    await send(privateMsg({ id: 333, is_bot: true, first_name: 'spam' }, { text: 'hi' }))
    assert.equal(tg.calls.length, 0)
  })
})

describe('альбомы', () => {
  it('альбом пользователя уходит одним copyMessages в правильном порядке и считается за одно сообщение', async () => {
    bot = make({ rateLimitPerMinute: 2 })
    const parts = [1, 2, 3].map(() => privateMsg(alice, { photo: [{}], media_group_id: 'A1' }))
    for (const p of parts.reverse()) bot.handleUpdate(p)
    await bot.drain()
    const batch = tg.of('copyMessages')
    assert.equal(batch.length, 1)
    const ids = parts.map((p) => p.message?.message_id).sort((a, b) => Number(a) - Number(b))
    assert.deepEqual(batch[0]?.params.message_ids, ids)
    assert.equal(batch[0]?.params.message_thread_id, 101)
    // лимит 2: альбом засчитан одним сообщением, следующее ещё проходит
    await send(privateMsg(alice, { text: 'после альбома' }))
    assert.equal(tg.of('copyMessage').length, 1)
  })

  it('альбом отправляется сам по таймеру', async () => {
    bot = make({ albumDelayMs: 5 })
    bot.handleUpdate(privateMsg(alice, { photo: [{}], media_group_id: 'B' }))
    bot.handleUpdate(privateMsg(alice, { video: {}, media_group_id: 'B' }))
    await new Promise((r) => setTimeout(r, 30))
    await bot.drain()
    assert.equal(tg.of('copyMessages').length, 1)
  })

  it('текст после альбома не обгоняет альбом', async () => {
    bot.handleUpdate(privateMsg(alice, { photo: [{}], media_group_id: 'C' }))
    bot.handleUpdate(privateMsg(alice, { photo: [{}], media_group_id: 'C' }))
    const text = privateMsg(alice, { text: 'подпись потом' })
    bot.handleUpdate(text)
    await bot.drain()
    const order = tg.calls.filter((c) => c.method.startsWith('copyMessage')).map((c) => c.method)
    assert.deepEqual(order, ['copyMessages', 'copyMessage'])
    assert.equal(tg.last('copyMessage')?.params.message_id, text.message?.message_id)
  })

  it('альбом сотрудника уходит пользователю одним copyMessages', async () => {
    await send(privateMsg(alice, { text: 'вопрос' }))
    tg.reset()
    await send(topicMsg(101, { photo: [{}], media_group_id: 'S' }), topicMsg(101, { photo: [{}], media_group_id: 'S' }))
    const batch = tg.of('copyMessages')
    assert.equal(batch.length, 1)
    assert.equal(batch[0]?.params.chat_id, alice.id)
    assert.equal(batch[0]?.params.from_chat_id, SUPPORT)
  })
})

describe('тема → пользователь', () => {
  beforeEach(async () => {
    await send(privateMsg(alice, { text: 'вопрос' }))
    tg.reset()
  })

  it('ответ сотрудника копируется пользователю без «переслано от»', async () => {
    const m = topicMsg(101, { text: 'Здравствуйте, проверим' })
    await send(m)
    assert.deepEqual(tg.last('copyMessage')?.params, { chat_id: alice.id, from_chat_id: SUPPORT, message_id: m.message?.message_id })
    assert.equal(tg.of('forwardMessage').length, 0)
  })

  it('ответ на конкретное сообщение пользователя цитирует его в личке', async () => {
    const userMsg = privateMsg(alice, { text: 'уточнение' })
    await send(userMsg)
    const groupCopyId = store.findGroupMsg(alice.id, Number(userMsg.message?.message_id))
    assert.ok(groupCopyId)
    tg.reset()
    await send(topicMsg(101, { text: 'ответ', reply_to_message: { message_id: groupCopyId, date: 1, chat: { id: SUPPORT, type: 'supergroup' } } }))
    assert.deepEqual(tg.last('copyMessage')?.params.reply_parameters, { message_id: userMsg.message?.message_id, allow_sending_without_reply: true })
  })

  it('анонимный админ группы — тоже сотрудник', async () => {
    await send(
      topicMsg(101, { text: 'ответ', sender_chat: { id: SUPPORT, type: 'supergroup' } }, { id: 1087968824, is_bot: true, first_name: 'Group' }),
    )
    assert.equal(tg.of('copyMessage').length, 1)
  })

  it('сообщения других ботов, каналов, служебные и General — игнор', async () => {
    await send(
      topicMsg(101, { text: 'я бот' }, { id: 444, is_bot: true, first_name: 'OtherBot' }),
      topicMsg(101, { text: 'из канала', sender_chat: { id: -100999, type: 'channel' } }),
      topicMsg(101, { forum_topic_edited: {} }),
      topicMsg(101, { pinned_message: {} }),
      topicMsg(0, { text: 'в General', is_topic_message: undefined, message_thread_id: undefined }),
    )
    assert.equal(tg.calls.length, 0)
  })

  it('тема, не связанная с пользователем, — игнор', async () => {
    await send(topicMsg(555, { text: 'обсуждение команды' }))
    assert.equal(tg.calls.length, 0)
  })

  it('пользователь заблокировал бота — заметка в теме', async () => {
    tg.handlers.copyMessage = () => {
      throw new TelegramError(403, 'Forbidden: bot was blocked by the user')
    }
    await send(topicMsg(101, { text: 'ответ' }))
    const note = tg.last('sendMessage')
    assert.equal(note?.params.message_thread_id, 101)
    assert.equal(note?.params.text, T.blocked)
  })
})

describe('команды сотрудников', () => {
  beforeEach(async () => {
    await send(privateMsg(alice, { text: 'вопрос' }))
    tg.reset()
  })

  it('/close закрывает тему и уведомляет пользователя; новое сообщение её открывает', async () => {
    await send(topicMsg(101, { text: '/close' }))
    assert.deepEqual(tg.last('closeForumTopic')?.params, { chat_id: SUPPORT, message_thread_id: 101 })
    assert.ok(tg.of('sendMessage').some((c) => c.params.chat_id === alice.id && c.params.text === T.closedUser))
    assert.equal(tg.of('copyMessage').length, 0, 'команда пользователю не копируется')
    assert.equal(store.getUser(alice.id)?.closed, true)

    tg.reset()
    await send(privateMsg(alice, { text: 'ещё вопрос' }))
    assert.equal(tg.of('reopenForumTopic').length, 1)
    assert.equal(tg.of('createForumTopic').length, 0)
    assert.equal(tg.last('copyMessage')?.params.message_thread_id, 101)
    assert.equal(store.getUser(alice.id)?.closed, false)
  })

  it('/ban — сообщения пользователя больше не доходят; /unban — снова доходят', async () => {
    await send(topicMsg(101, { text: '/ban' }))
    assert.equal(tg.last('sendMessage')?.params.text, T.banned)
    tg.reset()
    await send(privateMsg(alice, { text: 'спам' }))
    assert.equal(tg.calls.length, 0, 'забаненному даже не отвечаем')

    await send(topicMsg(101, { text: '/unban@ruai_support_bot' }))
    tg.reset()
    await send(privateMsg(alice, { text: 'нормальный вопрос' }))
    assert.equal(tg.of('copyMessage').length, 1)
  })

  it('/info — карточка со статусом', async () => {
    await send(topicMsg(101, { text: '/info' }))
    const info = tg.last('sendMessage')
    assert.equal(info?.params.parse_mode, 'HTML')
    assert.match(String(info?.params.text), /<code>111<\/code>/)
    assert.match(String(info?.params.text), /Статус: 🆕 новое, не заблокирован, тема открыта/)
    assert.deepEqual(buttons(info?.params), ['a:work', 'a:done', 'a:tpl', 'a:info', 'a:ban'])
  })

  it('неизвестная команда не уходит пользователю; команда другому боту — полный игнор', async () => {
    await send(topicMsg(101, { text: '/oops' }))
    assert.equal(tg.of('copyMessage').length, 0)
    assert.equal(tg.last('sendMessage')?.params.text, T.unknownCommand)
    tg.reset()
    await send(topicMsg(101, { text: '/close@other_bot' }))
    assert.equal(tg.calls.length, 0)
  })

  it('команда в General — подсказка', async () => {
    await send(topicMsg(0, { text: '/ban', is_topic_message: undefined, message_thread_id: undefined }))
    assert.equal(tg.last('sendMessage')?.params.text, T.inTopicOnly)
    assert.equal(store.getUser(alice.id)?.banned, false)
  })

  it('команды бот принимает только из SUPPORT_CHAT_ID', async () => {
    const foreign = topicMsg(101, { text: '/ban' })
    foreign.message!.chat = { id: -100777, type: 'supergroup' }
    await send(foreign)
    assert.equal(store.getUser(alice.id)?.banned, false)
    assert.deepEqual(tg.last('leaveChat')?.params, { chat_id: -100777 })
  })
})

describe('чужие чаты', () => {
  it('сообщение из чужой группы — бот выходит один раз', async () => {
    const m = (id: number): TgUpdate => ({
      update_id: 1,
      message: { message_id: 1, date: 1, chat: { id, type: 'group' }, from: staffer, text: 'hi' },
    })
    await send(m(-555), m(-555))
    assert.equal(tg.of('leaveChat').length, 1)
    assert.equal(tg.of('copyMessage').length, 0)
  })

  it('бота добавили в чужую группу или канал — выходит', async () => {
    const added = (id: number, type: 'supergroup' | 'channel'): TgUpdate => ({
      update_id: 1,
      my_chat_member: { chat: { id, type }, from: staffer, new_chat_member: { status: type === 'channel' ? 'administrator' : 'member', user: staffer } },
    })
    await send(added(-100111, 'supergroup'), added(-100222, 'channel'))
    assert.deepEqual(
      tg.of('leaveChat').map((c) => c.params.chat_id),
      [-100111, -100222],
    )
  })

  it('из группы поддержки бот не выходит', async () => {
    await send({
      update_id: 1,
      my_chat_member: { chat: { id: SUPPORT, type: 'supergroup' }, from: staffer, new_chat_member: { status: 'administrator', user: staffer } },
    })
    assert.equal(tg.of('leaveChat').length, 0)
  })
})

describe('антиспам', () => {
  it('сверх лимита — одно предупреждение, дальше молчание; через минуту снова можно', async () => {
    bot = make({ rateLimitPerMinute: 3 })
    for (let i = 0; i < 6; i++) await send(privateMsg(alice, { text: `m${i}` }))
    assert.equal(tg.of('copyMessage').length, 3)
    assert.equal(tg.of('sendMessage').filter((c) => c.params.text === T.tooFast).length, 1)
    assert.ok(!/\d/.test(T.tooFast), 'пользователю не называем числа лимита')

    clock += 61_000
    await send(privateMsg(alice, { text: 'через минуту' }))
    assert.equal(tg.of('copyMessage').length, 4)
  })

  it('лимит новых тем: пользователь получает «много обращений» один раз', async () => {
    bot = make({ newTopicsPerHour: 1 })
    await send(privateMsg(alice, { text: 'a' }))
    await send(privateMsg(bob, { text: 'b1' }), privateMsg(bob, { text: 'b2' }))
    assert.equal(tg.of('createForumTopic').length, 1)
    assert.equal(tg.of('sendMessage').filter((c) => c.params.chat_id === bob.id && c.params.text === T.busy).length, 1)
  })

  it('в журнале нет текстов, имён и username — только id', async () => {
    await send(privateMsg(alice, { text: 'секретный текст' }), topicMsg(101, { text: 'ответ оператора' }))
    const all = logs.join('\n')
    for (const leak of ['секретный', 'Алиса', 'alice', 'Иванова', 'оператора']) assert.ok(!all.includes(leak), leak)
    assert.ok(all.includes('111'))
  })
})

describe('быстрые действия', () => {
  const card = () => topicMsg(101).message
  beforeEach(async () => {
    await send(privateMsg(alice, { text: 'вопрос' }))
    tg.reset()
  })

  it('«В работе»: значок в названии темы, уведомление пользователю, ответ на нажатие', async () => {
    await send(press('a:work', card()))
    assert.equal(tg.of('answerCallbackQuery').length, 1)
    assert.deepEqual(tg.last('editForumTopic')?.params, { chat_id: SUPPORT, message_thread_id: 101, name: '🟡 Алиса Иванова @alice' })
    assert.ok(tg.of('sendMessage').some((c) => c.params.chat_id === alice.id && c.params.text === T.inWorkUser))
    assert.equal(store.getUser(alice.id)?.status, 'work')
  })

  it('«Решено»: тема закрыта со значком ✅; новое сообщение — снова 🆕 и тема открыта', async () => {
    await send(press('a:done', card()))
    assert.equal(tg.of('closeForumTopic').length, 1)
    assert.equal(tg.last('editForumTopic')?.params.name, '✅ Алиса Иванова @alice')
    assert.ok(tg.of('sendMessage').some((c) => c.params.chat_id === alice.id && c.params.text === T.closedUser))
    tg.reset()
    await send(privateMsg(alice, { text: 'ещё вопрос' }))
    assert.equal(tg.of('reopenForumTopic').length, 1)
    assert.equal(tg.last('editForumTopic')?.params.name, '🆕 Алиса Иванова @alice')
    assert.equal(store.getUser(alice.id)?.status, 'new')
  })

  it('первый ответ сотрудника сам ставит «в работе», следующие — не переименовывают', async () => {
    await send(topicMsg(101, { text: 'смотрим' }), topicMsg(101, { text: 'ещё' }))
    assert.equal(tg.of('editForumTopic').length, 1)
    assert.equal(tg.last('editForumTopic')?.params.name, '🟡 Алиса Иванова @alice')
    assert.ok(!tg.of('sendMessage').some((c) => c.params.text === T.inWorkUser), 'без отдельного уведомления')
  })

  it('«Бан» меняет кнопку на «Разбанить» и обратно', async () => {
    const c = card()
    await send(press('a:ban', c))
    assert.equal(store.getUser(alice.id)?.banned, true)
    const edit = tg.last('editMessageReplyMarkup')?.params
    assert.equal(edit?.message_id, c?.message_id)
    assert.ok(buttons(edit).includes('a:unban'))
    await send(press('a:unban', c))
    assert.equal(store.getUser(alice.id)?.banned, false)
    assert.ok(buttons(tg.last('editMessageReplyMarkup')?.params).includes('a:ban'))
  })

  it('шаблоны: меню, отправка пользователю, меню превращается в запись, повторное нажатие не шлёт', async () => {
    await send(press('a:tpl', card()))
    const menu = tg.last('sendMessage')?.params
    assert.equal(menu?.text, T.templatesMenu)
    assert.ok(buttons(menu).includes('s:pay'))

    const menuMsg = topicMsg(101).message
    await send(press('s:pay', menuMsg))
    const toUser = tg.of('sendMessage').filter((c) => c.params.chat_id === alice.id)
    assert.equal(toUser.length, 1)
    assert.match(String(toUser[0]?.params.text), /email аккаунта/)
    const edited = tg.last('editMessageText')?.params
    assert.equal(edited?.message_id, menuMsg?.message_id)
    assert.match(String(edited?.text), /Отправлен шаблон «Оплата не прошла»/)
    assert.equal(store.getUser(alice.id)?.status, 'work')

    await send(press('s:pay', menuMsg))
    assert.equal(tg.of('sendMessage').filter((c) => c.params.chat_id === alice.id).length, 1)
    assert.equal(tg.last('answerCallbackQuery')?.params.text, T.templateGone)
  })

  it('/t в теме открывает шаблоны', async () => {
    await send(topicMsg(101, { text: '/t' }))
    assert.equal(tg.last('sendMessage')?.params.text, T.templatesMenu)
    assert.equal(tg.of('copyMessage').length, 0)
  })

  it('шаблон не доставлен (бот заблокирован) — заметка в теме, меню можно нажать снова', async () => {
    tg.handlers.sendMessage = (p) => {
      if (p.chat_id === alice.id) throw new TelegramError(403, 'Forbidden: bot was blocked by the user')
      return { message_id: 1 }
    }
    const menuMsg = topicMsg(101).message
    await send(press('s:hello', menuMsg))
    assert.equal(tg.last('sendMessage')?.params.text, T.blocked)
    delete tg.handlers.sendMessage
    await send(press('s:hello', menuMsg))
    assert.equal(tg.of('editMessageText').length, 1)
  })

  it('выбор темы пользователем: попадает в карточку и в тему, сообщение с кнопками меняется', async () => {
    const welcome = privateMsg(bob).message
    await send(press('c:refund', welcome, bob))
    assert.equal(store.getUser(bob.id)?.category, 'refund')
    assert.deepEqual(tg.last('editMessageText')?.params, { chat_id: bob.id, message_id: welcome?.message_id, text: T.categoryChosen('Возврат денег') })
    await send(privateMsg(bob, { text: 'верните деньги' }))
    const bobCard = tg.of('sendMessage').find((c) => c.params.chat_id === SUPPORT)
    assert.match(String(bobCard?.params.text), /Тема: Возврат денег/)

    tg.reset()
    await send(press('c:pay', privateMsg(alice).message, alice))
    assert.deepEqual(
      tg.of('sendMessage').map((c) => [c.params.message_thread_id, c.params.text]),
      [[101, T.categoryStaff('Оплата и подписка')]],
    )
  })
})

describe('кнопки: защита от подделки', () => {
  beforeEach(async () => {
    await send(privateMsg(alice, { text: 'вопрос' }))
    tg.reset()
  })

  it('действия сотрудника из лички, чужие данные и категории в группе — только ответ на нажатие', async () => {
    await send(
      press('a:ban', privateMsg(alice).message, alice),
      press('a:drop', topicMsg(101).message),
      press('s:nope', topicMsg(101).message),
      press('c:pay', topicMsg(101).message),
      press('a:ban:222', topicMsg(101).message),
      press('a:ban', undefined),
    )
    assert.deepEqual([...new Set(tg.calls.map((c) => c.method))], ['answerCallbackQuery'])
    assert.equal(store.getUser(alice.id)?.banned, false)
  })

  it('нажатие на чужое сообщение в личке и кнопки других ботов игнорируются', async () => {
    const someoneElse = privateMsg(bob).message
    await send(press('c:pay', someoneElse, alice), press('a:ban', topicMsg(101).message, { id: 5, is_bot: true, first_name: 'b' }))
    assert.equal(store.getUser(alice.id)?.category, null)
    assert.equal(store.getUser(alice.id)?.banned, false)
  })

  it('кнопка в чужой группе — бот выходит; в General и в несвязанной теме — без действий', async () => {
    const foreign = topicMsg(101).message
    foreign!.chat = { id: -100777, type: 'supergroup' }
    await send(press('a:ban', foreign), press('a:ban', topicMsg(0, { is_topic_message: undefined, message_thread_id: undefined }).message))
    assert.deepEqual(tg.last('leaveChat')?.params, { chat_id: -100777 })
    await send(press('a:ban', topicMsg(555).message))
    assert.equal(tg.last('sendMessage')?.params.text, T.noUser)
    assert.equal(store.getUser(alice.id)?.banned, false)
  })

  it('пользователь не может спамить кнопками сверх лимита', async () => {
    bot = make({ rateLimitPerMinute: 2 })
    for (let i = 0; i < 5; i++) await send(press('c:pay', privateMsg(alice).message, alice))
    assert.equal(tg.of('editMessageText').length, 2)
  })
})
