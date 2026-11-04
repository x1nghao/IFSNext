// 视图偏好持久化：排序键/方向与自动刷新档位，键为 ifsnext_view_prefs。
// 独立成模块的原因：这两个偏好分属筛选（排序）与数据（自动刷新）两域，
// 但共用同一个存储键，收敛一处避免键的读写被拆散。
import { watch } from 'vue';
import { useFilters } from './useFilters';
import { useAgentData } from './useAgentData';

const VIEW_PREFS_STORAGE_KEY = 'ifsnext_view_prefs';

const { sortKey, sortOrder } = useFilters();
const { autoRefreshMode, setAutoRefresh } = useAgentData();

const loadViewPrefs = () => {
  try {
    const raw = localStorage.getItem(VIEW_PREFS_STORAGE_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    const SORT_KEYS = ['AgentName', 'AgentFaction', 'APdiff', 'PV'];
    if (SORT_KEYS.includes(prefs.sortKey)) sortKey.value = prefs.sortKey;
    if (prefs.sortOrder === 'asc' || prefs.sortOrder === 'desc') sortOrder.value = prefs.sortOrder;
    if (['off', 'slow', 'medium', 'fast'].includes(prefs.autoRefreshMode)) {
      autoRefreshMode.value = prefs.autoRefreshMode;
      if (prefs.autoRefreshMode !== 'off') setAutoRefresh(prefs.autoRefreshMode);
    }
  } catch (e) {}
};

watch([sortKey, sortOrder, autoRefreshMode], () => {
  try {
    localStorage.setItem(VIEW_PREFS_STORAGE_KEY, JSON.stringify({
      sortKey: sortKey.value,
      sortOrder: sortOrder.value,
      autoRefreshMode: autoRefreshMode.value,
    }));
  } catch (e) {}
});

export function useViewPrefs() {
  return { loadViewPrefs };
}
