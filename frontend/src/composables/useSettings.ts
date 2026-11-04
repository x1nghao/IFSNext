// 五项核心设置：表格 ID / 后端地址 / 签到表单链接 / 抽奖开关 / 撤销二次确认开关。
// 单一持久化键 ifsnext_settings，任何一项变化都整体落盘。
import { ref, computed, watch } from 'vue';
import { extractSpreadsheetId } from '@/utils/agents';
import { isSafeHttpUrl } from '@/utils/url';
import { i18n } from '@/i18n';
import { useToast } from './useToast';

const { t } = i18n.global;
const { addError } = useToast();

const spreadsheetId = ref('');
const apiBaseUrl = ref('https://ifsapi.boki.one');
const checkinFormUrl = ref('');
const lotteryEnabled = ref(false);
// 撤销签到二次确认：默认开启（长按 1 秒），关闭后点击直接撤销
const undoHoldRequired = ref(true);

// 表格 ID 归一化：粘贴完整 Google Sheets 链接时自动提取出 ID
watch(spreadsheetId, (newVal) => {
  if (!newVal) return;
  const extracted = extractSpreadsheetId(newVal);
  if (extracted) {
    spreadsheetId.value = extracted;
  }
});

// 设置自动保存：任一项变化即整体写回 localStorage
watch([spreadsheetId, apiBaseUrl, checkinFormUrl, lotteryEnabled, undoHoldRequired], ([sid, base, url, lot, hold]) => {
  try {
    localStorage.setItem('ifsnext_settings', JSON.stringify({
      spreadsheetId: sid || '',
      apiBaseUrl: base || '',
      checkinFormUrl: url || '',
      lotteryEnabled: lot === true,
      undoHoldRequired: hold !== false
    }));
  } catch (e: any) {
    addError(t('error.settingsAutoSaveFailed', { message: e.message }));
  }
});

const loadSettings = () => {
  try {
    const saved = localStorage.getItem('ifsnext_settings');
    if (saved) {
      const settings = JSON.parse(saved);
      spreadsheetId.value = settings.spreadsheetId || '';
      apiBaseUrl.value = settings.apiBaseUrl || 'https://ifsapi.boki.one';
      checkinFormUrl.value = settings.checkinFormUrl || '';
      lotteryEnabled.value = settings.lotteryEnabled === true;
      undoHoldRequired.value = settings.undoHoldRequired !== false; // 默认开
    }
  } catch (e: any) {
    addError(t('error.settingsLoadFailed', { message: e.message }));
  }
};

// 仅放行 http(s) 链接，避免 javascript: 等伪协议进入二维码与 <a href>
const safeCheckinFormUrl = computed(() => (isSafeHttpUrl(checkinFormUrl.value) ? checkinFormUrl.value : ''));

export function useSettings() {
  return {
    spreadsheetId,
    apiBaseUrl,
    checkinFormUrl,
    lotteryEnabled,
    undoHoldRequired,
    safeCheckinFormUrl,
    loadSettings,
  };
}
