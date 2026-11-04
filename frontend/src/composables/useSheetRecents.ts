// 历史场次：成功加载过的表格自动入册，设置页可一键切换。
// 持久化容量由 recents 工具统一裁决（CAP=6），本模块只管读写与切换动作。
import { ref } from 'vue';
import { upsertSheetRecent, removeSheetRecent } from '@/utils/recents';
import type { SheetRecent } from '@/utils/recents';
import { useAppView } from './useAppView';
import { useSettings } from './useSettings';

const SHEET_RECENTS_STORAGE_KEY = 'ifsnext_sheet_recents';
const SHEET_RECENTS_CAP = 6;

const sheetRecents = ref<SheetRecent[]>([]);
const { currentView } = useAppView();
const { spreadsheetId } = useSettings();

const loadSheetRecents = () => {
  try {
    const raw = localStorage.getItem(SHEET_RECENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    sheetRecents.value = Array.isArray(parsed)
      ? parsed.filter((r: any) => r && typeof r.id === 'string' && r.id)
      : [];
  } catch (e) {
    sheetRecents.value = [];
  }
};

const persistSheetRecents = () => {
  try {
    localStorage.setItem(SHEET_RECENTS_STORAGE_KEY, JSON.stringify(sheetRecents.value));
  } catch (e) {}
};

const recordSheetRecent = (id: string) => {
  if (!id) return;
  sheetRecents.value = upsertSheetRecent(sheetRecents.value, id, Date.now(), SHEET_RECENTS_CAP);
  persistSheetRecents();
};

const removeSheetRecentEntry = (id: string) => {
  sheetRecents.value = removeSheetRecent(sheetRecents.value, id);
  persistSheetRecents();
};

// 切换场次并直达签到页：进入签到页的 watch 会自动重新加载数据
const switchSheet = (id: string) => {
  if (!id) return;
  if (spreadsheetId.value !== id) {
    spreadsheetId.value = id;
  }
  currentView.value = 'operations';
};

export function useSheetRecents() {
  return { sheetRecents, loadSheetRecents, recordSheetRecent, removeSheetRecentEntry, switchSheet };
}
