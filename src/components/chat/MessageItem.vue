<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import { splitBlocks } from '@/lib/format'

const props = defineProps<{ message: Message }>()
const blocks = computed(() => splitBlocks(props.message.content))
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.message.content)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <article class="msg" :class="`msg--${message.role}`">
    <div v-if="message.role === 'assistant'" class="msg__avatar" aria-hidden="true">
      <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="currentColor" /><circle cx="44" cy="22" r="6" fill="var(--accent)" /></svg>
    </div>
    <div class="msg__body">
      <div v-if="message.images?.length" class="msg__pics" :class="{ 'is-gen': message.role === 'assistant' }">
        <figure v-for="img in message.images" :key="img.id" class="msg__pic">
          <a :href="img.url" target="_blank" rel="noopener" :aria-label="img.source === 'generated' ? 'Открыть изображение' : 'Открыть фото'">
            <img :src="img.url" :width="img.width" :height="img.height" :alt="img.source === 'generated' ? 'Сгенерированное изображение' : 'Фото пользователя'" loading="lazy" />
          </a>
          <figcaption v-if="img.source === 'generated'">
            <a :href="img.url" :download="`image-${img.id}`" class="msg__tool"><Icon name="arrow" :size="15" class="msg__dl" /> Скачать</a>
          </figcaption>
        </figure>
      </div>
      <template v-for="(b, i) in blocks" :key="i">
        <pre v-if="b.kind === 'code'" class="msg__code"><span v-if="b.lang" class="msg__lang">{{ b.lang }}</span><code>{{ b.text }}</code></pre>
        <p v-else class="msg__text">{{ b.text.trim() }}</p>
      </template>
      <span v-if="message.status === 'streaming'" class="msg__caret" aria-hidden="true" />
      <p v-if="message.status === 'streaming' && !message.content && !message.images?.length" class="msg__wait">Думаю…</p>
      <p v-if="message.status === 'error'" class="msg__err">Ответ прерван. Попробуйте ещё раз.</p>
      <div v-if="message.role === 'assistant' && message.status === 'done' && message.content" class="msg__tools">
        <button class="msg__tool" @click="copy"><Icon :name="copied ? 'check' : 'copy'" :size="15" /> {{ copied ? 'Скопировано' : 'Копировать' }}</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.msg__pics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 6px;
}
.msg__pics.is-gen {
  justify-content: flex-start;
  margin-bottom: 10px;
}
.msg__pic {
  margin: 0;
}
.msg__pic img {
  display: block;
  width: auto;
  height: auto;
  max-width: min(240px, 60vw);
  max-height: 240px;
  border-radius: 14px;
  border: 1px solid var(--line);
  object-fit: cover;
}
.msg__pics.is-gen .msg__pic img {
  max-width: min(420px, 100%);
  max-height: none;
}
.msg__pic figcaption {
  margin-top: 4px;
}
.msg__dl {
  transform: rotate(90deg);
}
.msg__wait {
  margin: 0;
  color: var(--text-3);
}
.msg {
  display: flex;
  gap: 14px;
  animation: rise 0.35s var(--ease) both;
}
.msg--user {
  justify-content: flex-end;
}
.msg--user .msg__body {
  max-width: min(78%, 560px);
  padding: 10px 16px;
  border-radius: 20px 20px 6px 20px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
}
.msg--assistant .msg__body {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}
.msg__avatar {
  flex: none;
  width: 28px;
  height: 28px;
  color: var(--ink);
}
.msg__text {
  margin: 0 0 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.msg__text:last-child {
  margin-bottom: 0;
}
.msg__code {
  position: relative;
  margin: 4px 0 12px;
  padding: 30px 16px 14px;
  border-radius: 12px;
  background: #15141a;
  color: #e9e6df;
  font: 13px/1.6 var(--font-mono);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.msg__lang {
  position: absolute;
  top: 8px;
  left: 16px;
  font-size: 12px;
  color: #8f8b94;
}
.msg__caret {
  display: inline-block;
  width: 9px;
  height: 18px;
  margin-left: 2px;
  vertical-align: -3px;
  border-radius: 2px;
  background: var(--accent);
  animation: blink 0.9s steps(2) infinite;
}
.msg__err {
  margin: 6px 0 0;
  color: var(--danger);
  font-size: 13px;
}
.msg__tools {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.msg__tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-3);
}
.msg__tool:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
@keyframes blink {
  to {
    opacity: 0;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
