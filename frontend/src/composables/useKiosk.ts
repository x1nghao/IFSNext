// 大屏展示模式开关与静默轮询：覆盖层的二维码/跑马灯测量等展示逻辑在 KioskOverlay 组件内。
import { ref, watch } from 'vue';
import { useAgentData } from './useAgentData';
import { useSettings } from './useSettings';

const { loadData } = useAgentData();
const { spreadsheetId } = useSettings();

const kioskMode = ref(false);
let kioskTimer: ReturnType<typeof setInterval> | null = null;

const enterKiosk = () => {
  kioskMode.value = true;
};

// 进入大屏即静默刷新一次并每 10 秒轮询；退出时停表
watch(kioskMode, (open) => {
  if (open) {
    loadData(false, true);
    kioskTimer = setInterval(() => {
      if (spreadsheetId.value) loadData(false, true);
    }, 10000);
    // 二维码渲染与名单溢出测量由覆盖层组件在挂载后自行驱动
  } else if (kioskTimer) {
    clearInterval(kioskTimer);
    kioskTimer = null;
  }
});

// 应用卸载时停掉大屏轮询定时器（与原清理行为一致）
const stopKioskTimer = () => {
  if (kioskTimer) {
    clearInterval(kioskTimer);
    kioskTimer = null;
  }
};

export function useKiosk() {
  return { kioskMode, enterKiosk, stopKioskTimer };
}
