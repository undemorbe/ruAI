/**
 * Пароли: scrypt из node:crypto. Формат `scrypt$N$r$p$salt$hash` (base64url): параметры в строке,
 * чтобы их можно было поднять без миграции. «!» - недействительный хэш (вход только после сброса).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 32768
const R = 8
const P = 1
const KEYLEN = 32
const MAXMEM = 64 * 1024 * 1024

const scrypt = (pw: string, salt: Buffer, opt: ScryptOptions) =>
  new Promise<Buffer>((ok, fail) => scryptCb(pw.normalize('NFKC'), salt, KEYLEN, opt, (e, k) => (e ? fail(e) : ok(k))))

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(pw, salt, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([\w-]+)\$([\w-]+)$/.exec(stored)
  if (!m) return false
  // чужие параметры (подмена строки в БД) не должны съесть память или CPU
  if (Number(m[1]) !== N || Number(m[2]) !== R || Number(m[3]) !== P) return false
  const want = Buffer.from(m[5]!, 'base64url')
  if (want.length !== KEYLEN) return false
  const got = await scrypt(pw, Buffer.from(m[4]!, 'base64url'), { N, r: R, p: P, maxmem: MAXMEM })
  return timingSafeEqual(got, want)
}

/** Для несуществующего логина: столько же работы, ответ всегда false. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${'A'.repeat(22)}$${'A'.repeat(43)}`
