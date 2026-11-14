<script setup lang="ts">
import { computed } from 'vue'
import { adminApi } from '../api'
import { compact, ERROR_LABEL, num, pct, rub, usd } from '../format'
import { useReport } from '../state'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'

const { data: a, error } = useReport((d) => adminApi.api(d))
const topMax = computed(() => Math.max(0.0001, ...(a.value?.topUsers.map((u) => u.usd) ?? [])))
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="a" class="stack">
    <div class="grid-stats">
      <Stat label="Запросы" :value="num(a.requests)" />
      <Stat label="Входящие токены" :value="compact(a.tokensIn)" :sub="num(a.tokensIn)" />
      <Stat label="Исходящие токены" :value="compact(a.tokensOut)" :sub="num(a.tokensOut)" />
      <Stat label="Средняя стоимость запроса" :value="usd(a.avgCostUsd, 4)" />
      <Stat label="Расход API" :value="usd(a.totalUsd)" :sub="rub(a.totalRub)" />
      <Stat label="Ошибки" :value="num(a.errors.count)" :sub="`${pct(a.errors.rate)} запросов, не списаны`" :tone="a.errors.rate > 2 ? 'bad' : undefined" />
    </div>

    <div class="grid-2">
      <Panel title="Расход по моделям">
        <div class="scroll-x">
          <table class="tbl">
            <thead><tr><th>Статья</th><th class="r">Запросов</th><th class="r">Расход</th><th class="r">На запрос</th></tr></thead>
            <tbody>
              <tr v-for="m in a.byModel" :key="m.key">
                <td>{{ m.label }}</td>
                <td class="r">{{ num(m.requests) }}</td>
                <td class="r">{{ usd(m.usd) }}</td>
                <td class="r muted">{{ m.requests ? usd(m.usd / m.requests, 4) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Ошибки запросов" note="запрос без результата не списывается">
        <p v-if="!a.errors.byCode.length" class="muted">Ошибок за период нет.</p>
        <table v-else class="tbl">
          <tbody>
            <tr v-for="e in a.errors.byCode" :key="e.code">
              <td>{{ ERROR_LABEL[e.code] ?? e.code }} <span class="mono muted">{{ e.code }}</span></td>
              <td class="r">{{ num(e.count) }}</td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </div>

    <Panel title="Топ пользователей по расходам">
      <div class="scroll-x">
        <table class="tbl">
          <thead><tr><th>#</th><th>Пользователь</th><th class="r">Запросов</th><th class="r">Расход</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(u, i) in a.topUsers" :key="u.userId">
              <td class="muted">{{ i + 1 }}</td>
              <td>{{ u.email }} <span class="mono muted">{{ u.userId }}</span></td>
              <td class="r">{{ num(u.requests) }}</td>
              <td class="r">{{ usd(u.usd, 3) }}</td>
              <td class="w-bar"><div class="bar"><i :style="{ width: `${(u.usd / topMax) * 100}%` }"></i></div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</template>
