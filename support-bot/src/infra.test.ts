import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkSupportChat, registerCommands } from './checks.ts'
import { loadConfig } from './config.ts'
import { RateLimiter } from './limiter.ts'
import { cardKeyboard, categoriesKeyboard, parseCallback, templatesKeyboard } from './keyboards.ts'
import { createLogger } from './log.ts'
import { pollUpdates } from './poller.ts'
import { SendQueue } from './queue.ts'
import { SupportStore } from './store.ts'
import { type TelegramApi, TelegramError, createApi, isThreadGone, isTopicClosed } from './telegram.ts'
import { FakeTg, SUPPORT, alice } from './testing.ts'
import { escapeHtml, topicName, userCard } from './texts.ts'

const TOKEN = '1234567890:AAH9xYz_abcdefghijklmnopqrstuvwxyz12'

describe('config', () => {
  const ok = { BOT_TOKEN: TOKEN, SUPPORT_CHAT_ID: String(SUPPORT) }

  it('читает обязательные и значения по умолчанию', () => {
    const c = loadConfig(ok)
    assert.equal(c.token, TOKEN)
    assert.equal(c.supportChatId, SUPPORT)
    assert.equal(c.apiBase, 'https://api.telegram.org')
    assert.equal(c.dataDir, '/var/lib/ruai-support-bot')
    assert.equal(c.rateLimitPerMinute, 20)
  })

  it('без переменных — понятная ошибка', () => {
    assert.throws(() => loadConfig({}), /BOT_TOKEN не задан[\s\S]*SUPPORT_CHAT_ID не задан/)
  })

  it('неверные значения отклоняются, и значение токена не попадает в текст ошибки', () => {
    const bad = 'not-a-token-but-secret-value-123'
    try {
      loadConfig({ BOT_TOKEN: bad, SUPPORT_CHAT_ID: '12345', RATE_LIMIT_PER_MINUTE: '0' })
      assert.fail('ожидалась ошибка')
    } catch (e) {
      const msg = (e as Error).message
      assert.match(msg, /BOT_TOKEN: неверный формат/)
      assert.match(msg, /SUPPORT_CHAT_ID: ожидается/)
      assert.match(msg, /RATE_LIMIT_PER_MINUTE/)
      assert.ok(!msg.includes(bad))
    }
  })

  it('TELEGRAM_API_BASE: https или http только на localhost', () => {
    assert.equal(loadConfig({ ...ok, TELEGRAM_API_BASE: 'http://127.0.0.1:8081/' }).apiBase, 'http://127.0.0.1:8081')
    assert.throws(() => loadConfig({ ...ok, TELEGRAM_API_BASE: 'http://evil.example' }), /TELEGRAM_API_BASE/)
    assert.throws(() => loadConfig({ ...ok, TELEGRAM_API_BASE: 'https://x.example/path' }), /TELEGRAM_API_BASE/)
  })
})

describe('telegram client', () => {
  const fakeFetch = (respond: (url: string, body: unknown) => Response | Promise<Response>) =>
    (async (url: string | URL | Request, init?: RequestInit) => respond(String(url), JSON.parse(String(init?.body)))) as typeof fetch

  it('успешный вызов: POST JSON на /bot<token>/<method>', async () => {
    let seen = ''
    const api = createApi(TOKEN, 'https://api.telegram.org', fakeFetch((url, body) => {
      seen = url
      assert.deepEqual(body, { chat_id: 1, text: 'hi' })
      return Response.json({ ok: true, result: { message_id: 5 } })
    }))
    assert.deepEqual(await api.call('sendMessage', { chat_id: 1, text: 'hi' }), { message_id: 5 })
    assert.equal(seen, `https://api.telegram.org/bot${TOKEN}/sendMessage`)
  })

  it('ошибка API: код, описание и retry_after', async () => {
    const api = createApi(TOKEN, undefined, fakeFetch(() =>
      Response.json({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 7', parameters: { retry_after: 7 } }, { status: 429 }),
    ))
    await assert.rejects(api.call('sendMessage'), (e) => e instanceof TelegramError && e.code === 429 && e.retryAfter === 7)
  })

  it('сбой сети и не-JSON: токен в тексте ошибки вырезан', async () => {
    const net = createApi(TOKEN, undefined, (async () => {
      throw new Error(`connect failed https://api.telegram.org/bot${TOKEN}/getMe`)
    }) as typeof fetch)
    await assert.rejects(net.call('getMe'), (e) => e instanceof TelegramError && e.code === 0 && !e.message.includes(TOKEN) && e.message.includes('***'))

    const html = createApi(TOKEN, undefined, fakeFetch(() => new Response('<html>502</html>', { status: 502 })))
    await assert.rejects(html.call('getMe'), (e) => e instanceof TelegramError && e.code === 502)
  })

  it('распознаёт удалённую и закрытую тему', () => {
    assert.ok(isThreadGone(new TelegramError(400, 'Bad Request: message thread not found')))
    assert.ok(isThreadGone(new TelegramError(400, 'Bad Request: TOPIC_DELETED')))
    assert.ok(!isThreadGone(new TelegramError(400, 'Bad Request: chat not found')))
    assert.ok(isTopicClosed(new TelegramError(400, 'Bad Request: TOPIC_CLOSED')))
  })
})

describe('очередь отправки', () => {
  function setup(fail: (n: number) => unknown) {
    const tg = new FakeTg()
    let n = 0
    tg.handlers.sendMessage = () => {
      const err = fail(n++)
      if (err) throw err
      return { message_id: n }
    }
    const sleeps: number[] = []
    let now = 0
    const q = new SendQueue(tg, {
      minIntervalMs: 0,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
    })
    return { tg, q, sleeps }
  }

  it('429: ждёт retry_after и повторяет', async () => {
    const { tg, q, sleeps } = setup((n) => (n === 0 ? new TelegramError(429, 'Too Many Requests', 3) : null))
    await q.call('sendMessage', { chat_id: 1 })
    assert.equal(tg.of('sendMessage').length, 2)
    assert.deepEqual(sleeps, [3100])
  })

  it('слишком долгий retry_after и 400 не повторяются', async () => {
    const long = setup(() => new TelegramError(429, 'flood', 10_000))
    await assert.rejects(long.q.call('sendMessage', { chat_id: 1 }), TelegramError)
    assert.equal(long.tg.of('sendMessage').length, 1)

    const bad = setup(() => new TelegramError(400, 'Bad Request'))
    await assert.rejects(bad.q.call('sendMessage', { chat_id: 1 }))
    assert.equal(bad.tg.of('sendMessage').length, 1)
  })

  it('5xx и сеть: экспоненциальная пауза, затем сдаётся', async () => {
    const { tg, q, sleeps } = setup(() => new TelegramError(502, 'Bad Gateway'))
    await assert.rejects(q.call('sendMessage', { chat_id: 1 }))
    assert.equal(tg.of('sendMessage').length, 6)
    assert.deepEqual(sleeps, [1000, 2000, 4000, 8000, 16000])
  })

  it('в один чат — строго по порядку; пауза одного чата не держит другой', async () => {
    const tg = new FakeTg()
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    tg.handlers.sendMessage = async (p) => {
      if (p.text === 'a1') await gate
      order.push(String(p.text))
      return { message_id: 1 }
    }
    const q = new SendQueue(tg, { minIntervalMs: 0 })
    const all = [q.call('sendMessage', { chat_id: 1, text: 'a1' }), q.call('sendMessage', { chat_id: 1, text: 'a2' }), q.call('sendMessage', { chat_id: 2, text: 'b1' })]
    await new Promise((r) => setTimeout(r, 5))
    assert.deepEqual(order, ['b1'])
    release()
    await Promise.all(all)
    await q.idle()
    assert.deepEqual(order, ['b1', 'a1', 'a2'])
  })

  it('минимальный интервал между запросами', async () => {
    const tg = new FakeTg()
    const sleeps: number[] = []
    const q = new SendQueue(tg, { minIntervalMs: 40, now: () => 1000, sleep: async (ms) => void sleeps.push(ms) })
    await Promise.all([q.call('sendMessage', { chat_id: 1 }), q.call('sendMessage', { chat_id: 2 }), q.call('sendMessage', { chat_id: 3 })])
    assert.deepEqual(sleeps, [40, 80])
  })
})

describe('лимитер', () => {
  it('ok до лимита, одно warn, дальше drop; окно скользит', () => {
    const l = new RateLimiter(2, 1000)
    assert.deepEqual([l.hit('u', 0), l.hit('u', 100), l.hit('u', 200), l.hit('u', 300)], ['ok', 'ok', 'warn', 'drop'])
    assert.equal(l.hit('other', 300), 'ok')
    assert.equal(l.hit('u', 1001), 'ok', 'первое событие вышло из окна')
    assert.equal(l.hit('u', 1002), 'warn', 'после ok предупреждение снова возможно')
  })

  it('reset и sweep', () => {
    const l = new RateLimiter(1, 1000)
    l.hit('a', 0)
    l.hit('b', 900)
    l.reset('b')
    assert.equal(l.hit('b', 901), 'ok')
    l.sweep(1500)
    assert.equal(l.size, 1)
  })
})

describe('хранилище', () => {
  it('пользователь, тема, бан, закрытие, сообщения', () => {
    const s = new SupportStore(':memory:')
    const u = s.touchUser(alice, 1000)
    assert.equal(u.firstSeen, 1000)
    assert.equal(u.threadId, null)
    s.touchUser({ ...alice, username: 'alice_new' }, 2000)
    assert.equal(s.getUser(alice.id)?.username, 'alice_new')
    assert.equal(s.getUser(alice.id)?.firstSeen, 1000, 'дата первого обращения не меняется')

    s.setThread(alice.id, 42)
    assert.equal(s.getUserByThread(42)?.userId, alice.id)
    s.setClosed(alice.id, true)
    s.setBanned(alice.id, true)
    assert.deepEqual([s.getUser(alice.id)?.closed, s.getUser(alice.id)?.banned], [true, true])
    s.setThread(alice.id, null)
    assert.equal(s.getUserByThread(42), undefined)
    assert.equal(s.getUser(alice.id)?.closed, false)
    s.setStatus(alice.id, 'work')
    s.setCategory(alice.id, 'pay')
    assert.deepEqual([s.getUser(alice.id)?.status, s.getUser(alice.id)?.category], ['work', 'pay'])
    s.setThread(alice.id, 43)
    assert.equal(s.getUser(alice.id)?.status, 'new', 'новая тема — новое обращение')

    s.mapMessage(500, alice.id, 7, 1000)
    s.mapMessage(501, alice.id, 8, 5000)
    assert.deepEqual(s.findUserMsg(500), { userId: alice.id, userMsgId: 7 })
    assert.equal(s.findGroupMsg(alice.id, 8), 501)
    assert.equal(s.prune(2000), 1)
    assert.equal(s.findUserMsg(500), undefined)
    s.close()
  })

  it('миграция: старая база без status/category открывается и дополняется', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const path = join(mkdtempSync(join(tmpdir(), 'ruai-mig-')), 'old.db')
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE users (user_id INTEGER PRIMARY KEY, thread_id INTEGER, first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT, username TEXT, language TEXT, first_seen INTEGER NOT NULL, banned INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO users (user_id, thread_id, first_seen) VALUES (7, 70, 1);`)
    old.close()
    const s = new SupportStore(path)
    assert.deepEqual([s.getUser(7)?.threadId, s.getUser(7)?.status, s.getUser(7)?.category], [70, 'new', null])
    s.close()
    new SupportStore(path).close() // повторное открытие не падает
  })

  it('длинные поля обрезаются', () => {
    const s = new SupportStore(':memory:')
    s.touchUser({ ...alice, first_name: 'x'.repeat(10_000) }, 1)
    assert.equal(s.getUser(alice.id)?.firstName.length, 256)
    s.close()
  })
})

describe('кнопки', () => {
  it('parseCallback: только белый список', () => {
    assert.deepEqual(parseCallback('a:work'), { kind: 'staff', action: 'work' })
    assert.deepEqual(parseCallback('s:refund'), { kind: 'template', id: 'refund' })
    assert.deepEqual(parseCallback('c:other'), { kind: 'category', id: 'other' })
    for (const bad of ['a:rm', 's:x', 'c:pay2', 'a:ban:1', 'x:work', '', undefined, 'a:' + 'w'.repeat(40)]) assert.equal(parseCallback(bad), null, String(bad))
  })

  it('callback_data всех кнопок укладываются в 64 байта и разбираются обратно', () => {
    const all = [cardKeyboard({ banned: false }), cardKeyboard({ banned: true }), templatesKeyboard(), categoriesKeyboard()]
      .flatMap((k) => k.inline_keyboard.flat())
    for (const b of all) {
      assert.ok(Buffer.byteLength(b.callback_data) <= 64)
      assert.ok(parseCallback(b.callback_data), b.callback_data)
    }
  })
})

describe('тексты', () => {
  const rec = { userId: 1, threadId: null, firstName: 'Ann', lastName: null, username: null, language: null, firstSeen: 0, banned: false, closed: false, status: 'new' as const, category: null }

  it('название темы: имя + @username, обрезка до 128, запасной вариант', () => {
    assert.equal(topicName({ ...rec, username: 'ann' }), '🆕 Ann @ann')
    assert.equal(topicName({ ...rec, status: 'work' }), '🟡 Ann')
    assert.equal([...topicName({ ...rec, firstName: 'я'.repeat(300) })].length, 128)
    assert.equal(topicName({ ...rec, firstName: '‮\u0007 ' }), '🆕 Пользователь 1')
  })

  it('карточка экранирует HTML из имени', () => {
    const card = userCard({ ...rec, firstName: '<b>x</b>&' })
    assert.ok(card.includes('&lt;b&gt;x&lt;/b&gt;&amp;'))
    assert.ok(!card.includes('<b>x</b>'))
    assert.equal(escapeHtml('"<>&'), '&quot;&lt;&gt;&amp;')
  })
})

describe('журнал', () => {
  it('секреты вырезаются, переводы строк схлопываются', () => {
    const lines: string[] = []
    const log = createLogger([TOKEN], (l) => lines.push(l))
    log('poll_error', { error: `bad ${TOKEN}\nline`, user: 5 })
    assert.equal(lines[0], 'poll_error error="bad *** line" user=5')
  })
})

describe('поллер', () => {
  function fakeApi(script: ((p: Record<string, unknown>) => unknown)[]): TelegramApi & { params: Record<string, unknown>[] } {
    const params: Record<string, unknown>[] = []
    return {
      params,
      async call<T>(_m: string, p: Record<string, unknown> = {}) {
        params.push(p)
        const step = script.shift()
        if (!step) throw new Error('script ended')
        return (await step(p)) as T
      },
    }
  }

  it('сдвигает offset, переживает 409 и останавливается по сигналу', async () => {
    const ac = new AbortController()
    const got: number[] = []
    const waits: number[] = []
    const api = fakeApi([
      () => [{ update_id: 10 }, { update_id: 11 }],
      () => {
        throw new TelegramError(409, 'Conflict')
      },
      () => {
        ac.abort()
        return [{ update_id: 12 }]
      },
    ])
    await pollUpdates(api, (u) => got.push(u.update_id), { signal: ac.signal, log: () => {}, sleep: async (ms) => void waits.push(ms) })
    assert.deepEqual(got, [10, 11, 12])
    assert.deepEqual(api.params.map((p) => p.offset), [0, 12, 12])
    assert.deepEqual(api.params[0]?.allowed_updates, ['message', 'my_chat_member', 'callback_query'])
    assert.deepEqual(waits, [5000])
  })

  it('401 — фатальная ошибка', async () => {
    const api = fakeApi([
      () => {
        throw new TelegramError(401, 'Unauthorized')
      },
    ])
    await assert.rejects(pollUpdates(api, () => {}, { signal: new AbortController().signal, log: () => {} }), /401/)
  })

  it('ошибка в обработчике не роняет цикл', async () => {
    const ac = new AbortController()
    const logs: string[] = []
    const api = fakeApi([
      () => {
        ac.abort()
        return [{ update_id: 1 }, { update_id: 2 }]
      },
    ])
    const seen: number[] = []
    await pollUpdates(
      api,
      (u) => {
        seen.push(u.update_id)
        if (u.update_id === 1) throw new Error('boom')
      },
      { signal: ac.signal, log: (e) => logs.push(e) },
    )
    assert.deepEqual(seen, [1, 2])
    assert.deepEqual(logs, ['update_error'])
  })
})

describe('проверка супергруппы', () => {
  const api = (chat: unknown, member: unknown): TelegramApi => ({
    async call<T>(m: string) {
      const v = m === 'getChat' ? chat : member
      if (v instanceof Error) throw v
      return v as T
    },
  })

  it('всё настроено — проблем нет', async () => {
    assert.deepEqual(await checkSupportChat(api({ type: 'supergroup', is_forum: true }, { status: 'administrator', can_manage_topics: true }), SUPPORT, 1), [])
  })

  it('нет тем, нет прав, нет доступа', async () => {
    assert.match((await checkSupportChat(api({ type: 'supergroup', is_forum: false }, { status: 'administrator', can_manage_topics: true }), SUPPORT, 1)).join(), /темы/)
    assert.match((await checkSupportChat(api({ type: 'supergroup', is_forum: true }, { status: 'administrator' }), SUPPORT, 1)).join(), /Управление темами/)
    assert.match((await checkSupportChat(api({ type: 'supergroup', is_forum: true }, { status: 'member' }), SUPPORT, 1)).join(), /не администратор/)
    assert.match((await checkSupportChat(api(new TelegramError(400, 'chat not found'), null), SUPPORT, 1)).join(), /не видит/)
  })
})

describe('меню команд', () => {
  it('пользователю — только /start, команды сотрудников — только в группе поддержки', async () => {
    const calls: Record<string, unknown>[] = []
    const api: TelegramApi = {
      async call<T>(_m: string, p: Record<string, unknown> = {}) {
        calls.push(p)
        return true as T
      },
    }
    await registerCommands(api, SUPPORT)
    const names = (i: number) => (calls[i]?.commands as { command: string }[]).map((c) => c.command)
    assert.deepEqual(calls[0]?.scope, { type: 'all_private_chats' })
    assert.deepEqual(names(0), ['start'])
    assert.deepEqual(calls[1]?.scope, { type: 'chat', chat_id: SUPPORT })
    assert.deepEqual(names(1), ['close', 'ban', 'unban', 'info', 't', 'help'])
  })
})
