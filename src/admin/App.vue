<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { adminApi, type RangeDays } from './api'
import { bumpIdle, days, logout, session } from './state'
import LoginView from './views/LoginView.vue'
import OverviewView from './views/OverviewView.vue'
import PaymentsView from './views/PaymentsView.vue'
import ApiView from './views/ApiView.vue'
import ImagesView from './views/ImagesView.vue'
import UsersView from './views/UsersView.vue'
import FinanceView from './views/FinanceView.vue'
import SettingsView from './views/SettingsView.vue'
import SecurityView from './views/SecurityView.vue'

/** Каркас админки: проверка сессии, разделы (hash-маршруты), период отчётов. */
const SECTIONS: { id: string; title: string; view: Component; period: boolean }[] = [
  { id: 'overview', title: 'Главная', view: OverviewView, period: true },
  { id: 'payments', title: 'Подписки и платежи', view: PaymentsView, period: true },
  { id: 'api', title: 'Аналитика API', view: ApiView, period: true },
  { id: 'images', title: 'Изображения', view: ImagesView, period: true },
  { id: 'users', title: 'Пользователи', view: UsersView, period: false },
  { id: 'finance', title: 'Финансы', view: FinanceView, period: true },
  { id: 'settings', title: 'Настройки', view: SettingsView, period: false },
  { id: 'security', title: 'Безопасность', view: SecurityView, period: false },
]
const RANGES: { v: RangeDays; label: string }[] = [
  { v: 7, label: '7 дн' },
  { v: 30, label: '30 дн' },
  { v: 90, label: '90 дн' },
  { v: 365, label: 'Год' },
]

const ready = ref(false)
const hash = ref(location.hash)
const current = computed(() => SECTIONS.find((s) => `#/${s.id}` === hash.value) ?? SECTIONS[0]!)
const onHash = () => (hash.value = location.hash)
const activity = () => bumpIdle()

onMounted(async () => {
  window.addEventListener('hashchange', onHash)
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, activity, { passive: true })
  try {
    session.value = await adminApi.session()
    bumpIdle()
  } finally {
    ready.value = true
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHash)
  for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, activity)
})
</script>

<template>
  <template v-if="ready">
    <LoginView v-if="!session" />
    <div v-else class="sh">
      <aside class="sh__side">
        <div class="sh__brand">
          Панель
          <span v-if="session.demo" class="sh__demo" title="Данные сгенерированы, база не подключена">демо</span>
        </div>
        <nav class="sh__nav" aria-label="Разделы">
          <a v-for="s in SECTIONS" :key="s.id" :href="`#/${s.id}`" :aria-current="current.id === s.id ? 'page' : undefined">{{ s.title }}</a>
        </nav>
        <div class="sh__me">
          <span class="muted">{{ session.login }}</span>
          <button class="sh__out" @click="logout">Выйти</button>
        </div>
      </aside>

      <main class="sh__main">
        <header class="sh__head">
          <h1>{{ current.title }}</h1>
          <div v-if="current.period" class="sh__range" role="radiogroup" aria-label="Период">
            <button v-for="r in RANGES" :key="r.v" role="radio" :aria-checked="days === r.v" @click="days = r.v">{{ r.label }}</button>
          </div>
        </header>
        <component :is="current.view" :key="current.id" />
      </main>
    </div>
  </template>
</template>

<style scoped>
.sh {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 100dvh;
}
.sh__side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100dvh;
  padding: 20px 12px;
  border-right: 1px solid var(--line);
  background: var(--bg-elev);
}
.sh__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  font: 600 17px/1 var(--font-display);
}
.sh__demo {
  padding: 2px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: color-mix(in srgb, var(--accent) 75%, var(--text));
  font-size: 11.5px;
  font-weight: 600;
}
.sh__nav {
  display: grid;
  gap: 2px;
}
.sh__nav a {
  padding: 9px 10px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 14.5px;
}
.sh__nav a:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
.sh__nav a[aria-current='page'] {
  background: var(--bg-sunken);
  color: var(--text);
  font-weight: 600;
}
.sh__me {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding: 10px;
  border-top: 1px solid var(--line);
  font-size: 13.5px;
}
.sh__out {
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.sh__main {
  min-width: 0;
  padding: 22px 28px 48px;
}
.sh__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
h1 {
  margin: 0;
  font: 600 24px/1.2 var(--font-display);
}
.sh__range {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
}
.sh__range button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.sh__range button[aria-checked='true'] {
  background: var(--ink);
  color: var(--ink-text);
}

@media (max-width: 860px) {
  .sh {
    grid-template-columns: minmax(0, 1fr);
  }
  .sh__side {
    position: sticky;
    z-index: 5;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    height: auto;
    padding: max(10px, env(safe-area-inset-top)) 16px 0;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .sh__brand {
    padding: 0;
  }
  .sh__me {
    margin: 0 0 0 auto;
    padding: 0;
    border: 0;
  }
  .sh__nav {
    display: flex;
    order: 3;
    width: calc(100% + 32px);
    margin: 0 -16px;
    padding: 0 10px 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sh__nav a {
    flex: none;
    padding: 8px 10px;
    font-size: 14px;
  }
  .sh__main {
    padding: 16px 16px 40px;
  }
  h1 {
    font-size: 20px;
  }
}
</style>
