<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { adminApi, type UserSort, type UsersQuery } from '../api'
import { date, num, PLAN_LABEL, rub, TIER_SHORT, usd } from '../format'
import { useReport } from '../state'

const query = reactive<UsersQuery>({ q: '', sort: 'active', page: 1 })
const qRef = ref<UsersQuery>({ ...query })
let t: ReturnType<typeof setTimeout> | undefined
// поиск — с задержкой, сортировка и страница — сразу
watch(
  () => query.q,
  () => {
    clearTimeout(t)
    t = setTimeout(() => (qRef.value = { ...query, page: 1 }), 300)
  },
)
watch(
  () => [query.sort, query.page],
  () => (qRef.value = { ...query }),
)

const { data: p, error, loading } = useReport((q: UsersQuery) => adminApi.users(q), qRef)
const pages = computed(() => (p.value ? Math.max(1, Math.ceil(p.value.total / p.value.pageSize)) : 1))
const go = (n: number) => (query.page = Math.min(pages.value, Math.max(1, n)))
const SORTS: { v: UserSort; label: string }[] = [
  { v: 'registered', label: 'Новые' },
  { v: 'active', label: 'Последняя активность' },
  { v: 'spend', label: 'Расход API' },
  { v: 'paid', label: 'Оплачено' },
]
const ago = (iso: string | null) => {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн назад`
}
</script>

<template>
  <div class="stack">
    <div class="uf">
      <input v-model="query.q" class="field-sm uf__q" type="search" placeholder="Email или ID" aria-label="Поиск пользователя" autocomplete="off" spellcheck="false" />
      <label class="uf__sort">
        <span class="muted">Сортировка</span>
        <select v-model="query.sort" class="field-sm">
          <option v-for="s in SORTS" :key="s.v" :value="s.v">{{ s.label }}</option>
        </select>
      </label>
      <span v-if="p" class="muted">Найдено: {{ num(p.total) }}</span>
    </div>

    <p v-if="error" class="err-box">{{ error }}</p>
    <div v-else-if="p" class="uw" :class="{ 'is-loading': loading }">
      <div class="scroll-x">
        <table class="tbl">
          <thead>
            <tr>
              <th>ID</th><th>Email</th><th>Регистрация</th><th>Тариф</th><th>До</th>
              <th class="r">Использовано</th><th class="r">Осталось</th><th class="r">Генераций</th>
              <th class="r">Оплачено</th><th class="r">Расход API</th><th class="r">Остаток бюджета</th><th>Активность</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in p.items" :key="u.id">
              <td class="mono muted">{{ u.id }}</td>
              <td>{{ u.email }}</td>
              <td>{{ date(u.registeredAt) }}</td>
              <td>
                <template v-if="u.tier && u.planId"><span class="tag" :class="{ 'tag--media': u.tier === 'media' }">{{ TIER_SHORT[u.tier] }}</span> {{ PLAN_LABEL[u.planId] }}</template>
                <span v-else class="muted">нет</span>
              </td>
              <td>{{ date(u.expiresAt) }}</td>
              <td class="r">{{ u.tier ? num(u.requestsUsed) : '—' }}</td>
              <td class="r">{{ u.tier ? num(u.requestsLeft) : '—' }}</td>
              <td class="r">{{ u.tier === 'media' ? num(u.generations) : '—' }}</td>
              <td class="r">{{ rub(u.paidTotalRub) }}</td>
              <td class="r">{{ usd(u.spendUsd, 3) }}</td>
              <td class="r" :class="{ bad: u.budgetLeftRub !== null && u.budgetLeftRub < 30 }">{{ u.budgetLeftRub === null ? '—' : rub(u.budgetLeftRub) }}</td>
              <td>{{ ago(u.lastActiveAt) }}</td>
            </tr>
            <tr v-if="!p.items.length"><td colspan="12" class="muted">Никого не нашли.</td></tr>
          </tbody>
        </table>
      </div>
      <nav v-if="pages > 1" class="pg" aria-label="Страницы">
        <button class="btn btn--ghost" :disabled="p.page <= 1" @click="go(p.page - 1)">Назад</button>
        <span class="muted">{{ p.page }} из {{ pages }}</span>
        <button class="btn btn--ghost" :disabled="p.page >= pages" @click="go(p.page + 1)">Дальше</button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.uf {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
.uf__q {
  flex: 1 1 260px;
  max-width: 420px;
}
.uf__sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}
.uf__sort select {
  width: auto;
}
.uw {
  padding: 6px 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--bg-elev);
  transition: opacity 0.15s;
}
.uw.is-loading {
  opacity: 0.6;
}
.pg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding-top: 10px;
  font-variant-numeric: tabular-nums;
}
.pg .btn {
  min-height: 38px;
  padding: 0 16px;
  font-size: 14px;
}
</style>
