<script setup lang="ts">
import { ref } from 'vue'
import { VARIANTS } from './registry'

defineProps<{ current: number }>()
const emit = defineEmits<{ pick: [id: number | null] }>()
const collapsed = ref(false)
</script>

<template>
  <div class="sw" :class="{ 'is-collapsed': collapsed }" role="toolbar" aria-label="Выбор стиля лендинга">
    <button class="sw__toggle" :aria-label="collapsed ? 'Показать переключатель стилей' : 'Свернуть'" @click="collapsed = !collapsed">
      {{ collapsed ? 'Стиль' : '×' }}
    </button>
    <template v-if="!collapsed">
      <span class="sw__label">Архив</span>
      <button class="sw__opt" @click="emit('pick', null)">
        <span class="sw__name">← Основной</span>
      </button>
      <button
        v-for="v in VARIANTS"
        :key="v.id"
        class="sw__opt"
        :class="{ on: v.id === current }"
        :title="`${v.name} — ${v.description}`"
        :aria-pressed="v.id === current"
        @click="emit('pick', v.id)"
      >
        <span class="sw__dot" :style="{ background: `linear-gradient(135deg, ${v.swatch[0]} 50%, ${v.swatch[1]} 50%)` }" />
        <span class="sw__num">{{ v.id }}</span>
        <span class="sw__name">{{ v.name }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.sw {
  position: fixed;
  left: 50%;
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100vw - 24px);
  padding: 5px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgb(18 18 22 / 0.86);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  backdrop-filter: blur(16px) saturate(1.5);
  color: #f4f1ea;
  font: 500 13px/1 'Golos Text', system-ui, sans-serif;
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.08),
    0 12px 40px -8px rgb(0 0 0 / 0.5);
  overflow-x: auto;
  scrollbar-width: none;
}
.sw.is-collapsed {
  left: auto;
  right: 14px;
  transform: none;
}
.sw__label {
  padding: 0 8px 0 6px;
  opacity: 0.55;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sw__toggle {
  flex: none;
  min-width: 30px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: inherit;
  opacity: 0.7;
}
.sw__opt {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px 0 6px;
  border-radius: 999px;
  color: inherit;
  transition: background 0.2s;
}
.sw__opt:hover {
  background: rgb(255 255 255 / 0.08);
}
.sw__opt.on {
  background: #f4f1ea;
  color: #121216;
}
.sw__dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.25);
}
.sw__num {
  display: none;
  font-weight: 700;
}
@media (max-width: 720px) {
  .sw__name,
  .sw__label {
    display: none;
  }
  .sw__num {
    display: inline;
  }
  .sw__opt {
    padding: 0 10px 0 5px;
  }
}
</style>
