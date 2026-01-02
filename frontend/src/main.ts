import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import './style.css'
import App from './App.vue'
import { messages } from './locales'

const getBrowserLocale = () => {
  const lang = navigator.language;
  if (['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant'].some(l => lang.includes(l))) {
    return 'zh-TW';
  }
  if (lang.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
};

const defaultLang = localStorage.getItem('ifsnext_lang') || getBrowserLocale();

const i18n = createI18n({
  legacy: false,
  locale: defaultLang,
  fallbackLocale: 'zh-CN',
  messages
})

const app = createApp(App)
app.use(i18n)
app.mount('#app')
