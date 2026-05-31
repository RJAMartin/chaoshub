import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index'
import { gameRegistry } from './core/registry/index'
import './assets/main.css'

async function bootstrap(): Promise<void> {
  // Initialize game registry (discovers all game modules)
  await gameRegistry.init()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

bootstrap().catch(console.error)
