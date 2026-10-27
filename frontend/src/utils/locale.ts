export type AppLocale = 'zh-CN' | 'zh-TW' | 'en-US';

// 应用支持的语言清单：本地存储恢复时用于校验，防止未知值混进 i18n locale
export const APP_LOCALES: AppLocale[] = ['zh-CN', 'zh-TW', 'en-US'];

// 依据 navigator.language 推断应用语言；繁体中文（含 zh-Hant-* / zh-HK / zh-MO）归入 zh-TW
export const detectBrowserLocale = (lang: string | null | undefined): AppLocale => {
  if (!lang) return 'en-US';
  if (['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant'].some(l => lang.includes(l))) {
    return 'zh-TW';
  }
  if (lang.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
};
