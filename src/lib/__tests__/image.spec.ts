import { describe, expect, it } from 'vitest'
import { UPLOAD } from '@/config/app'
import { MAX_SIDE, fitSize, isImageFile, needsReencode } from '../image'

describe('prepareUpload rules', () => {
  it('HEIC и прочие форматы перекодируются, JPEG/PNG/WebP — нет', () => {
    expect(needsReencode('image/heic', 100, 100)).toBe(true)
    expect(needsReencode('image/gif', 100, 100)).toBe(true)
    expect(needsReencode('image/jpeg', 1200, 800)).toBe(false)
    expect(needsReencode('image/webp', 1200, 800)).toBe(false)
  })
  it('большие снимки уменьшаются до 2048 по длинной стороне с сохранением пропорций', () => {
    expect(needsReencode('image/png', 4032, 3024)).toBe(true)
    expect(fitSize(4032, 3024)).toEqual({ width: MAX_SIDE, height: 1536 })
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitSize(10000, 1)).toEqual({ width: MAX_SIDE, height: 1 })
  })
  it('тяжёлый файл перекодируется, даже если стороны в пределах', () => {
    expect(needsReencode('image/png', 2000, 2000, UPLOAD.maxBytes + 1)).toBe(true)
    expect(needsReencode('image/png', 2000, 2000, UPLOAD.maxBytes)).toBe(false)
  })
  it('картинка по типу, а без типа (HEIC в части браузеров) по расширению', () => {
    expect(isImageFile({ name: 'a.pdf', type: 'image/png' })).toBe(true)
    expect(isImageFile({ name: 'IMG_1.HEIC', type: '' })).toBe(true)
    expect(isImageFile({ name: 'photo.jpeg', type: '' })).toBe(true)
    expect(isImageFile({ name: 'doc.pdf', type: 'application/pdf' })).toBe(false)
    expect(isImageFile({ name: 'notes.txt', type: '' })).toBe(false)
    expect(isImageFile({ name: 'fake.jpg', type: 'text/plain' })).toBe(false)
  })
})
