import { describe, expect, it } from 'vitest'
// @ts-expect-error - генератор на чистом JS без деклараций
import { ACTIVE, activeMark, markPath, paintAttrs, SPEC, tileSvg, weave } from '../../../scripts/brand-mark.mjs'
// @ts-expect-error - генератор на чистом JS без деклараций
import { TRACED_PATH } from '../../../scripts/brand-mark-traced.mjs'
import adminFavicon from '../../../admin/public/favicon.svg?raw'
import siteFavicon from '../../../public/favicon.svg?raw'
import { MARK_PATH, MARK_STROKE } from '../brand'

const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number)

describe('brand mark: woven knot (own mark, kept for later)', () => {
  it('three links weave strictly over-under: 6 crossings, 4 per link, alternating', () => {
    const w = weave()
    expect(w.crossings).toHaveLength(6)
    expect(w.perLink).toEqual([4, 4, 4])
    expect(w.alternating).toBe(true)
    // каждое звено сверху ровно в половине своих пересечений
    for (let k = 0; k < 3; k++) {
      const mine = w.crossings.filter((c: { a: number; b: number }) => c.a === k || c.b === k)
      expect(mine.filter((c: { top: number }) => c.top === k)).toHaveLength(2)
    }
  })

  it('under-passes are cut: path has one run per crossing (6), all inside the 64×64 field', () => {
    const d = markPath()
    expect(d.match(/M/g)).toHaveLength(6)
    for (const n of numbers(d)) {
      expect(n).toBeGreaterThanOrEqual(SPEC.band / 2)
      expect(n).toBeLessThanOrEqual(64 - SPEC.band / 2)
    }
    expect(activeMark('woven')).toEqual({ d, stroke: SPEC.band })
  })
})

describe('brand mark: traced from photo (temporary)', () => {
  it('is the active mark, drawn as evenodd fill', () => {
    expect(ACTIVE).toBe('traced')
    expect(activeMark()).toEqual({ d: TRACED_PATH, stroke: 0 })
    expect(paintAttrs(activeMark(), '#fff')).toBe('fill="#fff" fill-rule="evenodd"')
    expect(paintAttrs({ stroke: 5.2 }, '#fff')).toBe('fill="none" stroke="#fff" stroke-width="5.2"')
  })

  it('closed contours: 2 outer + 6 holes, centred inside the 64×64 field', () => {
    expect(TRACED_PATH.match(/M/g)).toHaveLength(8)
    expect(TRACED_PATH.match(/Z/g)).toHaveLength(8)
    expect(TRACED_PATH).toMatch(/^[MQZ\d .-]+$/)
    const nums = numbers(TRACED_PATH)
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    for (const v of nums) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(63)
    }
    // знак вписан в 60×60 по центру
    expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(57)
    expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 32)).toBeLessThan(1)
    expect(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 32)).toBeLessThan(1)
  })

  it('throws on an unknown mark name', () => {
    expect(() => activeMark('nope')).toThrow()
  })
})

describe('brand mark: generated files', () => {
  it('are up to date with the generator', () => {
    const mark = activeMark()
    expect(MARK_PATH).toBe(mark.d)
    expect(MARK_STROKE).toBe(mark.stroke)
    expect(siteFavicon).toBe(tileSvg(mark))
    expect(adminFavicon).toBe(tileSvg(mark))
  })
})
