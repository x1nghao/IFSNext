// 错误 Toast：addError 是异常的唯一界面出口，4 秒自动消失。
// 模块级单例：任何领域逻辑（含组件外运行的 composables）都能上抛错误。
import { ref } from 'vue';

const toast = ref<{ id: number; message: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// 只清定时器，不动当前提示内容（应用卸载清理时用，与原行为一致）
const clearToastTimer = () => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
};

const dismissToast = () => {
  clearToastTimer();
  toast.value = null;
};

const addError = (message: string) => {
  toast.value = { id: Date.now(), message };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, 4000);
};

export function useToast() {
  return { toast, addError, dismissToast, clearToastTimer };
}
