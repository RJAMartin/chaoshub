<template>
  <AppShell>
    <router-view v-slot="{ Component }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>
  </AppShell>

  <!-- Global achievement toast -->
  <AchievementToast />
</template>

<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import AchievementToast from '@/components/AchievementToast.vue'
</script>
