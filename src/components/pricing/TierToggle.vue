<script setup lang="ts">
import type { PlanTier } from '@/api'

const model = defineModel<PlanTier>({ required: true })
</script>

<template>
  <div class="tt" role="radiogroup" aria-label="Тип тарифа">
    <button role="radio" :aria-checked="model === 'text'" class="tt__opt" :class="{ on: model === 'text' }" @click="model = 'text'">Без изображений</button>
    <button
      class="tt__switch"
      :class="{ right: model === 'media' }"
      aria-label="Переключить тип тарифа"
      @click="model = model === 'text' ? 'media' : 'text'"
    ><span /></button>
    <button role="radio" :aria-checked="model === 'media'" class="tt__opt" :class="{ on: model === 'media' }" @click="model = 'media'">Файлы и изображения</button>
  </div>
</template>

<style scoped>
.tt {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.tt__opt {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-3);
  transition: color 0.2s;
}
.tt__opt.on {
  color: var(--text);
}
.tt__switch {
  position: relative;
  width: 52px;
  height: 30px;
  border-radius: 999px;
  background: var(--accent);
  transition: background 0.25s;
}
.tt__switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
  transition: transform 0.3s var(--ease);
}
.tt__switch.right span {
  transform: translateX(22px);
}
.tt__switch:not(.right) {
  background: var(--ink);
}
@media (max-width: 480px) {
  .tt__opt {
    font-size: 14px;
  }
}
</style>
