<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ feature: string | null }>()
const emit = defineEmits<{ close: [] }>()

const copy = computed(() => {
  switch (props.feature) {
    case 'files':
      return { title: 'Файлы — в тарифе с медиа', text: 'Загружайте PDF, документы и таблицы: ruAI прочитает, кратко перескажет и ответит на вопросы.' }
    case 'image':
      return { title: 'Генерация изображений', text: 'Создавайте иллюстрации, обложки и мемы по текстовому описанию в тарифе «Файлы и изображения».' }
    case 'voice':
      return { title: 'Голосовой ввод скоро', text: 'Мы уже работаем над голосовым режимом. Подписчики получат его первыми.' }
    default:
      return { title: 'Модель доступна в Pro', text: 'Продвинутые модели решают сложные задачи, пишут код и держат длинный контекст.' }
  }
})

const tier = computed(() => (props.feature === 'files' || props.feature === 'image' ? 'media' : 'text'))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="pw" role="dialog" aria-modal="true" :aria-label="copy.title" @click.self="emit('close')">
    <div class="pw__card">
      <button class="pw__x" aria-label="Закрыть" @click="emit('close')"><Icon name="x" /></button>
      <span class="pw__badge"><Icon name="bolt" :size="22" /></span>
      <h2>{{ copy.title }}</h2>
      <p>{{ copy.text }}</p>
      <RouterLink :to="{ name: 'pricing', query: { tier } }" class="btn btn--ink btn--block">Посмотреть тарифы</RouterLink>
      <button class="btn btn--block pw__later" @click="emit('close')">Позже</button>
    </div>
  </div>
</template>

<style scoped>
.pw {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(10 10 14 / 0.5);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  animation: fade 0.2s;
}
.pw__card {
  position: relative;
  width: min(400px, 100%);
  padding: 28px 24px 18px;
  border-radius: var(--radius-l);
  background: var(--bg-elev);
  box-shadow: var(--shadow);
  text-align: center;
  animation: up 0.3s var(--ease);
}
.pw__x {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 6px;
  color: var(--text-3);
}
.pw__badge {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--accent);
  color: #fff;
}
h2 {
  margin: 16px 0 8px;
  font: 600 20px/1.25 var(--font-display);
}
p {
  margin: 0 0 22px;
  color: var(--text-2);
}
.pw__later {
  margin-top: 6px;
  color: var(--text-2);
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes up {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}
</style>
