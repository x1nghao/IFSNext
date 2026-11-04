// 主题模式：auto 跟随系统，light/dark 手动固定；恢复与持久化都在本模块内闭环。
import { ref, computed, watch } from 'vue';

type ThemeMode = 'auto' | 'light' | 'dark';

const systemPrefersDark = ref(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

const themeMode = ref<ThemeMode>('auto');
try {
  const savedTheme = localStorage.getItem('ifsnext_theme');
  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') {
    themeMode.value = savedTheme;
  }
} catch (e) {}

const isDark = computed(() => (themeMode.value === 'auto' ? systemPrefersDark.value : themeMode.value === 'dark'));

const setThemeMode = (mode: string) => {
  themeMode.value = mode as ThemeMode;
  try { localStorage.setItem('ifsnext_theme', mode); } catch (e) {}
};

// 暗色 class 与状态即时同步（immediate 保证首帧即正确，不闪浅色）
watch(isDark, (val) => {
  document.documentElement.classList.toggle('dark', val);
}, { immediate: true });

// ── 系统偏好监听：由 App.vue 在 onMounted/onUnmounted 里启停 ──
let prefersDarkMql: MediaQueryList | null = null;
let prefersDarkHandler: ((e: MediaQueryListEvent) => void) | null = null;

const initTheme = () => {
  const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mql) {
    systemPrefersDark.value = mql.matches;
    prefersDarkHandler = (e: MediaQueryListEvent) => { systemPrefersDark.value = e.matches; };
    if (mql.addEventListener) mql.addEventListener('change', prefersDarkHandler); else mql.addListener(prefersDarkHandler);
    prefersDarkMql = mql;
  }
  document.documentElement.classList.toggle('dark', isDark.value);
};

const disposeTheme = () => {
  if (prefersDarkMql && prefersDarkHandler) {
    if (prefersDarkMql.removeEventListener) prefersDarkMql.removeEventListener('change', prefersDarkHandler);
    else prefersDarkMql.removeListener(prefersDarkHandler);
  }
  prefersDarkMql = null;
  prefersDarkHandler = null;
};

export function useTheme() {
  return { themeMode, setThemeMode, initTheme, disposeTheme };
}
