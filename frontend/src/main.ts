import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import './style.css'
import App from './App.vue'
import { messages } from './locales'
import { detectBrowserLocale } from './utils/locale'

let savedLang: string | null = null;
try {
  savedLang = localStorage.getItem('ifsnext_lang');
} catch {}

const defaultLang = savedLang || detectBrowserLocale(navigator.language);

const i18n = createI18n({
  legacy: false,
  locale: defaultLang,
  fallbackLocale: 'zh-CN',
  messages
})

const app = createApp(App)
app.use(i18n)
app.mount('#app')
