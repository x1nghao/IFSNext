import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import './style.css'
import App from './App.vue'
import { messages } from './locales'

const defaultLang = localStorage.getItem('ifsnext_lang') || (navigator.language && navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US');

const i18n = createI18n({
  legacy: false,
  locale: defaultLang,
  fallbackLocale: 'zh-CN',
  messages
})

const app = createApp(App)
app.use(i18n)
app.mount('#app')
