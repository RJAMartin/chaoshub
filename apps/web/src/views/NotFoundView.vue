<template>
  <div class="notfound-view">
    <div class="notfound-inner">
      <div class="notfound-code glow-pink neon-pink">404</div>
      <h1 class="notfound-title">Page Not Found</h1>
      <p class="notfound-desc">This page doesn't exist or the room has expired.</p>
      <RouterLink to="/" class="btn btn-primary">Back to Home</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.notfound-view { flex: 1; display: flex; align-items: center; justify-content: center; }
.notfound-inner { text-align: center; }
.notfound-code { font-size: 8rem; font-weight: 900; line-height: 1; margin-bottom: 1rem; }
.notfound-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.75rem; }
.notfound-desc { color: var(--color-text-secondary); margin-bottom: 2rem; }
</style>
