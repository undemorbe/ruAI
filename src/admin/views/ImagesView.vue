<script setup lang="ts">
import { adminApi, type PlanId } from '../api'
import { num, PLAN_LABEL, rub, usd } from '../format'
import { useReport } from '../state'
import Panel from '../ui/Panel.vue'
import Stat from '../ui/Stat.vue'
import { toLimit, useSettings } from '../useSettings'

const { data: r, error } = useReport((d) => adminApi.images(d))
const st = useSettings()
const PLANS: PlanId[] = ['week', 'month', 'quarter']
</script>

<template>
  <p v-if="error" class="err-box">{{ error }}</p>
  <div v-else-if="r" class="stack">
    <div class="grid-stats">
      <Stat label="Генерации" :value="num(r.generations)" sub="создание и редактирование" />
      <Stat label="Расход на генерацию" :value="usd(r.spendUsd)" :sub="rub(r.spendRub)" />
      <Stat label="Средняя стоимость генерации" :value="usd(r.avgCostUsd, 3)" />
      <Stat label="Генерировали" :value="num(r.activeUsers)" sub="подписчиков тарифа с фото" />
    </div>

    <div class="grid-2">
      <Panel title="Генерации по периодам подписки">
        <table class="tbl">
          <thead><tr><th>Период</th><th class="r">Генераций</th><th class="r">На подписку</th><th class="r">Лимит</th></tr></thead>
          <tbody>
            <tr v-for="x in r.byPlan" :key="x.planId">
              <td>{{ PLAN_LABEL[x.planId] }}</td>
              <td class="r">{{ num(x.generations) }}</td>
              <td class="r">{{ num(x.perSubscription) }}</td>
              <td class="r muted">{{ st.saved.value?.generationLimits[x.planId] ?? 'нет' }}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Управление генерацией">
        <form v-if="st.draft.value" class="gc" @submit.prevent="st.save">
          <label class="gc__switch">
            <input v-model="st.draft.value.generationEnabled" type="checkbox" role="switch" />
            <span>
              <strong>{{ st.draft.value.generationEnabled ? 'Генерация включена' : 'Генерация выключена' }}</strong>
              <small class="muted">Выключение не трогает текст и анализ фото — только создание картинок.</small>
            </span>
          </label>
          <fieldset class="gc__limits" :disabled="!st.draft.value.generationEnabled">
            <legend>Лимит генераций за период подписки</legend>
            <label v-for="id in PLANS" :key="id">
              <span>{{ PLAN_LABEL[id] }}</span>
              <input
                class="field-sm"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                placeholder="без лимита"
                :value="st.draft.value.generationLimits[id] ?? ''"
                @input="st.draft.value!.generationLimits[id] = toLimit(($event.target as HTMLInputElement).value)"
              />
            </label>
            <small class="muted">Пусто — отдельного лимита нет, генерации считаются в общих запросах и бюджете. Новое значение действует на новые и продлённые подписки.</small>
          </fieldset>
          <p v-if="st.error.value" class="bad">{{ st.error.value }}</p>
          <div class="gc__act">
            <button class="btn btn--ink" :disabled="!st.dirty.value || st.busy.value">{{ st.busy.value ? 'Сохраняем…' : 'Сохранить' }}</button>
            <button v-if="st.dirty.value" type="button" class="btn btn--ghost" @click="st.reset">Отменить</button>
            <span v-else-if="st.status.value" class="muted">{{ st.status.value }}</span>
          </div>
        </form>
      </Panel>
    </div>
  </div>
</template>

<style scoped>
.gc {
  display: grid;
  gap: 16px;
}
.gc__switch {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  cursor: pointer;
}
.gc__switch input {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  accent-color: var(--ink);
}
.gc__switch span {
  display: grid;
  gap: 2px;
}
.gc__limits {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.gc__limits:disabled {
  opacity: 0.55;
}
.gc__limits legend {
  margin-bottom: 8px;
  padding: 0;
  font-weight: 500;
  font-size: 14px;
}
.gc__limits label {
  display: grid;
  gap: 4px;
  color: var(--text-2);
  font-size: 13px;
}
.gc__limits small {
  grid-column: 1 / -1;
}
.gc__act {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.gc__act .btn {
  min-height: 40px;
}
@media (max-width: 480px) {
  .gc__limits {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
