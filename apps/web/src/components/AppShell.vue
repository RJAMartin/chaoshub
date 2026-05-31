<template>
  <div class="app-shell">
    <AppNav />
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppNav from './AppNav.vue'
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
}
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* allow flex children to shrink below content size */
}
</style>
