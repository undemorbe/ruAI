import { describe, expect, it } from 'vitest'
import { perDay, pluralRu, splitBlocks } from '../format'

describe('format', () => {
  it('price per day', () => {
    expect(perDay(388, 7)).toBe(55)
    expect(perDay(100, 0)).toBe(100)
  })

  it('russian plurals', () => {
    const f: [string, string, string] = ['день', 'дня', 'дней']
    expect(pluralRu(1, f)).toBe('день')
    expect(pluralRu(3, f)).toBe('дня')
    expect(pluralRu(5, f)).toBe('дней')
    expect(pluralRu(11, f)).toBe('дней')
    expect(pluralRu(21, f)).toBe('день')
    expect(pluralRu(112, f)).toBe('дней')
  })

  it('splits fenced code from text', () => {
    const b = splitBlocks('Вот так:\n```ts\nconst a = 1\n```\nГотово')
    expect(b).toEqual([
      { kind: 'text', text: 'Вот так:\n' },
      { kind: 'code', lang: 'ts', text: 'const a = 1' },
      { kind: 'text', text: '\nГотово' },
    ])
  })

  it('keeps an unclosed fence while streaming', () => {
    const b = splitBlocks('```py\nprint(1)')
    expect(b).toEqual([{ kind: 'code', lang: 'py', text: 'print(1)' }])
  })
})
