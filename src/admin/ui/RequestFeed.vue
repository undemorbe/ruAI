<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { adminApi, type RequestEntry, type RequestImage, type RequestsFilter } from '../api'
import { dateTime, ERROR_LABEL, KIND_LABEL, num, rubCents, STATUS_LABEL, usd } from '../format'
import { dataVersion, handle, userCard } from '../state'

/**
 * Лента запросов к модели: вопрос, ответ, фото и генерации, цена каждого запроса.
 * С userId - запросы одного пользователя (карточка), без него - всех (раздел «Запросы»).
 */
const props = defineProps<{ userId?: string }>()

const FILTERS: { id: RequestsFilter; title: string }[] = [
  { id: 'all', title: 'Все' },
  { id: 'text', title: 'Текст' },
  { id: 'vision', title: 'С фото' },
  { id: 'image', title: 'Генерации' },
  { id: 'error', title: 'Ошибки' },
]
const filter = ref<RequestsFilter>('all')
const items = shallowRef<RequestEntry[]>([])
const next = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const open = ref(new Set<number>())
const viewing = ref<RequestImage | null>(null)
let seq = 0

async function load(more = false) {
  const my = ++seq
  loading.value = true
  error.value = null
  try {
    const page = await adminApi.requests({
      ...(props.userId ? { userId: props.userId } : {}),
      filter: filter.value,
      ...(more && next.value ? { before: next.value } : {}),
    })
    if (my !== seq) return
    items.value = more ? [...items.value, ...page.items] : page.items
    next.value = page.next
  } catch (e) {
    if (my === seq) error.value = handle(e)
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(filter, () => load(), { immediate: true })
watch(dataVersion, () => load())

const total = computed(() => items.value.reduce((n, e) => n + e.costRub, 0))
const LONG = 600
const isLong = (t: string | null) => (t?.length ?? 0) > LONG
function toggle(id: number) {
  const s = new Set(open.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  open.value = s
}
const shown = (e: RequestEntry, t: string | null) => (t && isLong(t) && !open.value.has(e.id) ? `${t.slice(0, LONG)}…` : t)

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && viewing.value) {
    ev.stopPropagation()
    viewing.value = null
  }
}
watch(viewing, (v) => (v ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="rf">
    <div class="rf__bar">
      <div class="rf__filters" role="group" aria-label="Вид запросов">
        <button v-for="f in FILTERS" :key="f.id" class="btn btn--ghost rf__chip" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.title }}</button>
      </div>
      <small v-if="items.length" class="muted">Показано {{ num(items.length) }}{{ next ? '+' : '' }}, на сумму {{ rubCents(total) }}</small>
    </div>

    <p v-if="error" class="err-box">{{ error }}</p>
    <p v-else-if="!loading && !items.length" class="muted">Запросов нет.</p>

    <article v-for="e in items" :key="e.id" class="rf__item" :class="{ 'is-bad': e.status === 'error' }">
      <header class="rf__head">
        <span class="mono muted">{{ dateTime(e.at) }}</span>
        <button v-if="!userId && e.userId !== 'deleted'" class="link" @click="userCard = e.userId">{{ e.login }}</button>
        <span v-else-if="!userId" class="muted">{{ e.login }}</span>
        <span class="tag" :class="{ 'tag--media': e.kind !== 'text' }">{{ KIND_LABEL[e.kind] }}</span>
        <span :class="e.status === 'ok' ? 'muted' : 'bad'">{{ STATUS_LABEL[e.status] }}<template v-if="e.errorCode">: {{ ERROR_LABEL[e.errorCode] ?? e.errorCode }}</template></span>
        <span class="rf__price" :title="`${usd(e.costUsd, 4)} · вход ${num(e.tokensIn)} ток., выход ${num(e.tokensOut)} ток.`">
          <b>{{ rubCents(e.costRub) }}</b>
          <small class="muted">{{ usd(e.costUsd, 4) }}</small>
        </span>
      </header>
      <p class="rf__meta muted">
        <span class="mono">{{ e.model }}</span>
        <span v-if="e.chatTitle"> · чат «{{ e.chatTitle }}»</span>
        <span> · {{ num(e.tokensIn) }} → {{ num(e.tokensOut) }} ток.</span>
      </p>

      <div class="rf__msg">
        <span class="rf__who">Вопрос</span>
        <p v-if="e.prompt" class="rf__text">{{ shown(e, e.prompt) }}</p>
        <p v-else-if="e.prompt === ''" class="muted">Без текста</p>
        <p v-else class="muted">Текст недоступен: чат удалён пользователем или запрос сделан до учёта переписки.</p>
        <div v-if="e.photos.length" class="rf__pics">
          <button v-for="p in e.photos" :key="p.id" class="rf__pic" :aria-label="`Фото пользователя ${p.width}×${p.height}`" @click="viewing = p">
            <img :src="adminApi.imageUrl(p.id)" :width="p.width" :height="p.height" alt="" loading="lazy" decoding="async" />
          </button>
        </div>
      </div>

      <div v-if="e.answer !== null || e.generated.length" class="rf__msg rf__msg--ai">
        <span class="rf__who">Ответ</span>
        <p v-if="e.answer" class="rf__text">{{ shown(e, e.answer) }}</p>
        <div v-if="e.generated.length" class="rf__pics">
          <button v-for="p in e.generated" :key="p.id" class="rf__pic" :aria-label="`Сгенерированная картинка ${p.width}×${p.height}`" @click="viewing = p">
            <img :src="adminApi.imageUrl(p.id)" :width="p.width" :height="p.height" alt="" loading="lazy" decoding="async" />
          </button>
        </div>
        <small v-if="e.truncated" class="muted">Ответ оборвался на лимите длины.</small>
      </div>

      <div v-if="isLong(e.prompt) || isLong(e.answer) || e.clipped" class="rf__more">
        <button v-if="isLong(e.prompt) || isLong(e.answer)" class="link" @click="toggle(e.id)">{{ open.has(e.id) ? 'Свернуть' : 'Показать полностью' }}</button>
        <small v-if="e.clipped && open.has(e.id)" class="muted">В панели показаны первые 20 000 символов.</small>
      </div>
    </article>

    <button v-if="next" class="btn btn--ghost rf__load" :disabled="loading" @click="load(true)">{{ loading ? 'Загружаем…' : 'Показать ещё' }}</button>
    <p v-else-if="loading && !items.length" class="muted">Загружаем…</p>

    <div v-if="viewing" class="rf__lb" role="dialog" aria-modal="true" aria-label="Картинка" @click="viewing = null">
      <img :src="adminApi.imageUrl(viewing.id)" :width="viewing.width" :height="viewing.height" alt="" />
      <button class="rf__lbx" aria-label="Закрыть" @click.stop="viewing = null">×</button>
    </div>
  </div>
</template>

<style scoped>
.rf {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rf__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.rf__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rf__chip {
  min-height: 32px;
  padding: 4px 12px;
  font-size: 13px;
}
.rf__chip[aria-pressed='true'] {
  background: var(--ink);
  color: var(--bg);
}
.rf__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--bg-elev);
}
.rf__item.is-bad {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--line));
}
.rf__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}
.rf__price {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.rf__meta {
  margin: 0;
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.rf__msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
}
.rf__msg--ai {
  background: transparent;
  border: 1px dashed var(--line);
}
.rf__who {
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.rf__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.rf__pics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rf__pic {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  cursor: zoom-in;
}
.rf__pic img {
  display: block;
  width: 120px;
  height: 120px;
  object-fit: cover;
}
.rf__more {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: baseline;
  font-size: 13px;
}
.rf__load {
  align-self: center;
}
.rf__lb {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(10 10 14 / 0.8);
  cursor: zoom-out;
}
.rf__lb img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  border-radius: 8px;
  object-fit: contain;
}
.rf__lbx {
  position: absolute;
  top: 12px;
  right: 16px;
  color: #fff;
  font-size: 32px;
  line-height: 1;
}
</style>
