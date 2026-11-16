import { describe, expect, it } from 'vitest'
import { isModelId } from '../app'

describe('ID модели OpenRouter', () => {
  it('принимает provider/model и суффикс варианта', () => {
    expect(isModelId('openai/gpt-oss-20b')).toBe(true)
    expect(isModelId('openai/gpt-oss-20b:free')).toBe(true)
  })

  it('отклоняет значение без provider/model и небезопасные символы', () => {
    expect(isModelId('not-a-model')).toBe(false)
    expect(isModelId('openai/model name')).toBe(false)
    expect(isModelId('openai/model?url=https://example.com')).toBe(false)
  })
})
