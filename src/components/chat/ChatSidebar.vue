<script setup lang="ts">
import { computed } from 'vue'
import type { ChatSummary } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import Logo from '@/components/ui/Logo.vue'

const props = defineProps<{ chats: ChatSummary[]; activeId: string | null; open: boolean; userLabel: string; isPaid: boolean }>()
const emit = defineEmits<{ select: [id: string | null]; remove: [id: string]; close: [] }>()

const groups = computed(() => {
  const today = new Date().toDateString()
  const out: { label: string; items: ChatSummary[] }[] = [
    { label: 'Сегодня', items: [] },
    { label: 'Ранее', items: [] },
  ]
  for (const c of props.chats) out[new Date(c.updatedAt).toDateString() === today ? 0 : 1]!.items.push(c)
  return out.filter((g) => g.items.length)
})
</script>

<template>
  <div class="scrim" :class="{ 'is-open': open }" @click="emit('close')" />
  <aside class="side" :class="{ 'is-open': open }" aria-label="История чатов">
    <div class="side__top">
      <RouterLink to="/" class="side__brand"><Logo :size="24" /></RouterLink>
      <button class="side__close" aria-label="Закрыть меню" @click="emit('close')"><Icon name="x" /></button>
    </div>

    <button class="side__new" @click="emit('select', null)"><Icon name="edit" :size="17" /> Новый чат</button>

    <nav class="side__list">
      <p v-if="!chats.length" class="side__empty">Недавние чаты появятся здесь</p>
      <section v-for="g in groups" :key="g.label">
        <h3 class="side__label">{{ g.label }}</h3>
        <div v-for="c in g.items" :key="c.id" class="side__item" :class="{ 'is-active': c.id === activeId }">
          <button class="side__title" :title="c.title" @click="emit('select', c.id)">{{ c.title }}</button>
          <button class="side__del" aria-label="Удалить чат" @click="emit('remove', c.id)"><Icon name="trash" :size="15" /></button>
        </div>
      </section>
    </nav>

    <RouterLink v-if="!isPaid" to="/pricing" class="side__upsell">
      <Icon name="bolt" :size="18" />
      <span><b>Открыть Pro</b><small>Длинный контекст, файлы и изображения</small></span>
    </RouterLink>

    <div class="side__user">
      <span class="side__avatar">{{ userLabel.slice(0, 2).toUpperCase() }}</span>
      <span class="side__who">
        <span class="side__email">{{ userLabel }}</span>
        <RouterLink to="/pricing" class="side__upgrade">{{ isPaid ? 'Подписка' : 'Улучшить' }}</RouterLink>
      </span>
    </div>
  </aside>
</template>

<style scoped>
.side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 268px;
  height: 100%;
  padding: 14px 10px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
  background: var(--bg-sunken);
  border-right: 1px solid var(--line);
}
.side__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 10px;
}
.side__close {
  display: none;
  padding: 8px;
  border-radius: 10px;
}
.side__new {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  font-weight: 500;
  background: var(--bg-elev);
  border: 1px solid var(--line);
  transition: border-color 0.2s;
}
.side__new:hover {
  border-color: var(--line-strong);
}
.side__list {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 6px -4px 0;
  padding: 0 4px;
}
.side__empty {
  padding: 10px;
  color: var(--text-3);
  font-size: 13px;
}
.side__label {
  margin: 14px 10px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}
.side__item {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 10px;
}
.side__item:hover,
.side__item.is-active {
  background: color-mix(in srgb, var(--text) 7%, transparent);
}
.side__title {
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  text-align: left;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side__del {
  padding: 8px;
  color: var(--text-3);
  opacity: 0;
  transition: opacity 0.15s;
}
.side__item:hover .side__del,
.side__item.is-active .side__del {
  opacity: 1;
}
.side__del:hover {
  color: var(--danger);
}
@media (hover: none) {
  .side__del {
    opacity: 1;
  }
}
.side__upsell {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 14px;
  background: var(--ink);
  color: var(--ink-text);
}
.side__upsell span {
  display: grid;
  gap: 2px;
}
.side__upsell small {
  opacity: 0.7;
  font-size: 12px;
  line-height: 1.35;
}
.side__upsell :deep(svg) {
  color: var(--accent);
  margin-top: 1px;
}
.side__user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
}
.side__avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.side__who {
  display: grid;
  min-width: 0;
  line-height: 1.3;
}
.side__email {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side__upgrade {
  font-size: 12px;
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.scrim {
  display: none;
}

@media (max-width: 860px) {
  .side {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    width: min(300px, 86vw);
    transform: translateX(-102%);
    transition: transform 0.32s var(--ease);
    box-shadow: var(--shadow);
  }
  .side.is-open {
    transform: none;
  }
  .side__close {
    display: inline-flex;
  }
  .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(10 10 14 / 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }
  .scrim.is-open {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
