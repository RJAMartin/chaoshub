import { createRouter, createWebHashHistory } from 'vue-router'
import { useRoomStore } from '@/stores/index.js'

// Using hash history for GitHub Pages compatibility (no server config needed)
const router = createRouter({
  history: createWebHashHistory(import.meta.env.VITE_BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/games',
      name: 'games',
      component: () => import('@/views/GameLibraryView.vue'),
    },
    {
      path: '/room/:id',
      name: 'room',
      component: () => import('@/views/RoomView.vue'),
      beforeEnter: (to) => {
        // If we have a roomCode in query (invite link), just let through
        // Validation happens inside RoomView
        return true
      },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
