<script setup lang="ts">
/**
 * A true-size fragment of the ruAI chat, used as the "picture" of the product on landings.
 * Styled by the host variant's tokens (--ui-*), falls back to a neutral light theme.
 */
defineProps<{
  messages: { role: 'user' | 'assistant'; text: string }[]
  title?: string
  typing?: boolean
  caret?: boolean
  composer?: string
  compact?: boolean
}>()
</script>

<template>
  <div class="cf" :class="{ 'cf--compact': compact }" data-ui>
    <div v-if="title" class="cf__top">
      <span class="cf__model">{{ title }}</span>
      <span class="cf__dot" aria-hidden="true" />
    </div>
    <div class="cf__feed">
      <p v-for="(m, i) in messages" :key="i" class="cf__msg" :class="`cf__msg--${m.role}`">
        {{ m.text }}<span v-if="caret && i === messages.length - 1 && m.role === 'assistant'" class="cf__caret" aria-hidden="true" />
      </p>
      <p v-if="typing" class="cf__msg cf__msg--assistant cf__dots" aria-label="ruAI печатает"><i /><i /><i /></p>
    </div>
    <div v-if="composer !== undefined" class="cf__composer">
      <span>{{ composer || 'Спросите ruAI' }}</span>
      <b aria-hidden="true">↑</b>
    </div>
  </div>
</template>

<style scoped>
.cf {
  --cf-bg: var(--ui-bg, #ffffff);
  --cf-ink: var(--ui-ink, #16151a);
  --cf-soft: var(--ui-soft, #6b6873);
  --cf-bubble: var(--ui-bubble, #f1efea);
  --cf-accent: var(--ui-accent, #16151a);
  --cf-accent-ink: var(--ui-accent-ink, #ffffff);
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--cf-bg);
  color: var(--cf-ink);
  font-family: var(--ui-font, 'Golos Text', system-ui, sans-serif);
  font-size: 15px;
  line-height: 1.5;
  border-radius: 14px;
  overflow: hidden;
  text-align: left;
  letter-spacing: 0;
  text-transform: none;
}
.cf__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 4px;
  font-weight: 600;
  font-size: 14px;
}
.cf__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2fbf71;
}
.cf__feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
}
.cf__msg {
  margin: 0;
  max-width: 88%;
  white-space: pre-wrap;
}
.cf__msg--user {
  align-self: flex-end;
  padding: 9px 14px;
  border-radius: 18px 18px 4px 18px;
  background: var(--cf-bubble);
}
.cf__msg--assistant {
  align-self: flex-start;
}
.cf__caret {
  display: inline-block;
  width: 0.5em;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--cf-ink);
  animation: cf-blink 0.9s steps(2) infinite;
}
.cf__dots {
  display: flex;
  gap: 5px;
  padding: 6px 0;
}
.cf__dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cf-soft);
  animation: cf-bounce 1s infinite;
}
.cf__dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.cf__dots i:nth-child(3) {
  animation-delay: 0.3s;
}
.cf__composer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 12px 12px;
  padding: 8px 8px 8px 16px;
  border-radius: 999px;
  background: var(--cf-bubble);
  color: var(--cf-soft);
}
.cf__composer b {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--cf-accent);
  color: var(--cf-accent-ink);
}
.cf--compact {
  font-size: 14px;
}
@keyframes cf-blink {
  to {
    opacity: 0;
  }
}
@keyframes cf-bounce {
  50% {
    transform: translateY(-4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cf__caret,
  .cf__dots i {
    animation: none;
  }
}
</style>
