import { describe, expect, it } from 'vitest'
import { asksForImage } from '@/api/mocks'
import iconSrc from '@/components/ui/Icon.vue?raw'
import { SUGGESTIONS, pickSuggestions, seeded } from '../suggestions'

describe('быстрые вопросы', () => {
  it('пул: без повторов, короткие, без длинного тире и внутренних моделей, иконки существуют', () => {
    expect(SUGGESTIONS.length).toBeGreaterThanOrEqual(24)
    expect(new Set(SUGGESTIONS.map((s) => s.text)).size).toBe(SUGGESTIONS.length)
    for (const s of SUGGESTIONS) {
      expect(s.text.length, s.text).toBeLessThanOrEqual(52)
      expect(s.text).not.toMatch(/—|Luna|GPT|OSS|Flare|Astra/)
      expect(iconSrc, s.icon).toMatch(new RegExp(`\\n\\s+${s.icon}: '`))
    }
  })

  it('«нарисуй» распознаются как просьба о картинке, текстовые нет', () => {
    for (const s of SUGGESTIONS) expect(asksForImage(s.text), s.text).toBe(s.kind === 'draw')
  })

  it('без изображений только текстовые; с изображениями одна «нарисуй» и одна «с фото» не первыми', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const text = pickSuggestions({ media: false, count: 6, seed })
      expect(text).toHaveLength(6)
      expect(new Set(text).size).toBe(6)
      expect(text.every((s) => s.kind === 'ask' || s.kind === 'fill')).toBe(true)
      expect(text.filter((s) => s.kind === 'fill').length).toBeLessThanOrEqual(1)

      const media = pickSuggestions({ media: true, count: 6, seed })
      expect(media).toHaveLength(6)
      expect(new Set(media).size).toBe(6)
      expect(media.map((s) => s.kind).filter((k) => k === 'draw' || k === 'photo')).toEqual(['draw', 'photo'])
      expect(media[1]!.kind).toBe('draw')
      expect(media[3]!.kind).toBe('photo')
    }
  })

  it('одна раскладка на seed, а за разные заходы показывается весь пул', () => {
    expect(pickSuggestions({ media: true, count: 6, seed: 42 })).toEqual(pickSuggestions({ media: true, count: 6, seed: 42 }))
    const seen = new Set<string>()
    for (let seed = 0; seed < 500; seed++) for (const s of pickSuggestions({ media: true, count: 6, seed })) seen.add(s.text)
    expect(seen.size).toBe(SUGGESTIONS.length)
    const r = seeded(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('маленький пул и count больше пула не ломают выбор', () => {
    const pool = [
      { icon: 'pen', kind: 'ask' as const, text: 'a' },
      { icon: 'spark', kind: 'draw' as const, text: 'b' },
    ]
    expect(pickSuggestions({ media: true, count: 6, seed: 1 }, pool).map((s) => s.text)).toEqual(['a', 'b'])
    expect(pickSuggestions({ media: false, count: 6, seed: 1 }, pool).map((s) => s.text)).toEqual(['a'])
    expect(pickSuggestions({ media: true, count: 0, seed: 1 }, pool)).toEqual([])
  })
})
