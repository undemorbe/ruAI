<script setup lang="ts">
import Panel from '../ui/Panel.vue'
import RequestFeed from '../ui/RequestFeed.vue'
</script>

<template>
  <Panel title="Последние запросы" note="вопрос, ответ, фото и цена каждого запроса; просмотр пишется в журнал">
    <RequestFeed />
  </Panel>
</template>
