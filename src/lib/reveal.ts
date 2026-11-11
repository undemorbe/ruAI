import type { Directive } from 'vue'

/**
 * v-reveal — adds `is-in` once the element scrolls into view.
 * Optional value: delay in ms. Elements are visible by default if IO is unsupported.
 */
let io: IntersectionObserver | null = null

function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in')
          io?.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  )
  return io
}

export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    el.classList.add('reveal')
    if (binding.value) el.style.setProperty('--reveal-delay', `${binding.value}ms`)
    const obs = observer()
    if (obs) obs.observe(el)
    else el.classList.add('is-in')
  },
  unmounted(el) {
    io?.unobserve(el)
  },
}
