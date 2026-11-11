<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MODELS } from '@/config/app'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ modelValue: string; isPaid: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: string]; locked: [feature: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const current = () => MODELS.find((m) => m.id === props.modelValue) ?? MODELS[0]!

function pick(id: string, requiresPlan: boolean) {
  open.value = false
  if (requiresPlan && !props.isPaid) return emit('locked', 'model')
  emit('update:modelValue', id)
}

function onDoc(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDoc))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDoc))
</script>

<template>
  <div ref="root" class="mp">
    <button class="mp__btn" :aria-expanded="open" aria-haspopup="listbox" @click="open = !open">
      {{ current().name }} <Icon name="chevron" :size="16" />
    </button>
    <ul v-show="open" class="mp__menu" role="listbox">
      <li v-for="m in MODELS" :key="m.id">
        <button class="mp__opt" role="option" :aria-selected="m.id === modelValue" @click="pick(m.id, m.requiresPlan)">
          <span class="mp__txt"><b>{{ m.name }}</b><small>{{ m.hint }}</small></span>
          <Icon v-if="m.id === modelValue" name="check" :size="16" />
          <span v-else-if="m.requiresPlan && !isPaid" class="mp__pro">Pro</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.mp {
  position: relative;
}
.mp__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
}
.mp__btn:hover {
  background: var(--bg-sunken);
}
.mp__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 260px;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 16px;
  background: var(--bg-elev);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  animation: pop 0.18s var(--ease);
}
.mp__opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  text-align: left;
}
.mp__opt:hover {
  background: var(--bg-sunken);
}
.mp__txt {
  display: grid;
}
.mp__txt small {
  color: var(--text-3);
  font-size: 12px;
}
.mp__pro {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  background: var(--accent);
  color: #fff;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
</style>
