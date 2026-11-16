/**
 * Картинки: проверка по содержимому (не по имени и не по Content-Type), размеры,
 * удаление метаданных (EXIF с геопозицией, XMP, комментарии). Только JPEG, PNG, WebP.
 * HEIC браузер перекодирует в JPEG перед загрузкой.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Mime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface Probe {
  mime: Mime
  width: number
  height: number
}

export const MAX_SIDE = 8000
export const MAX_PIXELS = 40_000_000

export function sniff(b: Buffer): Mime | null {
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]!
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2
      continue
    }
    const len = b.readUInt16BE(i + 2)
    // SOF0–SOF15, кроме DHT (C4), JPG (C8), DAC (CC)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

function webpSize(b: Buffer): { width: number; height: number } | null {
  const fourcc = b.toString('latin1', 12, 16)
  if (fourcc === 'VP8X' && b.length >= 30) return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
  if (fourcc === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = b.readUInt32LE(21)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  if (fourcc === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  }
  return null
}

export function probe(b: Buffer): Probe | null {
  const mime = sniff(b)
  if (!mime) return null
  const size = mime === 'image/jpeg' ? jpegSize(b) : mime === 'image/png' ? (b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR' ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null) : webpSize(b)
  if (!size || size.width < 1 || size.height < 1) return null
  if (size.width > MAX_SIDE || size.height > MAX_SIDE || size.width * size.height > MAX_PIXELS) return null
  return { mime, ...size }
}

/** JPEG: выкидываем APP1–APP15 (EXIF, XMP, ICC, Photoshop) и COM до начала данных скана. */
function stripJpeg(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)]
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('jpeg: bad marker')
    const m = b[i + 1]!
    if (m === 0xda) {
      out.push(b.subarray(i))
      return Buffer.concat(out)
    }
    const len = b.readUInt16BE(i + 2)
    if (len < 2 || i + 2 + len > b.length) throw new Error('jpeg: bad segment')
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe
    if (!drop) out.push(b.subarray(i, i + 2 + len))
    i += 2 + len
  }
  throw new Error('jpeg: no scan')
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])
function stripPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)]
  let i = 8
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i)
    const type = b.toString('latin1', i + 4, i + 8)
    const end = i + 12 + len
    if (end > b.length) throw new Error('png: bad chunk')
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') return Buffer.concat(out)
  }
  throw new Error('png: no IEND')
}

function stripWebp(b: Buffer): Buffer {
  if (b.toString('latin1', 12, 16) !== 'VP8X') return b // простой WebP метаданных не несёт
  const chunks: Buffer[] = []
  let i = 12
  while (i + 8 <= b.length) {
    const type = b.toString('latin1', i, i + 4)
    const len = b.readUInt32LE(i + 4)
    const end = i + 8 + len + (len & 1)
    if (i + 8 + len > b.length) throw new Error('webp: bad chunk')
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(Buffer.from(b.subarray(i, Math.min(end, b.length))))
    i = end
  }
  const vp8x = chunks[0]!
  vp8x[8] = vp8x[8]! & ~(0x08 | 0x04) // флаги EXIF и XMP
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(4 + body.length, 4)
  head.write('WEBP', 8, 'latin1')
  return Buffer.concat([head, body])
}

export function stripMetadata(b: Buffer, mime: Mime): Buffer {
  return mime === 'image/jpeg' ? stripJpeg(b) : mime === 'image/png' ? stripPng(b) : stripWebp(b)
}

/** Проверка + очистка. null — не картинка, битая или слишком большая. */
export function sanitize(b: Buffer): (Probe & { data: Buffer }) | null {
  const p = probe(b)
  if (!p) return null
  try {
    const data = stripMetadata(b, p.mime)
    return probe(data) ? { ...p, data } : null
  } catch {
    return null
  }
}

/** Файлы лежат по id (случайный, без пользовательских символов) — обход каталогов невозможен. */
export class ImageFiles {
  readonly dir: string
  constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true, mode: 0o770 })
  }
  private path(id: string) {
    if (!/^img_[A-Za-z0-9_-]{20}$/.test(id)) throw new Error('bad image id')
    return join(this.dir, id)
  }
  write(id: string, data: Buffer) {
    writeFileSync(this.path(id), data, { mode: 0o640 })
  }
  read(id: string): Buffer | null {
    try {
      return readFileSync(this.path(id))
    } catch {
      return null
    }
  }
  remove(id: string) {
    try {
      rmSync(this.path(id), { force: true })
    } catch {
      /* уже удалён */
    }
  }
}
