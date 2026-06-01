<template>
  <AppShell>
    <ErrorBoundary>
      <router-view v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </ErrorBoundary>
  </AppShell>

  <!-- Global achievement toast -->
  <AchievementToast />
</template>

<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import AchievementToast from '@/components/AchievementToast.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>
