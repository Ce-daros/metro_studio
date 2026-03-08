import 'maplibre-gl/dist/maplibre-gl.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './lib/animation/transitions.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
