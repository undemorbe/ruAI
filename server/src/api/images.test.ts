import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grantSubscription } from './billing.ts'
import { probe, sanitize, sniff, stripMetadata } from './images.ts'
import { ORIGIN, setup } from './testkit.ts'

const seg = (marker: number, payload: Buffer) => {
  const h = Buffer.alloc(4)
  h[0] = 0xff
  h[1] = marker
  h.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([h, payload])
}

/** Минимальный JPEG: JFIF, EXIF с «геопозицией», SOF0 с размерами, скан. */
export function jpeg(w = 640, h = 480) {
  const sof = Buffer.alloc(6)
  sof[0] = 8
  sof.writeUInt16BE(h, 1)
  sof.writeUInt16BE(w, 3)
  sof[5] = 1
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPS:55.75,37.61 SECRET', 'latin1')),
    seg(0xfe, Buffer.from('comment SECRET', 'latin1')),
    seg(0xc0, Buffer.concat([sof, Buffer.from([1, 0x11, 0])])),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
  ])
}

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
}
function png(w = 100, h = 50) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Author\0SECRET', 'latin1')),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const riffChunk = (type: string, data: Buffer) => {
  const h = Buffer.alloc(8)
  h.write(type, 0, 'latin1')
  h.writeUInt32LE(data.length, 4)
  return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)])
}
function webp(w = 300, h = 200) {
  const x = Buffer.alloc(10)
  x[0] = 0x08 | 0x04 // EXIF + XMP
  x.writeUIntLE(w - 1, 4, 3)
  x.writeUIntLE(h - 1, 7, 3)
  const body = Buffer.concat([riffChunk('VP8X', x), riffChunk('VP8L', Buffer.from([0x2f, 0, 0, 0, 0])), riffChunk('EXIF', Buffer.from('GPS SECRET')), riffChunk('XMP ', Buffer.from('<x>SECRET</x>'))])
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(4 + body.length, 4)
  head.write('WEBP', 8, 'latin1')
  return Buffer.concat([head, body])
}

test('тип — по содержимому; размеры; слишком большие и не-картинки отклоняются', () => {
  assert.equal(sniff(jpeg()), 'image/jpeg')
  assert.equal(sniff(png()), 'image/png')
  assert.equal(sniff(webp()), 'image/webp')
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.equal(sniff(Buffer.from('GIF89a')), null)
  assert.deepEqual(probe(jpeg(640, 480)), { mime: 'image/jpeg', width: 640, height: 480 })
  assert.deepEqual(probe(png(100, 50)), { mime: 'image/png', width: 100, height: 50 })
  assert.deepEqual(probe(webp(300, 200)), { mime: 'image/webp', width: 300, height: 200 })
  assert.equal(probe(png(9000, 10)), null)
  assert.equal(probe(png(7000, 7000)), null, 'больше 40 Мп')
  assert.equal(sanitize(Buffer.concat([jpeg().subarray(0, 30)])), null, 'обрезанный файл')
})

test('метаданные удаляются: EXIF/GPS, XMP, комментарии', () => {
  for (const [b, mime] of [
    [jpeg(), 'image/jpeg'],
    [png(), 'image/png'],
    [webp(), 'image/webp'],
  ] as const) {
    assert.ok(b.includes('SECRET'))
    const out = stripMetadata(b, mime)
    assert.ok(!out.includes('SECRET'), mime)
    assert.ok(probe(out), `${mime} остаётся валидным`)
  }
  const w = stripMetadata(webp(), 'image/webp')
  assert.equal(w.readUInt32LE(4), w.length - 8, 'размер RIFF пересчитан')
  assert.equal(w[20]! & 0x0c, 0, 'флаги EXIF/XMP сняты')
})

function multipart(file: Buffer, name = 'photo.jpg', type = 'image/jpeg') {
  const boundary = '----ruaitest'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, type: `multipart/form-data; boundary=${boundary}` }
}

async function upload(t: ReturnType<typeof setup>, file: Buffer, name?: string, type?: string) {
  const m = multipart(file, name, type)
  return t.app.inject({ method: 'POST', url: '/api/uploads', payload: m.body, headers: { 'content-type': m.type, 'x-requested-with': 'ruai', origin: ORIGIN, cookie: t.cookie } })
}

test('загрузка: только media, только картинки, метаданные вычищены, доступ только владельцу', async () => {
  const t = setup()
  const userId = await t.register()
  assert.equal((await upload(t, jpeg())).json().code, 'no_subscription')
  grantSubscription(t.db, { userId, tier: 'text', planId: 'week', now: t.clock.t })
  assert.equal((await upload(t, jpeg())).json().code, 'media_required')
  grantSubscription(t.db, { userId, tier: 'media', planId: 'week', now: t.clock.t })

  const svg = await upload(t, Buffer.from('<svg onload="alert(1)"/>'), 'x.jpg', 'image/jpeg')
  assert.equal(svg.statusCode, 415)
  assert.equal(svg.json().code, 'bad_image')
  assert.equal((await upload(t, Buffer.concat([jpeg(), Buffer.alloc(11 * 1024 * 1024)]))).statusCode, 415, 'больше 10 МБ')

  const ok = await upload(t, jpeg(), '../../etc/passwd')
  assert.equal(ok.statusCode, 200)
  const ref = ok.json() as { id: string; url: string; width: number; source: string }
  assert.match(ref.id, /^img_[\w-]{20}$/)
  assert.equal(ref.url, `/api/images/${ref.id}`)
  assert.equal(ref.width, 640)
  const stored = t.files.read(ref.id)!
  assert.ok(!stored.includes('SECRET'))

  const get = await t.app.inject({ method: 'GET', url: ref.url, headers: { cookie: t.cookie } })
  assert.equal(get.statusCode, 200)
  assert.equal(get.headers['content-type'], 'image/jpeg')
  assert.match(String(get.headers['content-security-policy']), /sandbox/)
  assert.equal(get.headers['x-content-type-options'], 'nosniff')

  const mine = t.cookie
  t.cookie = ''
  const otherId = await t.register('other')
  assert.equal((await t.app.inject({ method: 'GET', url: ref.url, headers: { cookie: t.cookie } })).statusCode, 404)
  assert.equal((await t.app.inject({ method: 'GET', url: ref.url })).statusCode, 404)
  // чужое фото нельзя приложить к своему сообщению
  grantSubscription(t.db, { userId: otherId, tier: 'media', planId: 'week', now: t.clock.t })
  assert.equal((await t.req('POST', '/api/chats/messages', { chatId: null, content: 'что тут', images: [ref.id] })).json().code, 'bad_image')
  t.cookie = mine
})

test('анализ фото: картинка уходит в модель только с текущим сообщением, удаление чата удаляет файлы', async () => {
  const t = setup()
  const userId = await t.register()
  grantSubscription(t.db, { userId, tier: 'media', planId: 'week', now: t.clock.t })
  const ref = (await upload(t, jpeg())).json() as { id: string }
  const r = await t.req('POST', '/api/chats/messages', { chatId: null, content: '', images: [ref.id] })
  assert.equal(r.statusCode, 200)
  const call = t.llm.calls[0]!
  assert.equal(call.model, 'm/media')
  const last = call.messages.at(-1)!
  assert.ok(Array.isArray(last.content))
  assert.match(JSON.stringify(last.content), /data:image\/jpeg;base64,/)
  assert.equal(t.db.get<{ kind: string }>('SELECT kind FROM usage_events')!.kind, 'vision')

  const chatId = (t.events(r.body)[0] as { chat: { id: string } }).chat.id
  const msgs = (await t.req('GET', `/api/chats/${chatId}/messages`)).json() as { images?: { id: string }[] }[]
  assert.equal(msgs[0]!.images![0]!.id, ref.id)
  // одно фото — одно сообщение
  t.clock.t += 61_000
  assert.equal((await t.req('POST', '/api/chats/messages', { chatId, content: 'ещё', images: [ref.id] })).json().code, 'bad_image')

  await t.req('DELETE', `/api/chats/${chatId}`)
  assert.equal(t.files.read(ref.id), null)
})

test('генерация: картинка проверяется, сохраняется, считается отдельно; пустой результат не списывается', async () => {
  const t = setup()
  const userId = await t.register()
  grantSubscription(t.db, { userId, tier: 'media', planId: 'week', now: t.clock.t })
  t.llm.imageResult = { images: [png(512, 512), Buffer.from('not an image')], text: 'Готово', usage: { tokensIn: 10, tokensOut: 1000, costUsd: 0.04 } }
  const ev = t.events((await t.req('POST', '/api/chats/messages', { chatId: null, content: 'кот в шляпе', mode: 'image' })).body)
  assert.deepEqual(
    ev.map((e) => e.type),
    ['chat', 'image', 'done'],
  )
  const done = ev.at(-1) as { message: { images: { source: string }[] }; usage: { generationsUsed: number } }
  assert.equal(done.message.images.length, 1)
  assert.equal(done.message.images[0]!.source, 'generated')
  assert.equal(done.usage.generationsUsed, 1)
  assert.equal(t.llm.calls[0]!.model, 'm/image')

  t.clock.t += 61_000
  t.llm.imageResult = { images: [], text: '', usage: { tokensIn: 10, tokensOut: 0, costUsd: 0.002 } }
  const ev2 = t.events((await t.req('POST', '/api/chats/messages', { chatId: null, content: 'ещё', mode: 'image' })).body)
  assert.equal(ev2.at(-1)!.type, 'error')
  const sub = t.db.get<{ gen_used: number; total_used: number; spent_usd: number }>('SELECT gen_used, total_used, spent_usd FROM subscriptions WHERE tier = ?', 'media')!
  assert.equal(sub.gen_used, 1)
  assert.equal(sub.total_used, 1)
  assert.equal(Math.round(sub.spent_usd * 1000), 42, 'фактический расход учтён даже без результата')
})
