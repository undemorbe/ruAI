<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ImageRef } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import { UPLOAD } from '@/config/app'
import type { Draft } from '@/stores/chat'

/**
 * Поле ввода. В тарифе с изображениями — фото (кнопка, вставка, перетаскивание)
 * и режим «Создать изображение»; без него кнопки ведут к тарифу.
 */
const props = defineProps<{
  streaming: boolean
  canMedia: boolean
  upload: (file: File) => Promise<ImageRef | null>
  placeholder?: string
}>()
const emit = defineEmits<{ send: [draft: Draft]; stop: []; locked: [] }>()

const text = ref('')
const images = ref<ImageRef[]>([])
const uploading = ref(0)
const generate = ref(false)
const dragging = ref(false)
const el = ref<HTMLTextAreaElement | null>(null)
const fileIn = ref<HTMLInputElement | null>(null)

const ready = computed(() => !uploading.value && (!!text.value.trim() || (!!images.value.length && !generate.value)))
const hint = computed(() => {
  if (!props.canMedia) return 'Только текст'
  if (generate.value) return images.value.length ? 'Опишите, что изменить на фото' : 'Опишите картинку — словами, как художнику'
  return images.value.length ? 'Спросите про фото' : 'Текст, фото или картинка'
})

function autosize() {
  const t = el.value
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 220)}px`
}
watch(text, () => nextTick(autosize))

async function addFiles(files: FileList | File[]) {
  if (!props.canMedia) return emit('locked')
  const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, UPLOAD.maxFiles - images.value.length)
  for (const f of list) {
    uploading.value++
    try {
      const img = await props.upload(f)
      if (img) images.value.push(img)
    } finally {
      uploading.value--
    }
  }
}

function pickPhoto() {
  if (!props.canMedia) return emit('locked')
  fileIn.value?.click()
}
function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) void addFiles(input.files)
  input.value = ''
}
function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (files.length) {
    e.preventDefault()
    void addFiles(files)
  }
}
function onDrop(e: DragEvent) {
  dragging.value = false
  if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files)
}
function toggleGenerate() {
  if (!props.canMedia) return emit('locked')
  generate.value = !generate.value
  nextTick(() => el.value?.focus())
}

function submit() {
  if (props.streaming) return emit('stop')
  if (!ready.value) return
  emit('send', { text: text.value, images: images.value, generate: generate.value })
  text.value = ''
  images.value = []
  generate.value = false
}

function onKey(e: KeyboardEvent) {
  // Enter sends, Shift+Enter breaks line; ignore while IME composition is active.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

defineExpose({
  focus: () => el.value?.focus(),
  /** Вернуть неотправленный текст и фото (запрос отклонён лимитом). */
  setText(v: string, imgs: ImageRef[] = []) {
    text.value = v
    if (imgs.length) images.value = imgs
    nextTick(() => el.value?.focus())
  },
})
</script>

<template>
  <form
    class="cmp"
    :class="{ 'is-gen': generate, 'is-drag': dragging }"
    @submit.prevent="submit"
    @dragover.prevent="dragging = canMedia"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <ul v-if="images.length || uploading" class="cmp__pics" aria-label="Прикреплённые фото">
      <li v-for="(img, i) in images" :key="img.id" class="cmp__pic">
        <img :src="img.url" alt="" />
        <button type="button" class="cmp__unpin" aria-label="Убрать фото" @click="images.splice(i, 1)"><Icon name="x" :size="14" :stroke="2.4" /></button>
      </li>
      <li v-for="n in uploading" :key="'u' + n" class="cmp__pic is-loading" aria-label="Загружаем фото" />
    </ul>
    <label class="sr-only" for="composer">Сообщение</label>
    <textarea
      id="composer"
      ref="el"
      v-model="text"
      rows="1"
      class="cmp__input"
      :placeholder="generate ? 'Опишите изображение' : (placeholder ?? 'Спросите ChatGPT')"
      enterkeyhint="send"
      autocomplete="off"
      @keydown="onKey"
      @paste="onPaste"
    />
    <input ref="fileIn" type="file" class="sr-only" :accept="UPLOAD.accept" multiple tabindex="-1" aria-hidden="true" @change="onFile" />
    <div class="cmp__bar">
      <button type="button" class="cmp__chip" :disabled="images.length >= UPLOAD.maxFiles" @click="pickPhoto">
        <Icon name="image" :size="16" /> <span>Фото</span>
        <Icon v-if="!canMedia" name="lock" :size="12" class="cmp__lock" />
      </button>
      <button type="button" class="cmp__chip" :class="{ on: generate }" :aria-pressed="generate" @click="toggleGenerate">
        <Icon name="spark" :size="16" /> <span>Создать изображение</span>
        <Icon v-if="!canMedia" name="lock" :size="12" class="cmp__lock" />
      </button>
      <span class="cmp__note">{{ hint }}</span>
      <button type="submit" class="cmp__send" :class="{ 'is-ready': ready || streaming }" :aria-label="streaming ? 'Остановить' : 'Отправить'">
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
.cmp.is-gen {
  border-color: var(--ink);
}
.cmp.is-drag {
  border-style: dashed;
  border-color: var(--ink);
}
.cmp__pics {
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
  padding: 0 4px;
  list-style: none;
  overflow-x: auto;
}
.cmp__pic {
  position: relative;
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
}
.cmp__pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cmp__pic.is-loading {
  background: linear-gradient(100deg, var(--bg-sunken) 40%, var(--bg-elev) 50%, var(--bg-sunken) 60%) 0 0 / 200% 100%;
  animation: cmp-shimmer 1.2s linear infinite;
}
.cmp__unpin {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.65);
  color: #fff;
}
.cmp__chip {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-2);
  transition:
    background 0.2s,
    color 0.2s;
}
.cmp__chip.on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--ink-text);
}
.cmp__chip:disabled {
  opacity: 0.45;
}
.cmp__lock {
  color: var(--text-3);
}
@media (hover: hover) {
  .cmp__chip:not(.on):hover {
    background: var(--bg-sunken);
    color: var(--text);
  }
}
@keyframes cmp-shimmer {
  to {
    background-position: -200% 0;
  }
}
@media (max-width: 560px) {
  .cmp__chip span {
    display: none;
  }
  .cmp__chip {
    width: 40px;
    padding: 0;
    justify-content: center;
  }
  .cmp__lock {
    position: absolute;
    right: -1px;
    top: -1px;
  }
}
.cmp__note {
  flex: 1;
  min-width: 0;
  padding-left: 8px;
  overflow: hidden;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cmp__send {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
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
</style>
