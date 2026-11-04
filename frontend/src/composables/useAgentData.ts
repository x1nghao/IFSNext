// 名单数据的唯一出口：加载/缓存/自动刷新，以及从名单派生的统计与展示辅助。
// 依赖方向：useSettings（表格与后端地址）→ 本模块；下游（核验/抽奖/大屏）只读本模块。
import { ref, computed } from 'vue';
import type { Agent } from '@/types';
import { computeAgentStats } from '@/utils/agents';
import { formatRelativeTime } from '@/utils/time';
import { isSafeHttpUrl } from '@/utils/url';
import { createLogger } from '@/utils/logger';
import { i18n } from '@/i18n';
import { useSettings } from './useSettings';
import { useToast } from './useToast';
import { useSheetRecents } from './useSheetRecents';
import { useAppView } from './useAppView';

const { t } = i18n.global;
const { addError } = useToast();
const { recordSheetRecent } = useSheetRecents();
const { spreadsheetId, apiBaseUrl } = useSettings();
const { currentView } = useAppView();

// 模块级日志：网络故障与竞态现场统一带 [IFSNext:data] 前缀
const dataLogger = createLogger('data');

const loading = ref(false);
const agents = ref<Agent[]>([]);
const cachedData = ref<Agent[]>([]);
const lastUpdateTime = ref<number | null>(null);
const autoRefreshMode = ref('off');
const autoRefreshTimer = ref<ReturnType<typeof setInterval> | null>(null);
const isRefreshing = ref(false);

const loadData = async (useCache = false, silent = false) => {
  if (!spreadsheetId.value) {
    addError(t('error.needSheetId'));
    return;
  }
  if (useCache && cachedData.value.length > 0 && lastUpdateTime.value) {
    const timeDiff = Date.now() - lastUpdateTime.value;
    if (timeDiff < 30000) {
      agents.value = [...cachedData.value];
      return;
    }
  }
  if (!silent) {
    loading.value = true;
  }
  // 请求地址提前构造：catch 里记日志时也要能定位现场
  const requestUrl = `${apiBaseUrl.value}/data?spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}`;
  try {
    if (!isSafeHttpUrl(apiBaseUrl.value)) {
      throw new Error(t('error.invalidApiUrl'));
    }
    const response = await fetch(requestUrl, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-cache' // 强制浏览器向服务器发送请求，不使用本地强缓存
    });
    if (!response.ok) {
      const status = response.status;
      const statusText = response.statusText || 'Unknown error';
      throw new Error(`HTTP ${status}: ${statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      agents.value = data;
      cachedData.value = [...data];
      lastUpdateTime.value = Date.now();
      recordSheetRecent(spreadsheetId.value);
    } else {
      throw new Error(t('error.invalidResponse'));
    }
  } catch (error: any) {
    // 静默刷新（自动刷新/大屏轮询）失败不弹 toast：离线横幅与「更新于」时间已反映数据陈旧，
    // 每 10 秒弹一条只会盖住大屏与操作流；仅记日志供排查
    if (!silent) {
      addError(t('error.loadFailed', { message: error.message }));
    }
    dataLogger.error('加载数据失败', { url: requestUrl, reason: error?.message, error });
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
};

// ── 自动刷新 ──
const stopAutoRefresh = () => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value);
    autoRefreshTimer.value = null;
  }
};

const setAutoRefresh = (mode: string) => {
  stopAutoRefresh();
  autoRefreshMode.value = mode;
  let interval = 0;
  switch (mode) {
    case 'slow': interval = 60000; break;
    case 'medium': interval = 10000; break;
    case 'fast': interval = 3000; break;
    default: return;
  }
  autoRefreshTimer.value = setInterval(async () => {
    if (currentView.value !== 'operations') return; // 非操作页不刷新
    if (!isRefreshing.value && !loading.value) {
      isRefreshing.value = true;
      try {
        await loadData(false, true);
      } catch (error: any) {
        addError(t('error.autoRefreshFailed', { message: error.message }));
      } finally {
        isRefreshing.value = false;
      }
    }
  }, interval);
};

// ── 派生统计：签到页与大屏共用同一数据源 ──
const agentStats = computed(() => computeAgentStats(agents.value));
const checkedPercent = computed(() =>
  agentStats.value.total ? Math.round((agentStats.value.checkedIn / agentStats.value.total) * 100) : 0
);
// AP 总增量：无法解析的值按 0 计
const apTotalSum = computed(() =>
  agents.value.reduce((sum, a) => {
    const n = Number(a.APdiff);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0)
);

// 名字 → 阵营样式类：中奖榜/大屏胶囊等只有名字的场景按名单反查阵营着色
const factionClass = (name: string) => {
  const faction = agents.value.find(a => a.AgentName === name)?.AgentFaction;
  if (faction === 'Resistance') return 'is-resistance';
  if (faction === 'Enlightened') return 'is-enlightened';
  return '';
};

// ── 「更新于 x 前」文案：nowTick 每 10 秒推进一次以驱动重算 ──
const nowTick = ref(Date.now());
let nowTickTimer: ReturnType<typeof setInterval> | null = null;
const startNowTick = () => {
  nowTickTimer = setInterval(() => { nowTick.value = Date.now(); }, 10_000);
};
const stopNowTick = () => {
  if (nowTickTimer) {
    clearInterval(nowTickTimer);
    nowTickTimer = null;
  }
};
const lastUpdateText = computed(() => {
  if (!lastUpdateTime.value) return '';
  const result = formatRelativeTime(lastUpdateTime.value, nowTick.value);
  if (result.kind === 'seconds') return t('stats.secondsAgo', { n: result.n });
  if (result.kind === 'minutes') return t('stats.minutesAgo', { n: result.n });
  return t('stats.clock', { time: result.text });
});

export function useAgentData() {
  return {
    agents,
    loading,
    cachedData,
    autoRefreshMode,
    isRefreshing,
    loadData,
    setAutoRefresh,
    stopAutoRefresh,
    agentStats,
    checkedPercent,
    apTotalSum,
    factionClass,
    lastUpdateText,
    startNowTick,
    stopNowTick,
  };
}
