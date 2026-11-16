import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, cleanCode, isCode, isEmail, loginError, normalizeEmail, normalizeLogin, passwordError, safeNext } from '../auth'

describe('auth rules', () => {
  it('email: normalised and validated', () => {
    expect(normalizeEmail('  Ivan@Mail.RU ')).toBe('ivan@mail.ru')
    for (const ok of ['a@b.ru', 'ivan.petrov+ai@mail.co.uk', ' User@Example.com ']) expect(isEmail(ok)).toBe(true)
    for (const bad of ['', 'a@b', 'a b@c.ru', 'a@@b.ru', '@b.ru', 'a@.ru', 'a@b.r', `${'x'.repeat(65)}@b.ru`, `a@${'d'.repeat(250)}.ru`])
      expect(isEmail(bad), bad).toBe(false)
  })

  it('code: pasted with spaces or dashes is cleaned to 6 digits', () => {
    expect(cleanCode('123 456')).toBe('123456')
    expect(cleanCode('123-4567')).toBe('123456')
    expect(isCode('123456')).toBe(true)
    expect(isCode('12345')).toBe(false)
    expect(isCode('12345a')).toBe(false)
  })

  it('next: only same-site paths, never auth screens (open redirect)', () => {
    expect(safeNext('/chat/abc?x=1#y')).toBe('/chat/abc?x=1#y')
    expect(safeNext('/pricing')).toBe('/pricing')
    for (const bad of [
      undefined,
      ['/chat'],
      '',
      'chat',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/%0d%0aLocation:x'.replace('%0d%0a', '\r\n'),
      'javascript:alert(1)',
      '/login',
      '/login?next=/chat',
      '/register',
      '/reset',
      '/' + 'a'.repeat(600),
    ])
      expect(safeNext(bad), String(bad)).toBe('/chat')
    expect(safeNext('//evil', '/')).toBe('/')
  })

  it('login: нормализуется, 3-32 символа a-z 0-9 . _ -, начало с буквы или цифры', () => {
    expect(normalizeLogin('  Boris_01 ')).toBe('boris_01')
    expect(loginError('bo')).toMatch(/от 3/)
    expect(loginError('a'.repeat(33))).toMatch(/до 32/)
    expect(loginError('_boris')).toMatch(/букв/)
    expect(loginError('борис')).toMatch(/латиниц/)
    expect(loginError('bo ris')).toMatch(/латиниц/)
    expect(loginError('boris.k-1_')).toBeNull()
    expect(loginError(' Boris ')).toBeNull()
  })

  it('login: служебные заняты', () => {
    for (const l of ['admin', 'Support', 'root', 'ruai', 'chatgpt', 'system']) expect(loginError(l), l).toMatch(/занят/)
  })

  it('password: 8-128 символов, не равен логину', () => {
    expect(passwordError('1234567', 'boris')).toMatch(/не короче 8/)
    expect(passwordError('x'.repeat(129), 'boris')).toMatch(/не длиннее 128/)
    expect(passwordError('Boris123', 'boris123')).toMatch(/логин/)
    expect(passwordError('correct horse', 'boris')).toBeNull()
  })

  it('code: 6 цифр', () => expect(CODE_LENGTH).toBe(6))
})
