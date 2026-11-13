<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import Composer from '@/components/chat/Composer.vue'
import MessageItem from '@/components/chat/MessageItem.vue'
import PaywallDialog from '@/components/chat/PaywallDialog.vue'
import UsageMeter from '@/components/chat/UsageMeter.vue'
import Icon from '@/components/ui/Icon.vue'
import type { LimitCode } from '@/api'
import { MODEL } from '@/config/app'
import { PAYWALL_CODES } from '@/lib/limits'
import { useChatStore } from '@/stores/chat'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const user = useUserStore()

const sideOpen = ref(false)
const paywall = ref<LimitCode | null>(null)
const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof Composer> | null>(null)
let stick = true

const SUGGESTIONS = [
  { icon: 'pen', text: 'Напиши вежливое письмо о переносе встречи' },
  { icon: 'code', text: 'Объясни, что делает этот SQL-запрос' },
  { icon: 'book', text: 'Составь план подготовки к ЕГЭ по физике' },
  { icon: 'route', text: 'Маршрут на 3 дня по Казани' },
]

function scrollToEnd(force = false) {
  const el = scroller.value
  if (el && (stick || force)) el.scrollTop = el.scrollHeight
}
function onScroll() {
  const el = scroller.value
  if (el) stick = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

watch(
  () => chat.messages.map((m) => m.content.length).join(),
  () => nextTick(() => scrollToEnd()),
)

const paramId = () => (typeof route.params.id === 'string' ? route.params.id : null)

watch(paramId, async (id) => {
  if (id !== chat.activeId) {
    await chat.open(id)
    nextTick(() => scrollToEnd(true))
  }
})

onMounted(async () => {
  await chat.loadChats()
  await chat.open(paramId())
  nextTick(() => scrollToEnd(true))
  // Landing CTAs pass a ready question: /chat?q=...
  const q = route.query.q
  if (typeof q === 'string' && q.trim() && !paramId()) {
    router.replace({ name: 'chat' })
    await send(q)
  }
})

async function send(text: string) {
  stick = true
  const id = await chat.send(text)
  if (id && id !== paramId()) router.replace({ name: 'chat', params: { id } })
}

async function continueReply() {
  stick = true
  await chat.continueReply()
}

// Отказ по лимиту: текст возвращается в поле ввода, при нехватке запросов — диалог.
watch(
  () => chat.refusal,
  (r) => {
    if (!r) return
    nextTick(() => composer.value?.setText(r.draft))
    if (PAYWALL_CODES.includes(r.code) || r.code === 'daily_limit') paywall.value = r.code
  },
)

function select(id: string | null) {
  sideOpen.value = false
  router.push(id ? { name: 'chat', params: { id } } : { name: 'chat' })
  if (!id) nextTick(() => composer.value?.focus())
}
</script>

<template>
  <div class="chat">
    <ChatSidebar
      :chats="chat.chats"
      :active-id="chat.activeId"
      :open="sideOpen"
      :user-label="user.displayName"
      :is-paid="user.isPaid"
      @select="select"
      @remove="chat.remove"
      @close="sideOpen = false"
    />

    <main class="main">
      <header class="top">
        <button class="top__menu" aria-label="Открыть меню" @click="sideOpen = true"><Icon name="menu" /></button>
        <span class="top__model" :title="MODEL.hint">{{ MODEL.name }}</span>
        <span class="top__spacer" />
        <UsageMeter :usage="user.usage" />
        <button class="top__icon top__new" aria-label="Новый чат" @click="select(null)"><Icon name="edit" /></button>
        <RouterLink to="/pricing" class="top__icon" aria-label="Помощь и тарифы"><Icon name="help" /></RouterLink>
      </header>

      <section v-if="!chat.messages.length" class="empty">
        <h1 class="empty__title">Что у тебя сегодня на уме?</h1>
        <Composer ref="composer" :streaming="chat.streaming" @send="send" @stop="chat.stop" />
        <p v-if="chat.refusal && !paywall" class="notice" role="status">{{ chat.refusal.message }}</p>
        <div class="empty__hints">
          <button v-for="s in SUGGESTIONS" :key="s.text" class="empty__hint" @click="send(s.text)">
            <Icon :name="s.icon" :size="16" /> {{ s.text }}
          </button>
        </div>
      </section>

      <template v-else>
        <div ref="scroller" class="feed" @scroll.passive="onScroll">
          <div class="feed__inner">
            <MessageItem v-for="m in chat.messages" :key="m.id" :message="m" />
            <p v-if="chat.error" class="feed__error">{{ chat.error }}</p>
            <div v-if="chat.canContinue" class="cont">
              <button class="cont__btn" @click="continueReply"><Icon name="arrow" :size="15" /> Продолжить ответ</button>
              <span class="cont__note">Ответ упёрся в лимит длины. «Продолжи» — это ещё один запрос.</span>
            </div>
          </div>
        </div>
        <div class="dock">
          <p v-if="chat.refusal && !paywall" class="notice" role="status">{{ chat.refusal.message }}</p>
          <Composer ref="composer" :streaming="chat.streaming" @send="send" @stop="chat.stop" />
        </div>
      </template>

      <p class="disclaimer">Нейросеть может ошибаться — проверяйте важное. Независимый сервис, не связан с OpenAI.</p>
    </main>

    <PaywallDialog v-if="paywall" :code="paywall" @close="paywall = null" />
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-elev);
}
.main {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  padding-top: max(10px, env(safe-area-inset-top));
}
.top__menu {
  display: none;
  padding: 8px;
  border-radius: 10px;
}
.top__model {
  padding: 8px 10px;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
}
.top__spacer {
  flex: 1;
}
.notice {
  margin: 0 0 8px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--bg-sunken);
  font-size: 14px;
  color: var(--text);
}
.empty .notice {
  width: 100%;
  margin: -12px 0 0;
}
.cont {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: -10px;
}
.cont__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  font-size: 14px;
  transition: background 0.2s;
}
.cont__btn:hover {
  background: var(--bg-sunken);
}
.cont__note {
  font-size: 12px;
  color: var(--text-3);
}
.top__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: var(--text-2);
}
.top__icon:hover {
  background: var(--bg-sunken);
  color: var(--text);
}
.top__new {
  display: none;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 0 16px 8vh;
}
.empty__title {
  margin: 0;
  font: 500 clamp(22px, 3.2vw, 30px) / 1.2 var(--font-display);
  letter-spacing: -0.02em;
  text-align: center;
  animation: rise 0.6s var(--ease) both;
}
.empty__hints {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.empty__hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-2);
  transition:
    background 0.2s,
    color 0.2s;
}
.empty__hint:hover {
  background: var(--bg-sunken);
  color: var(--text);
}

.feed {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.feed__inner {
  display: flex;
  flex-direction: column;
  gap: 26px;
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 18px 16px 32px;
}
.feed__error {
  color: var(--danger);
  font-size: 14px;
}
.dock {
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 0 16px;
}
.disclaimer {
  margin: 8px 0 0;
  padding: 0 16px max(10px, env(safe-area-inset-bottom));
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 860px) {
  .top__menu,
  .top__new {
    display: grid;
  }
  .empty {
    justify-content: flex-end;
    padding-bottom: 8px;
  }
  .empty__title {
    margin-bottom: auto;
    margin-top: 22vh;
  }
  .empty__hints {
    order: -1;
    flex-wrap: nowrap;
    justify-content: flex-start;
    width: calc(100% + 32px);
    margin: 0 -16px;
    padding: 0 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .empty__hint {
    flex: none;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
</style>
