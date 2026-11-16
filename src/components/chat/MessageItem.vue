<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import BrandMark from '@/components/ui/BrandMark.vue'
import { renderMarkdown } from '@/lib/format'

const props = defineProps<{ message: Message }>()
const html = computed(() => renderMarkdown(props.message.content))
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
      <BrandMark />
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
      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes raw HTML and unsafe URLs -->
      <div v-if="message.role === 'assistant' && message.content" class="msg__markdown" v-html="html" />
      <p v-else-if="message.content" class="msg__text">{{ message.content }}</p>
      <span v-if="message.status === 'streaming'" class="msg__caret" aria-hidden="true" />
      <p v-if="message.status === 'streaming' && !message.content && !message.images?.length" class="msg__wait" role="status" aria-live="polite">
        Размышляю<span class="msg__wait-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      </p>
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
.msg__wait-dots {
  display: inline-flex;
  margin-left: 2px;
}
.msg__wait-dots i {
  font-style: normal;
  animation: wait-dot 1.2s infinite;
}
.msg__wait-dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.msg__wait-dots i:nth-child(3) {
  animation-delay: 0.4s;
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
.msg__markdown {
  min-width: 0;
  overflow-wrap: anywhere;
}
.msg__markdown :deep(p) {
  margin: 0 0 10px;
}
.msg__markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.msg__markdown :deep(h1),
.msg__markdown :deep(h2),
.msg__markdown :deep(h3),
.msg__markdown :deep(h4),
.msg__markdown :deep(h5),
.msg__markdown :deep(h6) {
  margin: 18px 0 8px;
  line-height: 1.3;
}
.msg__markdown :deep(h1) {
  font-size: 1.45em;
}
.msg__markdown :deep(h2) {
  font-size: 1.3em;
}
.msg__markdown :deep(h3),
.msg__markdown :deep(h4),
.msg__markdown :deep(h5),
.msg__markdown :deep(h6) {
  font-size: 1.12em;
}
.msg__markdown :deep(ul),
.msg__markdown :deep(ol) {
  margin: 0 0 10px;
  padding-left: 24px;
}
.msg__markdown :deep(li + li) {
  margin-top: 4px;
}
.msg__markdown :deep(blockquote) {
  margin: 0 0 10px;
  padding-left: 14px;
  border-left: 3px solid var(--line);
  color: var(--text-2);
}
.msg__markdown :deep(table) {
  width: 100%;
  margin: 8px 0 12px;
  border-collapse: collapse;
}
.msg__markdown :deep(th),
.msg__markdown :deep(td) {
  padding: 7px 9px;
  border: 1px solid var(--line);
  text-align: left;
  overflow-wrap: anywhere;
}
.msg__markdown :deep(th) {
  background: var(--bg-sunken);
}
.msg__markdown :deep(hr) {
  margin: 14px 0;
  border: 0;
  border-top: 1px solid var(--line);
}
.msg__markdown :deep(a) {
  color: var(--accent);
}
.msg__markdown :deep(.msg__inline-code) {
  padding: 2px 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-sunken);
  color: var(--accent);
  font: 0.9em var(--font-mono);
  overflow-wrap: anywhere;
}
.msg__markdown :deep(pre) {
  position: relative;
  margin: 4px 0 12px;
  padding: 38px 16px 14px;
  border-radius: 12px;
  background: #15141a;
  color: #e9e6df;
  font: 13px/1.6 var(--font-mono);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.msg__markdown :deep(pre code) {
  display: block;
  font: inherit;
  white-space: pre;
}
.msg__markdown :deep(.msg__lang) {
  position: absolute;
  top: 7px;
  left: 10px;
  padding: 2px 7px;
  border: 1px solid #393740;
  border-radius: 6px;
  background: #222128;
  color: #b7b2c0;
  font: 10px/1.5 var(--font-mono);
  text-transform: uppercase;
}
.msg__markdown :deep(.hljs-comment),
.msg__markdown :deep(.hljs-quote) {
  color: #8b949e;
  font-style: italic;
}
.msg__markdown :deep(.hljs-keyword),
.msg__markdown :deep(.hljs-selector-tag),
.msg__markdown :deep(.hljs-literal),
.msg__markdown :deep(.hljs-section) {
  color: #ff7b72;
}
.msg__markdown :deep(.hljs-string),
.msg__markdown :deep(.hljs-doctag),
.msg__markdown :deep(.hljs-regexp),
.msg__markdown :deep(.hljs-template-tag) {
  color: #a5d6ff;
}
.msg__markdown :deep(.hljs-number),
.msg__markdown :deep(.hljs-variable),
.msg__markdown :deep(.hljs-template-variable),
.msg__markdown :deep(.hljs-symbol),
.msg__markdown :deep(.hljs-bullet) {
  color: #79c0ff;
}
.msg__markdown :deep(.hljs-title),
.msg__markdown :deep(.hljs-title.function_),
.msg__markdown :deep(.hljs-title.class_),
.msg__markdown :deep(.hljs-type),
.msg__markdown :deep(.hljs-built_in) {
  color: #ffa657;
}
.msg__markdown :deep(.hljs-attr),
.msg__markdown :deep(.hljs-attribute),
.msg__markdown :deep(.hljs-params) {
  color: #d2a8ff;
}
.msg__markdown :deep(.hljs-meta),
.msg__markdown :deep(.hljs-operator),
.msg__markdown :deep(.hljs-punctuation) {
  color: #c9d1d9;
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
@keyframes wait-dot {
  0%,
  60%,
  100% {
    opacity: 0.25;
  }
  30% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .msg__wait-dots i {
    animation: none;
    opacity: 1;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
