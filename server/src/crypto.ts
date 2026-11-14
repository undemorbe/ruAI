/**
 * Пароль (scrypt) и одноразовые коды TOTP (RFC 6238) на node:crypto, без сторонних пакетов.
 */
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, opts, (e, key) => (e ? rej(e) : res(key))))

const N = 2 ** 17
const R = 8
const P = 1
const KEYLEN = 64
const MAXMEM = 256 * 1024 * 1024

/** Хеш вида `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

/** Пустышка для неизвестного логина: время ответа не выдаёт, существует ли он. */
const DUMMY = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEYLEN).toString('base64')}`

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? DUMMY).split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string]
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  })
  return stored !== null && key.length === expected.length && timingSafeEqual(key, expected)
}

// ---------- TOTP ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error('TOTP-секрет не в base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newTotpSecret = () => base32Encode(randomBytes(20))

const STEP = 30

/** Код для шага времени (HMAC-SHA1, 6 цифр — как Google Authenticator, Aegis, 1Password). */
export function totpAt(secret: Buffer, step: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1]! & 15
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!
  return String(bin % 1_000_000).padStart(6, '0')
}

/**
 * Проверка кода с окном ±1 шаг (часы телефона могут отставать). Возвращает шаг, на котором
 * код совпал, или null. Шаг ≤ lastStep отклоняется — один код нельзя использовать дважды.
 */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), lastStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const secret = base32Decode(secretB32)
  const cur = Math.floor(now / 1000 / STEP)
  const given = Buffer.from(code)
  let hit: number | null = null
  for (const step of [cur - 1, cur, cur + 1]) {
    // сравниваем все три без раннего выхода
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), given) && step > lastStep) hit = step
  }
  return hit
}

export const otpauthUri = (secretB32: string, account: string, issuer = 'ruAI admin') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`

export const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url')
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** Сравнение строк за постоянное время (длины уравниваем хешем). */
export const safeEqual = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)))
