import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BrandMark from '../ui/BrandMark.vue'
import { MARK_PATH } from '@/content/brand'

describe('BrandMark (traced mark, evenodd fill)', () => {
  it('plain: one filled path in currentColor, no stroke', () => {
    const paths = mount(BrandMark).findAll('path')
    expect(paths).toHaveLength(1)
    const p = paths[0]!
    expect(p.attributes('d')).toBe(MARK_PATH)
    expect(p.attributes('fill')).toBe('currentColor')
    expect(p.attributes('fill-rule')).toBe('evenodd')
    expect(p.attributes('stroke')).toBeUndefined()
  })

  it('tile: rect in currentColor, mark filled with the on-tile colour and scaled to 86%', () => {
    const w = mount(BrandMark, { props: { tile: true } })
    expect(w.find('rect').attributes('fill')).toBe('currentColor')
    const p = w.find('path')
    expect(p.classes()).toContain('bm__on-tile--fill')
    expect(p.attributes('fill-rule')).toBe('evenodd')
    expect(p.attributes('stroke-width')).toBeUndefined()
    expect(p.attributes('transform')).toContain('scale(.86)')
  })
})
