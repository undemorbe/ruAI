<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { adminApi, type PlanId, type PlanTier, type SubEdit, type UserDetail, type UserEdit } from '../api'
import { checkSubEdit, checkUserEdit, MAX_NOTE } from '../edits'
import { date, dateTime, num, PLAN_LABEL, rub, TIER_SHORT, usd } from '../format'
import { DAY, isoDay } from '../range'
import { dataVersion, handle } from '../state'

/**
 * Карточка пользователя: подписка со счётчиками и её правка, профиль, доступ, история.
 * Каждое действие - отдельный запрос; сервер проверяет значения повторно и пишет журнал.
 */
const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: [] }>()

const d = ref<UserDetail | null>(null)
const loadErr = ref<string | null>(null)
const busy = ref(false)
const msg = ref<{ ok: boolean; text: string } | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)

async function load() {
  try {
    d.value = await adminApi.user(props.id)
    resetForms()
  } catch (e) {
    loadErr.value = handle(e)
  }
}

async function act(fn: () => Promise<void>, done: string) {
  if (busy.value) return
  busy.value = true
  msg.value = null
  try {
    await fn()
    msg.value = { ok: true, text: done }
    dataVersion.value++
    await load()
  } catch (e) {
    const t = handle(e)
    if (t) msg.value = { ok: false, text: t }
  } finally {
    busy.value = false
  }
}

// ---------- подписка ----------
const expiresOn = ref('')
const limitDelta = ref<number | null>(null)
const budgetDelta = ref<number | null>(null)
const confirmEnd = ref(false)
const grantTier = ref<PlanTier>('text')
const grantPlan = ref<PlanId>('month')

// дата окончания так, как её видит человек в Москве (поле даты и заголовок совпадают)
const subExpiryDay = computed(() => (d.value?.sub ? isoDay(Date.parse(d.value.sub.expiresAt) + 3 * 3_600_000) : ''))
const maxDay = isoDay(Date.now() + 400 * DAY)
const minDay = isoDay(Date.now())
function plusDays(n: number) {
  const base = Math.max(Date.parse(`${expiresOn.value || subExpiryDay.value}T00:00:00Z`), Date.now())
  expiresOn.value = isoDay(base + n * DAY)
}

function editSub(e: SubEdit, done: string) {
  const bad = checkSubEdit(e)
  if (bad) {
    msg.value = { ok: false, text: bad }
    return
  }
  return act(() => adminApi.editSubscription(props.id, e), done)
}
function saveSub() {
  const e: SubEdit = {}
  if (expiresOn.value && expiresOn.value !== subExpiryDay.value) e.expiresOn = expiresOn.value
  if (limitDelta.value) e.totalLimitDelta = limitDelta.value
  if (budgetDelta.value) e.budgetDeltaRub = budgetDelta.value
  return editSub(e, 'Подписка обновлена')
}
const subDirty = computed(() => (!!expiresOn.value && expiresOn.value !== subExpiryDay.value) || !!limitDelta.value || !!budgetDelta.value)

// ---------- профиль ----------
const email = ref('')
const note = ref('')
const confirmDelete = ref('')
function resetForms() {
  expiresOn.value = subExpiryDay.value
  limitDelta.value = budgetDelta.value = null
  confirmEnd.value = false
  email.value = d.value?.user.email ?? ''
  note.value = d.value?.note ?? ''
  confirmDelete.value = ''
}
function editUser(e: UserEdit, done: string) {
  const bad = checkUserEdit(e)
  if (bad) {
    msg.value = { ok: false, text: bad }
    return
  }
  return act(() => adminApi.editUser(props.id, e), done)
}
const emailDirty = computed(() => !!d.value && !!email.value.trim() && email.value.trim().toLowerCase() !== d.value.user.email)

async function remove() {
  await act(() => adminApi.removeUser(props.id, confirmDelete.value), 'Удалён')
  if (msg.value?.ok) emit('close')
}

// ---------- активность ----------
const actMax = computed(() => Math.max(1, ...(d.value?.days.map((x) => x.requests) ?? [])))
const pctOf = (a: number, b: number) => (b ? Math.min(100, (a / b) * 100) : 0)

const esc = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
onMounted(() => {
  load()
  document.addEventListener('keydown', esc)
  closeBtn.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', esc))
</script>

<template>
  <div class="ud" role="dialog" aria-modal="true" aria-labelledby="ud-title">
    <div class="ud__veil" @click="emit('close')"></div>
    <aside class="ud__panel">
      <header class="ud__head">
        <div class="ud__who">
          <h2 id="ud-title">{{ d?.user.login ?? 'Пользователь' }}</h2>
          <span class="mono muted">{{ id }}</span>
          <span v-if="d?.user.blocked" class="tag tag--bad">заблокирован</span>
        </div>
        <button ref="closeBtn" class="ud__x" aria-label="Закрыть" @click="emit('close')">×</button>
      </header>

      <p v-if="loadErr" class="err-box">{{ loadErr }}</p>
      <div v-else-if="d" class="ud__body">
        <p v-if="msg" :class="msg.ok ? 'ud__ok' : 'err-box'" role="status">{{ msg.text }}</p>

        <dl class="ud__facts">
          <div><dt>Логин</dt><dd>{{ d.user.login }}</dd></div>
          <div><dt>Email для чеков</dt><dd>{{ d.user.email ?? 'не указан' }}</dd></div>
          <div><dt>Telegram</dt><dd>{{ d.user.telegram ? 'подключён' : 'нет' }}</dd></div>
          <div><dt>Регистрация</dt><dd>{{ date(d.user.registeredAt) }}</dd></div>
          <div><dt>Оплачено</dt><dd>{{ rub(d.user.paidTotalRub) }}</dd></div>
          <div><dt>Расход API</dt><dd>{{ usd(d.user.spendUsd, 3) }}</dd></div>
          <div><dt>Активность</dt><dd>{{ d.user.lastActiveAt ? date(d.user.lastActiveAt) : 'не было' }}</dd></div>
          <div><dt>Сессий</dt><dd>{{ num(d.sessions) }}</dd></div>
        </dl>

        <!-- подписка -->
        <section class="ud__sec">
          <h3>Подписка</h3>
          <template v-if="d.sub">
            <p class="ud__plan">
              <span class="tag" :class="{ 'tag--media': d.sub.tier === 'media' }">{{ TIER_SHORT[d.sub.tier] }}</span>
              {{ PLAN_LABEL[d.sub.planId] }} · {{ date(d.sub.startedAt) }} - {{ date(d.sub.expiresAt) }}
              <span v-if="d.sub.source === 'admin'" class="muted">· выдана вручную</span>
            </p>
            <div class="ud__meters">
              <div>
                <span>Запросы</span><b>{{ num(d.sub.totalUsed) }} / {{ num(d.sub.totalLimit) }}</b>
                <div class="bar"><i :style="{ width: `${pctOf(d.sub.totalUsed, d.sub.totalLimit)}%` }"></i></div>
              </div>
              <div>
                <span>Сегодня</span><b>{{ num(d.sub.dailyUsed) }} / {{ num(d.sub.dailyLimit) }}</b>
                <div class="bar"><i :style="{ width: `${pctOf(d.sub.dailyUsed, d.sub.dailyLimit)}%` }"></i></div>
              </div>
              <div>
                <span>Бюджет</span><b>{{ rub(d.sub.spentRub) }} / {{ rub(d.sub.budgetRub) }}</b>
                <div class="bar"><i :class="{ 'is-bad': d.sub.spentRub > d.sub.budgetRub * 0.85 }" :style="{ width: `${pctOf(d.sub.spentRub, d.sub.budgetRub)}%` }"></i></div>
              </div>
              <div v-if="d.sub.tier === 'media'"><span>Генераций</span><b>{{ num(d.sub.genUsed) }}</b></div>
            </div>

            <form class="ud__form" @submit.prevent="saveSub">
              <label>
                <span>Действует до</span>
                <span class="ud__row">
                  <input v-model="expiresOn" class="field-sm" type="date" :min="minDay" :max="maxDay" />
                  <button type="button" class="btn btn--ghost ud__chip" @click="plusDays(7)">+7</button>
                  <button type="button" class="btn btn--ghost ud__chip" @click="plusDays(30)">+30</button>
                </span>
              </label>
              <label>
                <span>Запросов добавить</span>
                <span class="ud__row">
                  <input v-model.number="limitDelta" class="field-sm" type="number" step="1" inputmode="numeric" placeholder="например, 200 или -100" />
                  <button type="button" class="btn btn--ghost ud__chip" @click="limitDelta = (limitDelta ?? 0) + 100">+100</button>
                </span>
              </label>
              <label>
                <span>Бюджет добавить, ₽</span>
                <input v-model.number="budgetDelta" class="field-sm" type="number" step="1" inputmode="numeric" placeholder="внутренний лимит расхода" />
              </label>
              <div class="ud__row">
                <button class="btn btn--ink" :disabled="busy || !subDirty">Сохранить</button>
                <button v-if="subDirty" type="button" class="btn btn--ghost" @click="resetForms">Отменить</button>
              </div>
            </form>

            <div class="ud__row ud__quick">
              <label class="ud__switch">
                <input type="checkbox" role="switch" :checked="d.sub.autoRenew" :disabled="busy" @change="editSub({ autoRenew: !d.sub.autoRenew }, d.sub.autoRenew ? 'Автопродление выключено' : 'Автопродление включено')" />
                Автопродление
              </label>
              <button class="btn btn--ghost" :disabled="busy || !d.sub.dailyUsed" @click="editSub({ resetDaily: true }, 'Счётчик за сегодня обнулён')">Обнулить «сегодня»</button>
              <button v-if="!confirmEnd" class="btn btn--ghost ud__danger" :disabled="busy" @click="confirmEnd = true">Завершить</button>
              <span v-else class="ud__row">
                <button class="btn btn--danger" :disabled="busy" @click="editSub({ end: true }, 'Подписка завершена')">Завершить сейчас</button>
                <button class="btn btn--ghost" @click="confirmEnd = false">Нет</button>
              </span>
            </div>
          </template>
          <p v-else class="muted">Действующей подписки нет.</p>

          <form class="ud__grant" @submit.prevent="act(() => adminApi.grant(id, grantTier, grantPlan), `Выдано: ${TIER_SHORT[grantTier]}, ${PLAN_LABEL[grantPlan]}`)">
            <b>{{ d.sub ? 'Выдать новую' : 'Выдать подписку' }}</b>
            <span class="ud__row">
              <select v-model="grantTier" class="field-sm" aria-label="Тариф">
                <option value="text">{{ TIER_SHORT.text }}</option>
                <option value="media">{{ TIER_SHORT.media }}</option>
              </select>
              <select v-model="grantPlan" class="field-sm" aria-label="Период">
                <option v-for="p in (['week', 'month', 'quarter'] as const)" :key="p" :value="p">{{ PLAN_LABEL[p] }}</option>
              </select>
              <button class="btn btn--ink" :disabled="busy">Выдать</button>
            </span>
            <small class="muted">Остаток дней текущей подписки переносится, счётчики с нуля. В отчётах: платёж 0 ₽.</small>
          </form>
        </section>

        <!-- профиль -->
        <section class="ud__sec">
          <h3>Профиль</h3>
          <form class="ud__form" @submit.prevent="editUser({ email }, 'Email для чеков изменён')">
            <label>
              <span>Email <small class="muted">для чеков</small></span>
              <span class="ud__row">
                <input v-model="email" class="field-sm" type="email" autocomplete="off" spellcheck="false" maxlength="254" />
                <button class="btn btn--ink" :disabled="busy || !emailDirty">Сменить</button>
              </span>
            </label>
            <small v-if="emailDirty" class="muted">На этот адрес придёт следующий чек. Во входе email не участвует.</small>
          </form>
          <form class="ud__form" @submit.prevent="editUser({ note }, 'Заметка сохранена')">
            <label>
              <span>Заметка <small class="muted">видна только в панели</small></span>
              <textarea v-model="note" class="field-sm ud__note" rows="3" :maxlength="MAX_NOTE"></textarea>
            </label>
            <div class="ud__row">
              <button class="btn btn--ghost" :disabled="busy || note === d.note">Сохранить заметку</button>
              <small class="muted">{{ note.length }} / {{ MAX_NOTE }}</small>
            </div>
          </form>
        </section>

        <!-- доступ -->
        <section class="ud__sec">
          <h3>Доступ</h3>
          <div class="ud__row">
            <button class="btn btn--ghost" :disabled="busy || !d.sessions" @click="act(() => adminApi.logoutUser(id), 'Все входы закрыты')">Выйти на всех устройствах</button>
            <button class="btn btn--ghost" :disabled="busy" @click="act(() => adminApi.setBlocked(id, !d!.user.blocked), d!.user.blocked ? 'Разблокирован' : 'Заблокирован, входы закрыты')">
              {{ d.user.blocked ? 'Разблокировать' : 'Заблокировать' }}
            </button>
          </div>
          <form class="ud__grant" @submit.prevent="remove">
            <b>Удалить аккаунт</b>
            <small class="muted">Чаты, фото и подписки удаляются без возврата, платежи остаются обезличенными. Введите логин для подтверждения.</small>
            <span class="ud__row">
              <input v-model="confirmDelete" class="field-sm" type="text" :placeholder="d.user.login" autocomplete="off" spellcheck="false" aria-label="Логин для подтверждения" />
              <button class="btn btn--danger" :disabled="busy || confirmDelete.trim().toLowerCase() !== d.user.login">Удалить</button>
            </span>
          </form>
        </section>

        <!-- история -->
        <section class="ud__sec">
          <h3>Активность за 60 дней</h3>
          <p v-if="!d.days.length" class="muted">Запросов не было.</p>
          <div v-else class="ud__act" role="img" :aria-label="`Запросы по дням, максимум ${actMax}`">
            <i v-for="x in d.days" :key="x.date" :title="`${x.date}: ${x.requests} запр., ${usd(x.usd, 3)}${x.errors ? `, ошибок ${x.errors}` : ''}`" :style="{ height: `${Math.max(4, (x.requests / actMax) * 100)}%` }"></i>
          </div>
        </section>

        <section class="ud__sec">
          <h3>Платежи</h3>
          <p v-if="!d.payments.length" class="muted">Платежей нет.</p>
          <table v-else class="tbl">
            <tbody>
              <tr v-for="p in d.payments" :key="p.id">
                <td>{{ dateTime(p.at) }}</td>
                <td><span class="tag" :class="{ 'tag--media': p.tier === 'media' }">{{ TIER_SHORT[p.tier] }}</span> {{ PLAN_LABEL[p.planId] }}</td>
                <td class="r">{{ rub(p.amount) }}</td>
                <td :class="p.status === 'failed' ? 'bad' : 'muted'">{{ p.status === 'failed' ? 'не прошёл' : p.refunded ? 'возврат' : !p.amount ? 'вручную' : 'оплачен' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="d.history.length > 1" class="ud__sec">
          <h3>История подписок</h3>
          <table class="tbl">
            <tbody>
              <tr v-for="h in d.history" :key="h.id">
                <td><span class="tag" :class="{ 'tag--media': h.tier === 'media' }">{{ TIER_SHORT[h.tier] }}</span> {{ PLAN_LABEL[h.planId] }}</td>
                <td>{{ date(h.startedAt) }} - {{ date(h.expiresAt) }}</td>
                <td class="muted">{{ h.source === 'admin' ? 'вручную' : 'оплата' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <p v-else class="muted ud__body">Загружаем…</p>
    </aside>
  </div>
</template>

<style scoped>
.ud {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
}
.ud__veil {
  position: absolute;
  inset: 0;
  background: rgb(10 10 14 / 0.38);
  animation: ud-fade 0.18s var(--ease);
}
.ud__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  height: 100dvh;
  border-left: 1px solid var(--line);
  background: var(--bg);
  box-shadow: var(--shadow);
  animation: ud-in 0.22s var(--ease);
}
@keyframes ud-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}
@keyframes ud-fade {
  from {
    opacity: 0;
  }
}
.ud__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: max(16px, env(safe-area-inset-top)) 18px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-elev);
}
.ud__who {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-width: 0;
}
.ud__who h2 {
  flex-basis: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  font: 600 18px/1.25 var(--font-display);
}
.ud__x {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  font-size: 24px;
  line-height: 1;
}
.ud__x:hover {
  background: var(--bg-sunken);
}
.ud__body {
  display: grid;
  gap: 14px;
  padding: 16px 18px max(24px, env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ud__ok {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-s);
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  color: var(--ok);
  font-size: 14px;
}
.ud__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  margin: 0;
}
.ud__facts div {
  display: grid;
  gap: 2px;
}
.ud__facts dt {
  color: var(--text-3);
  font-size: 12px;
}
.ud__facts dd {
  margin: 0;
  font-weight: 600;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.ud__sec {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--bg-elev);
}
.ud__sec h3 {
  margin: 0;
  font: 600 15px/1.3 var(--font-display);
}
.ud__sec .tbl td {
  white-space: normal;
}
.ud__plan {
  margin: 0;
  font-size: 14px;
}
.ud__meters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}
.ud__meters > div {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 8px;
  font-size: 13px;
}
.ud__meters span {
  color: var(--text-2);
}
.ud__meters b {
  font-variant-numeric: tabular-nums;
}
.ud__meters .bar {
  grid-column: 1 / -1;
}
.bar > i.is-bad {
  background: var(--danger);
}
.ud__form {
  display: grid;
  gap: 10px;
}
.ud__form label {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--text-2);
}
.ud__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ud__row .field-sm {
  flex: 1 1 160px;
  width: auto;
}
.ud__row .btn {
  min-height: 38px;
  padding: 0 14px;
  font-size: 14px;
}
.ud__chip {
  padding: 0 10px !important;
}
.ud__quick {
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.ud__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-size: 14px;
  cursor: pointer;
}
.ud__switch input {
  width: 18px;
  height: 18px;
  accent-color: var(--ink);
}
.ud__danger {
  color: var(--danger);
}
.ud__grant {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 14px;
}
.ud__note {
  min-height: 72px;
  resize: vertical;
  font: inherit;
  font-size: 14px;
}
.ud__act {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 64px;
}
.ud__act i {
  flex: 1;
  min-width: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--accent);
}
@media (max-width: 520px) {
  .ud__meters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
