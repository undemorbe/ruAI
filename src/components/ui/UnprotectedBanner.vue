<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import TelegramLinkDialog from '@/components/ui/TelegramLinkDialog.vue'
import { dismissFor, isDismissed } from '@/lib/dismiss'
import { useUserStore } from '@/stores/user'

/**
 * Плашка «Аккаунт не защищён»: вошёл, бот работает, Telegram не привязан.
 * compact: в чате, скрывается на сутки; block: аккаунт и оплата прошла; inline: строка у оплаты.
 */
const props = defineProps<{ variant: 'compact' | 'block' | 'inline' }>()
const user = useUserStore()
const DAY = 86_400_000
const DISMISS_ID = 'unprotected'
const hidden = ref(props.variant === 'compact' && isDismissed(DISMISS_ID))
const open = ref(false)
const show = computed(() => user.showUnprotected && !hidden.value)

function hide() {
  dismissFor(DISMISS_ID, DAY)
  hidden.value = true
}
</script>

<template>
  <div v-if="show" class="ub" :class="`ub--${variant}`" role="status">
    <Icon v-if="variant !== 'inline'" name="shield" :size="18" class="ub__ico" />
    <p class="ub__text">
      <strong>Аккаунт не защищён.</strong>
      <template v-if="variant === 'block'"> Подключите Telegram: вход будет подтверждаться в боте, а забытый пароль можно будет восстановить. Без этого доступ к аккаунту и подписке легко потерять.</template>
      <template v-else> Без Telegram нельзя восстановить пароль и подтвердить вход.</template>
    </p>
    <button type="button" class="ub__go" @click="open = true">Подключить Telegram</button>
    <button v-if="variant === 'compact'" type="button" class="ub__x" aria-label="Скрыть на сутки" @click="hide"><Icon name="x" :size="16" /></button>
  </div>
  <TelegramLinkDialog v-if="open" @close="open = false" />
</template>

<style scoped>
.ub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: var(--radius-s);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-elev));
  color: var(--text);
  font-size: 14px;
  line-height: 1.4;
}
.ub__ico {
  flex: none;
  color: var(--accent);
}
.ub__text {
  flex: 1 1 220px;
  margin: 0;
}
.ub__go {
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--ink);
  color: var(--ink-text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.ub__x {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: -6px -6px -6px 0;
  border: 0;
  background: none;
  color: var(--text-3);
  cursor: pointer;
}
.ub__x:hover {
  color: var(--text);
}
.ub--block {
  align-items: flex-start;
  padding: 16px;
}
.ub--block .ub__ico {
  margin-top: 2px;
}
.ub--inline {
  padding: 0;
  border: 0;
  background: none;
  font-size: 13px;
  color: var(--text-2);
}
.ub--inline strong {
  color: var(--text);
}
.ub--inline .ub__go {
  min-height: 0;
  padding: 0;
  border-radius: 0;
  background: none;
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
