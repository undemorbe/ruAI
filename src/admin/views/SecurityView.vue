<script setup lang="ts">
import { adminApi, type AuditEntry } from '../api'
import { dateTime } from '../format'
import { session, useReport } from '../state'
import Panel from '../ui/Panel.vue'

const { data: log, error } = useReport(() => adminApi.audit())
const LABEL: Record<AuditEntry['action'], string> = {
  login: 'Вход',
  login_failed: 'Неудачный вход',
  logout: 'Выход',
  settings: 'Изменены настройки',
  locked: 'Блокировка входа',
}
</script>

<template>
  <div class="stack">
    <Panel title="Текущая сессия">
      <p v-if="session" class="ses">
        <span>Вход: <strong>{{ session.login }}</strong></span>
        <span class="muted">закроется не позже {{ dateTime(session.expiresAt) }} или через 30 минут без действий</span>
      </p>
    </Panel>
    <Panel title="Журнал действий" note="последние 100 записей">
      <p v-if="error" class="bad">{{ error }}</p>
      <p v-else-if="log && !log.length" class="muted">Записей нет.</p>
      <div v-else-if="log" class="scroll-x">
        <table class="tbl">
          <thead><tr><th>Время</th><th>Событие</th><th>IP</th><th>Подробности</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in log" :key="i">
              <td>{{ dateTime(e.at) }}</td>
              <td :class="{ bad: e.action === 'login_failed' || e.action === 'locked' }">{{ LABEL[e.action] }}</td>
              <td class="mono">{{ e.ip }}</td>
              <td class="muted">{{ e.detail ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</template>

<style scoped>
.ses {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
}
</style>
