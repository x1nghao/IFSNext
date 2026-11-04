// PWA 与连接状态：安装提示、离线横幅的数据来源。
// 窗口级监听的启停由 App.vue 调用 initPwa/disposePwa 完成。
import { ref } from 'vue';
import { i18n } from '@/i18n';
import { useToast } from './useToast';

const { t } = i18n.global;
const { addError } = useToast();

const canInstall = ref(false);
let deferredPrompt: any = null;

const isOffline = ref(typeof navigator !== 'undefined' && !navigator.onLine);
const handleOnline = () => { isOffline.value = false; };
const handleOffline = () => { isOffline.value = true; };

const installPWA = async () => {
  try {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    canInstall.value = false;
  } catch (e: any) {
    addError(t('error.installFailed', { message: e.message }));
  }
};

const handleBeforeInstallPrompt = (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
  canInstall.value = true;
};

const initPwa = () => {
  // 独立窗口（已安装）形态：根元素与 body 挂 pwa 标记，样式按需收紧留白
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ((navigator as any).standalone);
  if (isStandalone) {
    document.documentElement.classList.add('pwa');
    document.body.classList.add('pwa');
  }
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
};

const disposePwa = () => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
};

export function usePwa() {
  return { canInstall, isOffline, installPWA, initPwa, disposePwa };
}
