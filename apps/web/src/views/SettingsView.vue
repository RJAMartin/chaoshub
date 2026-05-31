<template>
  <div class="settings-view">
    <div class="settings-inner">
      <h1 class="page-title">Settings</h1>
      <div class="card">
        <p style="color: var(--color-text-muted); font-size:0.875rem">More settings coming soon. Manage your profile on the <RouterLink to="/profile" class="neon-cyan">Profile</RouterLink> page.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.settings-view { flex: 1; padding: 3rem 1.5rem; }
.settings-inner { max-width: 600px; margin: 0 auto; }
.page-title { font-size: 2rem; font-weight: 800; margin: 0 0 2rem; }
</style>
