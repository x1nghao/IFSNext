import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import './style.css'
import App from './App.vue'
import { messages } from './locales'
import { detectBrowserLocale, APP_LOCALES } from './utils/locale'
import type { AppLocale } from './utils/locale'

let savedLang: string | null = null;
try {
  savedLang = localStorage.getItem('ifsnext_lang');
} catch {}

// 恢复的语言先做合法性校验：历史版本或手工改写可能留下未知值，
// 直接采用会让所有文案落到回退语言；此时应重新按浏览器语言探测
const defaultLang: AppLocale =
  savedLang && APP_LOCALES.includes(savedLang as AppLocale)
    ? (savedLang as AppLocale)
    : detectBrowserLocale(navigator.language);

const i18n = createI18n({
  legacy: false,
  locale: defaultLang,
  fallbackLocale: 'zh-CN',
  messages
})

const app = createApp(App)
app.use(i18n)
app.mount('#app')
