import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_DRAFT, saveDraft, takeDraft } from '../draft'

describe('guest draft', () => {
  beforeEach(() => sessionStorage.clear())

  it('survives once and is removed after reading', () => {
    saveDraft('  Привет, как дела?  ')
    expect(takeDraft()).toBe('Привет, как дела?')
    expect(takeDraft()).toBeNull()
  })

  it('empty text clears a saved draft; long text is capped', () => {
    saveDraft('старый')
    saveDraft('   ')
    expect(takeDraft()).toBeNull()
    saveDraft('я'.repeat(MAX_DRAFT + 50))
    expect(takeDraft()).toHaveLength(MAX_DRAFT)
  })
})
