import { onBeforeUnmount, ref } from 'vue'

/** Streams text into a ref word by word, like the real chat does. Cancels on new call/unmount. */
export function useTyping(speed = 28) {
  const text = ref('')
  const busy = ref(false)
  let run = 0

  async function type(full: string) {
    const id = ++run
    busy.value = true
    text.value = ''
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      text.value = full
      busy.value = false
      return
    }
    const parts = full.match(/\S+\s*/g) ?? [full]
    for (const p of parts) {
      if (id !== run) return
      text.value += p
      await new Promise((r) => setTimeout(r, speed + Math.random() * speed))
    }
    if (id === run) busy.value = false
  }

  onBeforeUnmount(() => {
    run++
  })

  return { text, busy, type }
}
