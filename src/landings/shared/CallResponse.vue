<script setup lang="ts">
import ChatFragment from './ChatFragment.vue'

const EXCHANGES = [
  {
    say: 'Сначала спросите как есть.',
    call: 'напиши поздравление коллеге с др, коротко',
    reply: 'Марина, с днём рождения! Пусть проекты сдаются вовремя, а отпуск наступает чаще. Спасибо, что с тобой так легко работать!',
  },
  {
    say: 'Потом уточните, что не так.',
    call: 'чуть официальнее и упомяни запуск приложения',
    reply: 'Марина, поздравляем с днём рождения! Запуск приложения — во многом ваша заслуга. Желаем сил, вдохновения и спокойных релизов.',
  },
  {
    say: 'В конце заберите готовое.',
    call: 'оформи как открытку от всей команды',
    reply: 'С днём рождения, Марина!\n\nЗапуск приложения в этом году — во многом ваша заслуга. Желаем сил, вдохновения, спокойных релизов и отпуска, который наступает чаще дедлайнов.\n\nКоманда мобильной разработки',
  },
]
</script>

<template>
  <section class="cr" aria-labelledby="cr-title">
    <h2 id="cr-title" class="cr__h">Как это выглядит</h2>
    <div v-for="(e, i) in EXCHANGES" :key="i" class="cr__ex" :class="{ 'cr__ex--final': i === EXCHANGES.length - 1 }">
      <p class="cr__say">{{ e.say }}</p>
      <p class="cr__call" data-ui>{{ e.call }}</p>
      <div class="cr__resp">
        <ChatFragment :messages="[{ role: 'assistant', text: e.reply }]" compact />
      </div>
    </div>
  </section>
</template>

<style scoped>
.cr {
  width: min(560px, 100%);
  margin-left: max(0px, calc(25% - 40px));
  padding-block: clamp(120px, 14vw, 200px);
}
.cr__h {
  margin: 0 0 56px;
  font: var(--h-weight, 500) 28px/1.15 var(--f-display);
  letter-spacing: -0.01em;
}
.cr__ex + .cr__ex {
  margin-top: 88px;
}
.cr__say {
  margin: 0 0 16px;
  font: 500 20px/1.3 var(--f-text);
}
.cr__call {
  margin: 0;
  padding: 20px;
  border-radius: 8px;
  background: var(--surface);
  font: 400 17px/1.5 var(--f-text);
}
.cr__resp {
  margin: 16px 0 0 56px;
}
.cr__ex--final .cr__resp {
  width: min(760px, calc(100vw - var(--margin) * 2 - 56px));
}
.cr__ex--final .cr__resp :deep(.cf) {
  font-size: 18px;
}
@media (max-width: 640px) {
  .cr {
    margin-left: 0;
  }
  .cr__resp {
    margin-left: 0;
    margin-top: 24px;
  }
  .cr__ex--final .cr__resp {
    width: 100%;
  }
}
</style>
