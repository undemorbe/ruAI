import { describe, expect, it, vi } from 'vitest'
import { readResetToken } from '../resetToken'

const T = 'A'.repeat(43)

describe('токен сброса из ссылки', () => {
  it('берётся из фрагмента и сразу стирается из адреса', () => {
    const history = { replaceState: vi.fn() }
    expect(readResetToken({ hash: `#${T}`, pathname: '/reset', search: '' }, history)).toBe(T)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/reset')
  })

  it('кривой токен: null, но адрес всё равно чистится', () => {
    const history = { replaceState: vi.fn() }
    expect(readResetToken({ hash: '#<script>', pathname: '/reset', search: '' }, history)).toBeNull()
    expect(history.replaceState).toHaveBeenCalled()
  })

  it('без фрагмента: null, история не трогается', () => {
    const history = { replaceState: vi.fn() }
    expect(readResetToken({ hash: '', pathname: '/reset', search: '' }, history)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('ссылка мока', () => {
    expect(readResetToken({ hash: '#mock-boris', pathname: '/reset', search: '' }, { replaceState: () => {} })).toBe('mock-boris')
  })
})
