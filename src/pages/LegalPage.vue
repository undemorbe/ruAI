<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/ui/AppHeader.vue'
import { LEGAL_DOCS, LEGAL_ORDER, isLegalSlug } from '@/content/legal/docs'
import { OPERATOR, legalDate, tgHandle, tgLink } from '@/content/legal/operator'
import { consent, resetConsent } from '@/lib/analytics'

const route = useRoute()
/** Без параметра — страница реквизитов и список документов. */
const doc = computed(() => (isLegalSlug(route.params.doc) ? LEGAL_DOCS[route.params.doc] : null))
const unknown = computed(() => !!route.params.doc && !doc.value)
// title и мета страницы ставит роутер из src/seo/pages.ts
const consentLabel = computed(() =>
  consent.value === 'granted' ? 'Яндекс Метрика включена.' : consent.value === 'denied' ? 'Яндекс Метрика отключена.' : 'Вы ещё не выбрали: Метрика отключена.',
)

</script>

<template>
  <div class="page">
    <AppHeader />
    <main class="lg">
      <nav class="lg__tabs" aria-label="Документы">
        <RouterLink :to="{ name: 'legal' }" :aria-current="!doc && !unknown ? 'page' : undefined" exact-active-class="">Документы</RouterLink>
        <RouterLink
          v-for="s in LEGAL_ORDER"
          :key="s"
          :to="{ name: 'legal', params: { doc: s } }"
          :aria-current="doc?.slug === s ? 'page' : undefined"
        >
          {{ LEGAL_DOCS[s].title }}
        </RouterLink>
      </nav>

      <article v-if="doc" class="lg__doc">
        <h1>{{ doc.title }}</h1>
        <p class="lg__meta">Редакция от {{ legalDate(doc.version) }}</p>
        <p class="lg__lead">{{ doc.lead }}</p>
        <section v-for="s in doc.sections" :key="s.h">
          <h2>{{ s.h }}</h2>
          <template v-for="(b, i) in s.body" :key="i">
            <p v-if="typeof b === 'string'">{{ b }}</p>
            <ul v-else-if="'list' in b">
              <li v-for="li in b.list" :key="li">{{ li }}</li>
            </ul>
            <div v-else class="lg__table">
              <table>
                <thead>
                  <tr><th v-for="h in b.table.head" :key="h" scope="col">{{ h }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in b.table.rows" :key="ri"><td v-for="(c, ci) in r" :key="ci">{{ c }}</td></tr>
                </tbody>
              </table>
            </div>
          </template>
        </section>
        <section v-if="doc.slug === 'privacy'" class="lg__consent">
          <h2>Ваш выбор по аналитике</h2>
          <p>{{ consentLabel }}</p>
          <button type="button" class="btn btn--ghost" @click="resetConsent">Изменить выбор</button>
        </section>
      </article>

      <article v-else-if="unknown" class="lg__doc">
        <h1>Документ не найден</h1>
        <p><RouterLink :to="{ name: 'legal' }">Все документы</RouterLink></p>
      </article>

      <article v-else class="lg__doc">
        <h1>Документы</h1>
        <p class="lg__lead">ChatGPT на {{ OPERATOR.site.replace(/^https?:\/\//, '') }} — независимый сервис, не связан с OpenAI. ChatGPT — товарный знак OpenAI.</p>
        <dl class="lg__req">
          <div>
            <dt>Email для обращений</dt>
            <dd><a :href="`mailto:${OPERATOR.email}`">{{ OPERATOR.email }}</a></dd>
          </div>
          <div>
            <dt>Поддержка в Telegram</dt>
            <dd><a :href="tgLink(OPERATOR.supportBot)" target="_blank" rel="noopener noreferrer">{{ tgHandle(OPERATOR.supportBot) }}</a></dd>
          </div>
          <div>
            <dt>Вход и двухфакторная аутентификация</dt>
            <dd>
              <a :href="tgLink(OPERATOR.authBot)" target="_blank" rel="noopener noreferrer">{{ tgHandle(OPERATOR.authBot) }}</a>: подтверждение входа и сброс пароля. Обращения не принимает, пароль и коды никогда не спрашивает.
            </dd>
          </div>
        </dl>
        <h2>Документы</h2>
        <ul class="lg__docs">
          <li v-for="s in LEGAL_ORDER" :key="s">
            <RouterLink :to="{ name: 'legal', params: { doc: s } }">{{ LEGAL_DOCS[s].title }}</RouterLink>
            <span>редакция от {{ legalDate(LEGAL_DOCS[s].version) }}</span>
          </li>
        </ul>
      </article>
    </main>
  </div>
</template>

<style scoped>
.lg__consent {
  margin-top: 32px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.lg {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 720px);
  gap: clamp(24px, 5vw, 64px);
  justify-content: center;
  padding: clamp(28px, 5vw, 56px) clamp(16px, 4vw, 40px) 80px;
}
.lg__tabs {
  position: sticky;
  top: 80px;
  align-self: start;
  display: grid;
  gap: 2px;
}
.lg__tabs a {
  padding: 9px 12px;
  border-radius: var(--radius-s);
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.35;
}
.lg__tabs a:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
.lg__tabs a[aria-current='page'] {
  background: var(--bg-sunken);
  color: var(--text);
  font-weight: 600;
}
.lg__doc {
  min-width: 0;
  font-size: 16px;
  line-height: 1.6;
}
.lg__doc h1 {
  margin: 0;
  font: 700 clamp(28px, 4vw, 40px) / 1.15 var(--font-display);
  letter-spacing: -0.02em;
}
.lg__meta {
  margin: 10px 0 0;
  color: var(--text-3);
  font-size: 14px;
}
.lg__lead {
  margin: 20px 0 8px;
  font-size: 18px;
  color: var(--text-2);
}
.lg__doc h2 {
  margin: 36px 0 10px;
  font: 600 20px/1.3 var(--font-display);
}
.lg__doc p {
  margin: 0 0 12px;
}
.lg__doc ul {
  margin: 0 0 12px;
  padding-left: 22px;
}
.lg__doc li + li {
  margin-top: 6px;
}
.lg__doc a {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.lg__table {
  overflow-x: auto;
  margin: 4px 0 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
}
.lg__table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.45;
}
.lg__table th,
.lg__table td {
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--line);
}
.lg__table td:not(:first-child) {
  white-space: nowrap;
}
.lg__table tr:last-child td {
  border-bottom: 0;
}
.lg__table th {
  background: var(--bg-sunken);
  font-weight: 600;
  white-space: nowrap;
}
.lg__req {
  display: grid;
  margin: 24px 0 0;
  border-top: 1px solid var(--line);
}
.lg__req div {
  display: grid;
  grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.lg__req dt {
  color: var(--text-3);
}
.lg__req dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.lg__docs {
  list-style: none;
  padding: 0 !important;
}
.lg__docs li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.lg__docs span {
  color: var(--text-3);
  font-size: 14px;
}
@media (max-width: 760px) {
  .lg {
    grid-template-columns: minmax(0, 1fr);
  }
  .lg__tabs {
    position: static;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .lg__tabs a {
    flex: none;
    border: 1px solid var(--line);
  }
  .lg__req div {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}
</style>
