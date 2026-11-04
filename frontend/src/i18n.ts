// i18n 实例的唯一创建点：main.ts 装配，composables 也可直接引用全局 composer。
// 独立成模块的原因：部分领域逻辑（数据加载/签到核验等）不在组件 setup 内运行，
// 拿不到 useI18n() 的组件上下文，只能引用这里导出的全局实例拼装可行动报错文案。
import { createI18n } from 'vue-i18n';
import { messages } from './locales';
import { detectBrowserLocale, APP_LOCALES } from './utils/locale';
import type { AppLocale } from './utils/locale';

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

export { i18n };
