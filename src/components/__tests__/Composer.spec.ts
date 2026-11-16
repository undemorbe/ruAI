import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Composer from '../chat/Composer.vue'
import composer from '../chat/Composer.vue?raw'

describe('chat composer focus border', () => {
  it('removes the inner focus shadow from the message field', () => {
    const style = composer.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? ''
    const inputFocusStyles = style.match(/\.cmp__input:focus\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(inputFocusStyles).toMatch(/box-shadow:\s*none;/)
  })

  it('uses the theme ink instead of the orange accent in dark mode', () => {
    const style = composer.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? ''
    const darkModeStyles = style.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(darkModeStyles).toMatch(/\.cmp:focus-within\s*\{\s*border-color:\s*var\(--ink\);/)
    expect(darkModeStyles).not.toContain('var(--accent)')
  })
})

describe('chat composer placeholder', () => {
  const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')

  afterEach(() => {
    vi.useRealTimers()
    if (matchMediaDescriptor) Object.defineProperty(window, 'matchMedia', matchMediaDescriptor)
    else Reflect.deleteProperty(window, 'matchMedia')
  })

  it('types the basic ChatGPT prompt and completes it once', async () => {
    vi.useFakeTimers()
    const wrapper = mount(Composer, {
      props: { streaming: false, canMedia: false, upload: async () => null },
    })
    const input = wrapper.get('textarea')

    expect(input.attributes('placeholder')).toBe('')
    await vi.advanceTimersByTimeAsync(45)
    await nextTick()
    expect(input.attributes('placeholder')).toBe('С')

    await vi.runAllTimersAsync()
    await nextTick()
    expect(input.attributes('placeholder')).toBe('Спросите ChatGPT')
    wrapper.unmount()
  })

  it('uses the Astra prompt when photo features are available', async () => {
    vi.useFakeTimers()
    const wrapper = mount(Composer, {
      props: { streaming: false, canMedia: true, upload: async () => null },
    })

    await vi.runAllTimersAsync()
    await nextTick()
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('Спросите ChatGPT-6.1 Astra')
    wrapper.unmount()
  })

  it('shows the full prompt immediately when reduced motion is enabled', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    })
    const wrapper = mount(Composer, {
      props: { streaming: false, canMedia: false, upload: async () => null },
    })

    await nextTick()
    expect(wrapper.get('textarea').attributes('placeholder')).toBe('Спросите ChatGPT')
    wrapper.unmount()
  })
})
