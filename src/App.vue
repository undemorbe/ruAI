<script setup lang="ts">
import { onMounted } from 'vue'
import CookieBanner from '@/components/ui/CookieBanner.vue'
import { useUserStore } from '@/stores/user'

const user = useUserStore()
onMounted(() => user.ensure())
</script>

<template>
  <RouterView />
  <CookieBanner />
</template>
