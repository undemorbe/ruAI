<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ streaming: boolean; mediaLocked: boolean; placeholder?: string }>()
const emit = defineEmits<{ send: [text: string]; stop: []; locked: [feature: string] }>()

const text = ref('')
const el = ref<HTMLTextAreaElement | null>(null)

function autosize() {
  const t = el.value
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 220)}px`
}
watch(text, () => nextTick(autosize))

function submit() {
  if (props.streaming) return emit('stop')
  if (!text.value.trim()) return
  emit('send', text.value)
  text.value = ''
}

function onKey(e: KeyboardEvent) {
  // Enter sends, Shift+Enter breaks line; ignore while IME composition is active.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <form class="cmp" @submit.prevent="submit">
    <label class="sr-only" for="composer">Сообщение</label>
    <textarea
      id="composer"
      ref="el"
      v-model="text"
      rows="1"
      class="cmp__input"
      :placeholder="placeholder ?? 'Спросите ChatGPT'"
      enterkeyhint="send"
      autocomplete="off"
      @keydown="onKey"
    />
    <div class="cmp__bar">
      <button type="button" class="cmp__chip" @click="emit('locked', 'files')">
        <Icon name="clip" :size="16" /> <span>Прикрепить</span>
        <Icon v-if="mediaLocked" name="lock" :size="13" class="cmp__lock" />
      </button>
      <button type="button" class="cmp__chip" @click="emit('locked', 'image')">
        <Icon name="image" :size="16" /> <span>Создать изображение</span>
        <Icon v-if="mediaLocked" name="lock" :size="13" class="cmp__lock" />
      </button>
      <span class="cmp__spacer" />
      <button type="button" class="cmp__icon" aria-label="Голосовой ввод" @click="emit('locked', 'voice')"><Icon name="mic" :size="18" /></button>
      <button type="submit" class="cmp__send" :class="{ 'is-ready': text.trim() || streaming }" :aria-label="streaming ? 'Остановить' : 'Отправить'">
        <Icon :name="streaming ? 'stop' : 'send'" :size="18" :stroke="2.2" />
      </button>
    </div>
  </form>
</template>

<style scoped>
.cmp {
  width: 100%;
  padding: 12px 12px 10px;
  border-radius: 26px;
  background: var(--bg-elev);
  border: 1px solid var(--line-strong);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.cmp:focus-within {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line-strong));
}
.cmp__input {
  display: block;
  width: 100%;
  min-height: 28px;
  max-height: 220px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  resize: none;
  font-size: 16px;
  line-height: 1.5;
}
.cmp__input:focus {
  outline: none;
}
.cmp__input::placeholder {
  color: var(--text-3);
}
.cmp__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.cmp__chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-2);
  transition: background 0.2s;
}
.cmp__chip:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
.cmp__lock {
  color: var(--text-3);
}
.cmp__spacer {
  flex: 1;
}
.cmp__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--text-3);
}
.cmp__icon:hover {
  color: var(--text);
  background: var(--bg-sunken);
}
.cmp__send {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--line-strong);
  color: var(--bg-elev);
  transition:
    background 0.2s,
    transform 0.15s;
}
.cmp__send.is-ready {
  background: var(--ink);
  color: var(--ink-text);
}
.cmp__send:active {
  transform: scale(0.92);
}
@media (max-width: 520px) {
  .cmp__chip span {
    display: none;
  }
  .cmp__chip {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
  .cmp__lock {
    position: absolute;
    right: -2px;
    top: -2px;
  }
}
</style>
