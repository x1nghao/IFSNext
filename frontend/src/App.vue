<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppCard from '@/components/ui/AppCard.vue';
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue';
import AppSpinner from '@/components/ui/AppSpinner.vue';
import type { Agent, LotteryDrawRecord } from '@/types';
import {
  extractSpreadsheetId,
  filterAgents,
  sortAgents,
  computeAgentStats,
  hasActiveFilters,
} from '@/utils/agents';
import type { StatusFilter, FactionFilter, AgentFilters } from '@/utils/agents';
import { drawWinners, randomSeed, hashSeed, mulberry32 } from '@/utils/lottery';
import { computeMarqueeDuration } from '@/utils/kiosk';
import { upsertSheetRecent, removeSheetRecent } from '@/utils/recents';
import type { SheetRecent } from '@/utils/recents';
import { getCheckmarkState, getCheckmarkVisual } from '@/utils/checkmarks';
import type { CheckmarkState } from '@/utils/checkmarks';
import { formatRelativeTime } from '@/utils/time';
import {
  addAgentModifiedTime,
  parseAgentModifiedAt,
  removeAgentModifiedTime,
} from '@/utils/agentModifiedAt';
import { isSafeHttpUrl } from '@/utils/url';

const { t, locale } = useI18n();

// State
const currentView = ref('operations');
const spreadsheetId = ref('');
const apiBaseUrl = ref('https://ifsapi.boki.one');
const checkinFormUrl = ref('');
const searchQuery = ref('');
const loading = ref(false);
const verificationLoadingMap = ref<Record<string, boolean>>({});
const agents = ref<Agent[]>([]);
const systemPrefersDark = ref(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

// 主题模式：auto 跟随系统，light/dark 手动固定；setup 阶段同步恢复避免首帧闪烁
type ThemeMode = 'auto' | 'light' | 'dark';
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

const isOffline = ref(typeof navigator !== 'undefined' && !navigator.onLine);
const handleOnline = () => { isOffline.value = false; };
const handleOffline = () => { isOffline.value = true; };
const showQRCode = ref(false);
const cachedData = ref<Agent[]>([]);
const lastUpdateTime = ref<number | null>(null);
const autoRefreshMode = ref('off');
const autoRefreshTimer = ref<any>(null);
const isRefreshing = ref(false);
const canInstall = ref(false);
let deferredPrompt: any = null;
const qrcodeCanvas = ref<HTMLCanvasElement | null>(null);
const agentModifiedAtBySheet = ref<Record<string, Record<string, number>>>({});
const AGENT_MODIFIED_AT_STORAGE_KEY = 'ifsnext_agent_modified_at';

// 历史场次：成功加载过的表格自动入册，设置页可一键切换
const SHEET_RECENTS_STORAGE_KEY = 'ifsnext_sheet_recents';
const SHEET_RECENTS_CAP = 6;
const sheetRecents = ref<SheetRecent[]>([]);

// 筛选（仅本地显示，不影响云端表格；进入应用时总是回到「全部」）
// 面板默认收纳在三横线按钮后，筛选生效时按钮显示指示点
const statusFilter = ref<StatusFilter>('all');
const factionFilter = ref<FactionFilter>('all');
const showFilters = ref(false);

// 大屏展示模式：覆盖层 + 独立的 10 秒静默刷新
const kioskMode = ref(false);
let kioskTimer: ReturnType<typeof setInterval> | null = null;

// 抽奖：设置页开关开启，按表格分别保存记录，种子驱动可复现抽取。
// 开奖演示状态收敛为单个对象（null = 弹窗关闭）；中奖结果以历史记录为唯一数据源，
// 落账先于动画——弹窗只是演示，中途关闭不影响结果与中奖榜。
const LOTTERY_HISTORY_STORAGE_KEY = 'ifsnext_lottery_history';
const lotteryEnabled = ref(false);
// 撤销签到二次确认：默认开启（长按 1 秒），关闭后点击直接撤销
const undoHoldRequired = ref(true);
const lotterySeed = ref('');
const lotteryCount = ref<number | string>(1);
const lotteryPoolMode = ref<'checked' | 'all'>('checked');
const lotteryExcludeWinners = ref(true);
interface LotteryDrawState {
  phase: 'rolling' | 'revealed';
  winners: string[];
  revealed: number;
  currentName: string;
  seed: string;
  poolSize: number;
}
const lotteryDrawState = ref<LotteryDrawState | null>(null);
const lotteryHistory = ref<Record<string, LotteryDrawRecord[]>>({});
let lotteryRunSeq = 0;

// 撤销签到长按确认：按住 1 秒、按钮周围进度环走满后执行
const UNDO_HOLD_MS = 1000;
const pressState = ref<{ agent: string; progress: number } | null>(null);
let holdTimer: ReturnType<typeof setInterval> | null = null;
let holdStart = 0;

// Methods
// 错误 Toast：addError 是异常的唯一界面出口，4 秒自动消失
const toast = ref<{ id: number; message: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const dismissToast = () => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
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

const loadAgentModifiedAt = () => {
  try {
    const raw = localStorage.getItem(AGENT_MODIFIED_AT_STORAGE_KEY);
    const parsed = parseAgentModifiedAt(raw, spreadsheetId.value || '');
    if (!parsed) return;

    agentModifiedAtBySheet.value = parsed.map;
    if (parsed.migrated) {
      persistAgentModifiedAt();
    }
  } catch (e) {}
};

const persistAgentModifiedAt = () => {
  try {
    localStorage.setItem(AGENT_MODIFIED_AT_STORAGE_KEY, JSON.stringify(agentModifiedAtBySheet.value));
  } catch (e) {}
};

// ── 历史场次 ──
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

// 列表展示用的短 ID：中间省略，保留首尾便于辨认
const shortSheetId = (id: string) => (id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id);

const formatRecentDate = (ts: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ts));
  } catch (e) {
    return '';
  }
};

const setAgentModifiedTime = (sheetId: string, agentName: string, timestamp: number) => {
  agentModifiedAtBySheet.value = addAgentModifiedTime(agentModifiedAtBySheet.value, sheetId, agentName, timestamp);
  persistAgentModifiedAt();
};

const removeAgentModifiedTimeEntry = (sheetId: string, agentName: string) => {
  agentModifiedAtBySheet.value = removeAgentModifiedTime(agentModifiedAtBySheet.value, sheetId, agentName);
  persistAgentModifiedAt();
};

const formatModifiedTime = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(timestamp));
  } catch (e) {
    return new Date(timestamp).toLocaleTimeString();
  }
};

const getAgentModifiedTimeText = (agentName: string) => {
  const sheetId = spreadsheetId.value;
  if (!sheetId) return '';
  const timestamp = agentModifiedAtBySheet.value[sheetId]?.[agentName];
  if (typeof timestamp !== 'number') return '';
  return formatModifiedTime(timestamp);
};

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

const activeFilters = computed<AgentFilters>(() => ({ status: statusFilter.value, faction: factionFilter.value }));
const filteredAgents = computed(() => filterAgents(agents.value, searchQuery.value, activeFilters.value));

const setStatusFilter = (v: string) => { statusFilter.value = v as StatusFilter; };
const setFactionFilter = (v: string) => { factionFilter.value = v as FactionFilter; };
const setLotteryPoolMode = (v: string) => { lotteryPoolMode.value = v as 'checked' | 'all'; };
const filtersActive = computed(() => hasActiveFilters(activeFilters.value));

const sortKey = ref('');
const sortOrder = ref('asc');

const setSort = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

const sortedAgents = computed(() => sortAgents(filteredAgents.value, sortKey.value, sortOrder.value));

// 名单显式分列：CSS 断点决定列数（1/2/3），JS 把名单均分进列容器。
// 列内首行天然无分隔条，杜绝分栏续行把分隔条带到列顶的问题。
const rosterColumnCount = ref(1);
let rosterMqlWide: MediaQueryList | null = null;
let rosterMqlMid: MediaQueryList | null = null;
const updateRosterColumnCount = () => {
  rosterColumnCount.value = rosterMqlWide?.matches ? 3 : rosterMqlMid?.matches ? 2 : 1;
};
const rosterColumns = computed<Agent[][]>(() => {
  const count = Math.max(1, rosterColumnCount.value);
  const cols: Agent[][] = Array.from({ length: count }, () => []);
  // 按列轮转填充：列高更均衡，搜索/筛选后的短名单也分布自然
  sortedAgents.value.forEach((agent, i) => {
    const col = cols[i % count];
    if (col) col.push(agent);
  });
  return cols;
});

const emptyHint = computed(() => {
  if (agents.value.length > 0 && searchQuery.value) {
    return t('empty.noMatch', { q: searchQuery.value });
  }
  if (agents.value.length > 0 && filtersActive.value) {
    return t('empty.filtered');
  }
  return t('empty.hint');
});

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

// 「更新于 x 前」文案：nowTick 每 10 秒推进一次以驱动重算
const VIEW_PREFS_STORAGE_KEY = 'ifsnext_view_prefs';
const nowTick = ref(Date.now());
let nowTickTimer: ReturnType<typeof setInterval> | null = null;
const lastUpdateText = computed(() => {
  if (!lastUpdateTime.value) return '';
  const result = formatRelativeTime(lastUpdateTime.value, nowTick.value);
  if (result.kind === 'seconds') return t('stats.secondsAgo', { n: result.n });
  if (result.kind === 'minutes') return t('stats.minutesAgo', { n: result.n });
  return t('stats.clock', { time: result.text });
});

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

const generateQRCode = async () => {
  if (qrcodeCanvas.value && safeCheckinFormUrl.value) {
    try {
      await QRCode.toCanvas(qrcodeCanvas.value, safeCheckinFormUrl.value, {
        width: 200,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'H'
      });
    } catch (err: any) {
      addError(t('error.qrFailed', { message: err.message }));
    }
  }
};

// 仅放行 http(s) 链接，避免 javascript: 等伪协议进入二维码与 <a href>
const safeCheckinFormUrl = computed(() => (isSafeHttpUrl(checkinFormUrl.value) ? checkinFormUrl.value : ''));

const onGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (toast.value) {
      dismissToast(); // 最顶层先关：错误 Toast 永远浮在弹窗与大屏之上
    } else if (showQRCode.value) {
      showQRCode.value = false;
    } else if (lotteryDrawState.value) {
      closeLotteryModal();
    } else if (kioskMode.value) {
      kioskMode.value = false;
    }
  }
};

// 签到表单状态检查：输入防抖后调用后端 /form-check
type FormCheckState = 'idle' | 'checking' | 'ok' | 'closed' | 'notfound' | 'notlinked' | 'invalid' | 'failed';
const formCheckState = ref<FormCheckState>('idle');
let formCheckTimer: ReturnType<typeof setTimeout> | null = null;
let formCheckSeq = 0;

const isGoogleFormUrl = (url: string) => /^https:\/\/docs\.google\.com\/forms\/d(?:\/e)?\/[a-zA-Z0-9_-]+/.test(url);

const checkFormStatus = async () => {
  const url = checkinFormUrl.value.trim();
  if (!url || !url.includes('docs.google.com')) {
    formCheckState.value = 'idle';
    return;
  }
  if (!isGoogleFormUrl(url)) {
    formCheckState.value = 'invalid';
    return;
  }
  if (!isSafeHttpUrl(apiBaseUrl.value) || !spreadsheetId.value) {
    formCheckState.value = 'idle';
    return;
  }
  const seq = ++formCheckSeq;
  formCheckState.value = 'checking';
  try {
    const requestUrl = `${apiBaseUrl.value}/form-check?form_url=${encodeURIComponent(url)}&spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}`;
    const response = await fetch(requestUrl, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (seq !== formCheckSeq) return;
    if (result.supported === false) {
      formCheckState.value = 'idle';
    } else if (result.exists === false) {
      formCheckState.value = 'notfound';
    } else if (result.exists === true) {
      if (result.acceptingResponses === false) {
        formCheckState.value = 'closed';
      } else if (result.linkedLikely === false) {
        formCheckState.value = 'notlinked';
      } else {
        formCheckState.value = 'ok';
      }
    } else {
      formCheckState.value = 'failed';
    }
  } catch {
    if (seq === formCheckSeq) formCheckState.value = 'failed';
  }
};

watch([checkinFormUrl, spreadsheetId], () => {
  if (formCheckTimer) clearTimeout(formCheckTimer);
  formCheckTimer = setTimeout(checkFormStatus, 600);
});

watch(showQRCode, (val) => {
  if (val) {
    // Wait for DOM update
    setTimeout(generateQRCode, 100);
  }
});

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

const setLocale = (lang: string) => {
  locale.value = lang;
  try { localStorage.setItem('ifsnext_lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
};

const setLotteryEnabled = (val: string) => {
  lotteryEnabled.value = val === 'on';
  if (!lotteryEnabled.value) {
    // 关闭抽奖时若正在开奖演示，一并中止并离开抽奖页
    closeLotteryModal();
    if (currentView.value === 'lottery') currentView.value = 'operations';
  }
};

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

  if (spreadsheetId.value && agents.value.length === 0) {
    loadData(true);
  }
};

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
  try {
    if (!isSafeHttpUrl(apiBaseUrl.value)) {
      throw new Error(t('error.invalidApiUrl'));
    }
    const requestUrl = `${apiBaseUrl.value}/data?spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}`;
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
    addError(t('error.loadFailed', { message: error.message }));
    console.error('API调用错误:', error);
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
};

const getActionButtonClass = (agent: Agent) => {
  if (agent.PV === 'TRUE') return '';
  if (agent.AgentFaction === 'Resistance') return 'action-resistance';
  if (agent.AgentFaction === 'Enlightened') return 'action-enlightened';
  return 'action-primary';
};

// 签到状态回写：乐观更新可能与后台自动刷新交错——请求持有的对象可能已脱离
// 当前 agents 数组，因此所有 PV 变更都按名字同步到展示列表与缓存，保证界面一致
const applyPv = (agent: Agent, pv: string) => {
  agent.PV = pv;
  for (const list of [agents.value, cachedData.value]) {
    const current = list.find(a => a.AgentName === agent.AgentName);
    if (current) current.PV = pv;
  }
};

const toggleVerification = async (agent: Agent) => {
  if (!spreadsheetId.value) {
    addError(t('error.needSheetId'));
    return;
  }
  if (verificationLoadingMap.value[agent.AgentName]) {
    return; // 已经在处理中
  }

  verificationLoadingMap.value[agent.AgentName] = true;
  const originalStatus = agent.PV;
  const newStatus = agent.PV === 'TRUE' ? 'FALSE' : 'TRUE';

  applyPv(agent, newStatus);
  setAgentModifiedTime(spreadsheetId.value, agent.AgentName, Date.now());

  try {
    // 目标状态语义：携带 value 让后端幂等写入，避免多人同时操作时被 toggle 翻转两次
    const requestUrl = `${apiBaseUrl.value}/verify?agent_name=${encodeURIComponent(agent.AgentName)}&spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}&value=${newStatus}`;
    const response = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } });
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }
    const result = await response.json();
    if (result.status === 'success') {
      const serverValue = result.new_value === 'TRUE' ? 'TRUE' : result.new_value === 'FALSE' ? 'FALSE' : null;
      if (serverValue && serverValue !== newStatus) {
        // 另一位操作者已把该 Agent 改成别的状态：以服务器为准回写本地
        applyPv(agent, serverValue);
        if (serverValue === 'TRUE') {
          setAgentModifiedTime(spreadsheetId.value, agent.AgentName, Date.now());
        } else {
          removeAgentModifiedTimeEntry(spreadsheetId.value, agent.AgentName);
        }
      } else {
      }
    } else {
      throw new Error(result.message || t('error.verifyFailed', { message: `HTTP ${response.status}` }));
    }
  } catch (error: any) {
    applyPv(agent, originalStatus);
    // 回滚乐观更新时记录的修改时间，避免显示从未生效的时间戳
    removeAgentModifiedTimeEntry(spreadsheetId.value, agent.AgentName);
    addError(t('error.verifyFailed', { message: error.message }));
    console.error('签到 API 调用错误:', error);
  } finally {
    verificationLoadingMap.value[agent.AgentName] = false;
  }
};

// ── 撤销签到长按确认 ──
// 已签到的撤销按钮改为按住 1 秒触发：定时器驱动进度环，松手/移出/系统打断即取消。
// 快速点按不触发（进度环会提示「长按撤销」）；键盘 Enter/Space 产生的 click（detail 为 0）直接执行。
const beginUndoHold = (agent: Agent) => {
  if (!undoHoldRequired.value) return; // 设置关闭：点按直接撤销（click 路径处理）
  if (verificationLoadingMap.value[agent.AgentName] || pressState.value) return;
  holdStart = performance.now();
  pressState.value = { agent: agent.AgentName, progress: 0 };
  const tick = () => {
    if (!pressState.value || pressState.value.agent !== agent.AgentName) return;
    const progress = Math.min(1, (performance.now() - holdStart) / UNDO_HOLD_MS);
    pressState.value.progress = progress;
    if (progress >= 1) {
      pressState.value = null;
      toggleVerification(agent);
    }
  };
  holdTimer = setInterval(tick, 30);
};

const cancelUndoHold = (agentName: string) => {
  if (pressState.value && pressState.value.agent !== agentName) return;
  if (holdTimer !== null) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
  pressState.value = null;
};

const onUndoButtonClick = (e: MouseEvent, agent: Agent) => {
  // 键盘触发（detail 0）或关闭二次确认时：点击直接撤销；否则等待长按进度环
  if (e.detail === 0 || !undoHoldRequired.value) {
    toggleVerification(agent);
  }
};

const clearSearch = () => {
  searchQuery.value = '';
};

// 一键复位两组筛选（计数芯片与三横线指示点随之消失）
const clearFilters = () => {
  statusFilter.value = 'all';
  factionFilter.value = 'all';
};

watch(spreadsheetId, (newVal) => {
  if (!newVal) return;
  const extracted = extractSpreadsheetId(newVal);
  if (extracted) {
    spreadsheetId.value = extracted;
  }
});

watch(currentView, (newVal) => {
  if (newVal === 'operations' && spreadsheetId.value) {
    loadData();
  }
  if (newVal === 'lottery' && !lotterySeed.value) {
    const now = new Date();
    lotterySeed.value = `IFS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }
});

// 签到页告警条：仅显示可行动的确定性表单异常；failed 属瞬时网络问题不上浮
const formWarningActive = computed(() =>
  ['closed', 'notfound', 'notlinked'].includes(formCheckState.value)
);

// ── 大屏展示模式 ──
const enterKiosk = () => {
  kioskMode.value = true;
};

const kioskQrCanvas = ref<HTMLCanvasElement | null>(null);
// 大屏名单确定性洗牌：以名字为键伪随机重排，状态组不按表格行序扎堆；
// 洗牌键稳定（名字不变则顺序不变），10 秒自动刷新不会引起胶囊跳动
const kioskShuffle = (list: Agent[]): Agent[] => {
  const arr = list.slice();
  const rand = mulberry32(hashSeed(arr.map(a => a.AgentName).join('|')));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = arr[i];
    const b = arr[j];
    if (a && b) {
      arr[i] = b;
      arr[j] = a;
    }
  }
  return arr;
};
const kioskChecked = computed(() => kioskShuffle(agents.value.filter(a => a.PV === 'TRUE')));
const kioskUnchecked = computed(() => kioskShuffle(agents.value.filter(a => a.PV !== 'TRUE')));

// 大屏双钩状态：胶囊按 Telegram 已读回执语言区分四种签到进度
const kioskMarkState = (agent: Agent): CheckmarkState =>
  getCheckmarkState(agent.PV, agent.APdiff);

// 面板空间按人数平方根比例分配：人少的一边自动让位给人多的一边。
// 少于 minRows 人的面板保底两行高度（保底由 CSS minmax 完成，这里只算 flex 数值）。
const KIOSK_MIN_ROWS = 2;
const kioskPanelBasis = computed(() => {
  const u = kioskUnchecked.value.length;
  const c = kioskChecked.value.length;
  if (!u || !c) return { unchecked: 1, checked: 1 }; // 单面板时由 :only-of-type 规则接管
  const ru = Math.max(KIOSK_MIN_ROWS, Math.sqrt(u));
  const rc = Math.max(KIOSK_MIN_ROWS, Math.sqrt(c));
  return { unchecked: ru, checked: rc };
});
const kioskPanelStyle = computed(() => ({
  '--rows-unchecked': String(kioskPanelBasis.value.unchecked),
  '--rows-checked': String(kioskPanelBasis.value.checked),
}));

const marqueeStyle = (count: number) => ({ '--marquee-duration': `${computeMarqueeDuration(count)}s` });

// 大屏二维码：高分辨率画布渲染，尺寸交给 CSS 按视口伸缩。
// 注意 toCanvas 会写入内联 style.width/height（固定像素），渲染后必须清除，
// 否则内联样式优先于 CSS 的 width:100%，会把面板和左列撑破。
let kioskQrSeq = 0;
const generateKioskQR = async () => {
  const seq = ++kioskQrSeq;
  const canvas = kioskQrCanvas.value;
  if (!canvas || !safeCheckinFormUrl.value) return;
  try {
    await QRCode.toCanvas(canvas, safeCheckinFormUrl.value, {
      width: 480,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    if (seq !== kioskQrSeq) return; // 渲染期间又有新调用：本次作废
    canvas.style.width = '';
    canvas.style.height = '';
  } catch (err: any) {
    if (seq === kioskQrSeq) addError(t('error.qrFailed', { message: err.message }));
  }
};

// 名单是否溢出面板要渲染后才知道：逐面板测一次自然高，溢出才启用无缝滚动。
// 滚动需要"双拷贝"实现无缝循环；静止时不渲染第二份拷贝，避免少人数面板出现重复名单。
// 人数不足以填满面板时整体向上对齐、行距恒定、留白沉底；这里只读不写样式，测量与布局彻底解耦。
const marqueeScrolling = ref({ unchecked: false, checked: false });
const updateKioskMarquees = async () => {
  await nextTick();
  const next = { unchecked: false, checked: false };
  document.querySelectorAll<HTMLElement>('.kiosk-marquee').forEach((box) => {
    const track = box.querySelector<HTMLElement>('.kiosk-marquee-track');
    if (!track) return;
    const key = box.closest('.kiosk-panel-unchecked') ? 'unchecked' : 'checked';
    const chips = track.querySelector<HTMLElement>('.kiosk-chips');
    if (!chips) return;
    next[key] = chips.scrollHeight > box.clientHeight + 1;
    box.classList.toggle('is-scrolling', next[key]);
  });
  marqueeScrolling.value = next;
};

const handleKioskResize = () => {
  if (kioskMode.value) updateKioskMarquees();
};

watch(kioskMode, (open) => {
  if (open) {
    loadData(false, true);
    kioskTimer = setInterval(() => {
      if (spreadsheetId.value) loadData(false, true);
    }, 10000);
    nextTick(() => {
      generateKioskQR();
      updateKioskMarquees();
    });
    window.addEventListener('resize', handleKioskResize);
  } else if (kioskTimer) {
    clearInterval(kioskTimer);
    kioskTimer = null;
    window.removeEventListener('resize', handleKioskResize);
  }
});

// 表单链接变化或名单刷新后，保持二维码与跑马灯状态正确
watch(safeCheckinFormUrl, () => {
  if (kioskMode.value) nextTick(generateKioskQR);
});
watch(agents, () => {
  if (kioskMode.value) updateKioskMarquees();
});

// ── 抽奖 ──
const loadLotteryHistory = () => {
  try {
    const raw = localStorage.getItem(LOTTERY_HISTORY_STORAGE_KEY);
    lotteryHistory.value = raw ? JSON.parse(raw) : {};
  } catch (e) {
    lotteryHistory.value = {};
  }
};

const persistLotteryHistory = () => {
  try {
    localStorage.setItem(LOTTERY_HISTORY_STORAGE_KEY, JSON.stringify(lotteryHistory.value));
  } catch (e) {}
};

// 抽奖参与池以名单加载顺序（表格行序）为准，与界面排序/筛选无关，保证可复现
const lotteryPool = computed<string[]>(() => {
  const base = lotteryPoolMode.value === 'checked' ? agents.value.filter(a => a.PV === 'TRUE') : agents.value;
  return base.map(a => a.AgentName);
});

const currentSheetDraws = computed<LotteryDrawRecord[]>(() =>
  spreadsheetId.value ? lotteryHistory.value[spreadsheetId.value] || [] : []
);

const previousWinners = computed<Set<string>>(() => new Set(currentSheetDraws.value.flatMap(e => e.winners)));

const eligiblePool = computed<string[]>(() =>
  lotteryExcludeWinners.value ? lotteryPool.value.filter(name => !previousWinners.value.has(name)) : lotteryPool.value
);

const lotteryCountNumber = computed(() => {
  const n = Math.floor(Number(lotteryCount.value));
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const lotteryNotEnough = computed(() =>
  eligiblePool.value.length > 0 && lotteryCountNumber.value > eligiblePool.value.length
);

const canDraw = computed(() =>
  agents.value.length > 0 && eligiblePool.value.length > 0 && lotteryCountNumber.value > 0
);

const factionClass = (name: string) => {
  const faction = agents.value.find(a => a.AgentName === name)?.AgentFaction;
  if (faction === 'Resistance') return 'is-resistance';
  if (faction === 'Enlightened') return 'is-enlightened';
  return '';
};

const formatDrawTime = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  } catch (e) {
    return new Date(timestamp).toLocaleTimeString();
  }
};

// 常驻中奖榜展示最新一轮记录；历史记录是中奖结果的唯一数据源
const latestDraw = computed<LotteryDrawRecord | undefined>(() => currentSheetDraws.value[0]);

// 全部中奖者揭示完毕，才允许「完成」关闭弹窗（点 ✕ 可随时中止演示）
const lotteryDrawingFinished = computed(() => {
  const state = lotteryDrawState.value;
  return !!state && state.phase === 'revealed' && state.revealed >= state.winners.length;
});

const closeLotteryModal = () => {
  lotteryRunSeq++;
  lotteryDrawState.value = null;
};

const drawLottery = async () => {
  if (lotteryDrawState.value || !canDraw.value) return;
  const pool = eligiblePool.value;
  const count = lotteryCountNumber.value;
  const seed = lotterySeed.value.trim() || randomSeed();
  lotterySeed.value = seed;
  const winners = drawWinners(pool, count, seed);
  if (!winners.length) {
    addError(t('lottery.emptyPool'));
    return;
  }

  // 结果先落账（数据先行），中奖榜与历史立即可见；随后的弹窗只是开奖演示
  const entry: LotteryDrawRecord = { at: Date.now(), seed, count, poolSize: pool.length, winners };
  const sid = spreadsheetId.value || 'default';
  lotteryHistory.value = { ...lotteryHistory.value, [sid]: [entry, ...(lotteryHistory.value[sid] || [])] };
  persistLotteryHistory();

  const seq = ++lotteryRunSeq;
  lotteryDrawState.value = {
    phase: 'rolling',
    winners,
    revealed: 0,
    currentName: pool[0] || winners[0] || '',
    seed,
    poolSize: pool.length,
  };

  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    if (!winner) continue;
    // 每名中奖者：约 0.9 秒滚动 → 揭示 → 停留 0.55 秒；结果由种子确定性给出，动画只为观感
    const rollStart = performance.now();
    await new Promise<void>(resolve => {
      const step = () => {
        if (seq !== lotteryRunSeq) { resolve(); return; }
        if (performance.now() - rollStart >= 900) { resolve(); return; }
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        if (candidate && lotteryDrawState.value) lotteryDrawState.value.currentName = candidate;
        setTimeout(step, 70);
      };
      step();
    });
    if (seq !== lotteryRunSeq) return;
    if (lotteryDrawState.value) {
      lotteryDrawState.value.phase = 'revealed';
      lotteryDrawState.value.revealed = i + 1;
      lotteryDrawState.value.currentName = winner;
    }
    await new Promise(r => setTimeout(r, 550));
    if (seq !== lotteryRunSeq) return;
  }
};

const clearLotteryHistory = () => {
  if (!spreadsheetId.value) return;
  lotteryHistory.value = { ...lotteryHistory.value, [spreadsheetId.value]: [] };
  persistLotteryHistory();
};

const setAutoRefresh = (mode: string) => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value);
    autoRefreshTimer.value = null;
  }
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

const cleanup = () => {
  if (autoRefreshTimer.value) {
    clearInterval(autoRefreshTimer.value);
    autoRefreshTimer.value = null;
  }
  if (nowTickTimer) {
    clearInterval(nowTickTimer);
    nowTickTimer = null;
  }
  if (kioskTimer) {
    clearInterval(kioskTimer);
    kioskTimer = null;
  }
  window.removeEventListener('resize', handleKioskResize);
  if (holdTimer !== null) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
  lotteryRunSeq++; // 中断进行中的抽奖演示
  lotteryDrawState.value = null;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
};

watch(isDark, (val) => {
  document.documentElement.classList.toggle('dark', val);
}, { immediate: true });

onMounted(() => {
  const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mql) {
    systemPrefersDark.value = mql.matches;
    const handler = (e: MediaQueryListEvent) => { systemPrefersDark.value = e.matches; };
    if (mql.addEventListener) mql.addEventListener('change', handler); else mql.addListener(handler);
  }
  document.documentElement.classList.toggle('dark', isDark.value);
  document.documentElement.lang = locale.value;
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || ((navigator as any).standalone);
  if (isStandalone) {
    document.documentElement.classList.add('pwa');
    document.body.classList.add('pwa');
  }
  loadSettings();
  loadAgentModifiedAt();
  loadViewPrefs();
  loadLotteryHistory();
  loadSheetRecents();
  nowTickTimer = setInterval(() => { nowTick.value = Date.now(); }, 10_000);

  // 名单分列数与 CSS 断点保持一致（≥1120px 三列，≥768px 两列）
  rosterMqlWide = window.matchMedia('(min-width: 1120px)');
  rosterMqlMid = window.matchMedia('(min-width: 768px)');
  updateRosterColumnCount();
  rosterMqlWide.addEventListener('change', updateRosterColumnCount);
  rosterMqlMid.addEventListener('change', updateRosterColumnCount);

  // PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canInstall.value = true;
  });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  cleanup();
  if (formCheckTimer) clearTimeout(formCheckTimer);
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  rosterMqlWide?.removeEventListener('change', updateRosterColumnCount);
  rosterMqlMid?.removeEventListener('change', updateRosterColumnCount);
});
</script>

<template>
  <div class="min-h-screen">
    <!-- 浮动玻璃顶栏 -->
    <header class="ifs-topbar no-select">
      <div class="ifs-topbar-inner">
        <h1 class="text-lg font-bold tracking-tight text-[var(--color-text)]">IFSNext</h1>
        <div class="flex items-center gap-2">
          <button v-if="agentStats.total" @click="enterKiosk" class="ifs-iconbtn" :title="t('kiosk.enter')" :aria-label="t('kiosk.enter')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20m-3 0h6M4 17h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v9a2 2 0 002 2z"></path>
            </svg>
          </button>
          <button v-if="checkinFormUrl" @click="showQRCode = true" class="ifs-iconbtn" :title="t('qr.title')" :aria-label="t('qr.title')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
            </svg>
          </button>
          <button v-if="canInstall" @click="installPWA" class="ifs-iconbtn" :title="t('nav.install')" :aria-label="t('nav.install')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- 浮动玻璃底部导航 -->
    <nav class="ifs-tabbar no-select" aria-label="主导航">
      <button class="ifs-tab" :class="{ 'is-active': currentView === 'operations' }" @click="currentView = 'operations'" :aria-current="currentView === 'operations' ? 'page' : undefined">
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
        </svg>
        {{ t('nav.operations') }}
      </button>
      <button v-if="lotteryEnabled" class="ifs-tab" :class="{ 'is-active': currentView === 'lottery' }" @click="currentView = 'lottery'" :aria-current="currentView === 'lottery' ? 'page' : undefined">
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zM5 12h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
        </svg>
        {{ t('nav.lottery') }}
      </button>
      <button class="ifs-tab" :class="{ 'is-active': currentView === 'settings' }" @click="currentView = 'settings'" :aria-current="currentView === 'settings' ? 'page' : undefined">
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
        </svg>
        {{ t('nav.settings') }}
      </button>
    </nav>

    <!-- 离线提示横幅 -->
    <div v-if="isOffline" class="bg-[var(--color-warning-tint-bg)] text-[var(--color-warning-tint-text)] text-sm text-center py-1.5 px-4 no-select">
      {{ t('offline.banner') }}
    </div>

    <!-- 主内容区域 -->
    <main class="max-w-7xl mx-auto py-4 sm:px-6 lg:px-8 tabbar-space">
      <!-- 设置页面 -->
      <div v-if="currentView === 'settings'" class="px-4 py-6 sm:px-0">
        <AppCard class="overflow-hidden">
            <h2 class="title-text font-bold text-[var(--color-text)] mb-4">{{ t('settings.title') }}</h2>

            <!-- 表格 ID（每场活动都要核对，置于最前） -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.sheetIdLabel') }}</label>
              <AppInput v-model="spreadsheetId" :placeholder="t('settings.sheetIdPlaceholder')" mono />
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                {{ t('settings.examplePrefix') }}: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
              </p>

              <!-- 历史场次：一键切换 -->
              <div v-if="sheetRecents.length" class="mt-3">
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.recentsLabel') }}</label>
                <div class="sheet-recents">
                  <div v-for="recent in sheetRecents" :key="recent.id" class="sheet-recent-row" :class="{ 'is-current': recent.id === spreadsheetId }">
                    <button class="sheet-recent-main" @click="switchSheet(recent.id)">
                      <span class="font-id sheet-recent-id">{{ shortSheetId(recent.id) }}</span>
                      <span v-if="recent.id === spreadsheetId" class="sheet-recent-badge">{{ t('settings.recentsCurrent') }}</span>
                      <span class="sheet-recent-date tabular-nums">{{ formatRecentDate(recent.lastUsed) }}</span>
                    </button>
                    <button class="sheet-recent-remove" :aria-label="t('settings.recentsRemove')" @click="removeSheetRecentEntry(recent.id)">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>
                <p class="mt-1 text-sm text-[var(--color-text-secondary)]">{{ t('settings.recentsHint') }}</p>
              </div>
            </div>

            <!-- 后端配置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.apiBaseLabel') }}</label>
              <AppInput v-model="apiBaseUrl" :placeholder="t('settings.apiBasePlaceholder')" />
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                {{ t('settings.apiBaseDefault') }}
              </p>
            </div>

            <!-- 签到表单配置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.checkinLabel') }}</label>
              <AppInput v-model="checkinFormUrl" placeholder="https://example.com/checkin-form" />
              <p v-if="formCheckState !== 'idle'" class="mt-2 text-sm" :class="{
                'text-[var(--color-text-secondary)]': formCheckState === 'checking',
                'text-[var(--color-success-badge-text)]': formCheckState === 'ok',
                'text-[var(--color-warning-tint-text)]': formCheckState === 'closed' || formCheckState === 'notlinked',
                'text-[var(--color-danger-badge-text)]': formCheckState === 'notfound' || formCheckState === 'invalid' || formCheckState === 'failed'
              }">
                {{ t('formCheck.' + formCheckState) }}
              </p>
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                {{ t('settings.qrHint') }}
              </p>
            </div>

            <!-- 撤销签到二次确认 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.undoHoldLabel') }}</label>
              <AppSegmentedControl
                :model-value="undoHoldRequired ? 'on' : 'off'"
                :options="[
                  { label: t('lottery.off'), value: 'off' },
                  { label: t('lottery.on'), value: 'on' }
                ]"
                @update:model-value="v => (undoHoldRequired = v === 'on')"
              />
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                {{ t('settings.undoHoldHint') }}
              </p>
            </div>

            <!-- 抽奖功能开关 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('lottery.enabledLabel') }}</label>
              <AppSegmentedControl
                :model-value="lotteryEnabled ? 'on' : 'off'"
                :options="[
                  { label: t('lottery.off'), value: 'off' },
                  { label: t('lottery.on'), value: 'on' }
                ]"
                @update:model-value="setLotteryEnabled"
              />
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                {{ t('lottery.enabledHint') }}
              </p>
            </div>

            <!-- 自动刷新设置 -->
            <div class="mb-6">
              <h3 class="text-base font-semibold text-[var(--color-text)]">{{ t('autorefresh.title') }}</h3>
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">{{ t('autorefresh.hint') }}</p>
              <div class="mt-3 flex items-center gap-3">
                <select v-model="autoRefreshMode" @change="setAutoRefresh(autoRefreshMode)" class="app-select">
                  <option value="off">{{ t('autorefresh.off') }}</option>
                  <option value="slow">{{ t('autorefresh.slow') }}</option>
                  <option value="medium">{{ t('autorefresh.medium') }}</option>
                  <option value="fast">{{ t('autorefresh.fast') }}</option>
                </select>
                <span v-if="isRefreshing" class="flex items-center text-sm text-[var(--color-primary)]">
                  <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  {{ t('autorefresh.refreshing') }}
                </span>
              </div>
            </div>

            <!-- 外观设置（一次性偏好，沉底） -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('theme.label') }}</label>
              <AppSegmentedControl
                :model-value="themeMode"
                :options="[
                  { label: t('theme.auto'), value: 'auto' },
                  { label: t('theme.light'), value: 'light' },
                  { label: t('theme.dark'), value: 'dark' }
                ]"
                @update:model-value="setThemeMode"
              />
            </div>

            <!-- 语言设置 -->
            <div>
              <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.language') }}</label>
              <AppSegmentedControl
                :model-value="locale"
                :options="[
                  { label: '🇨🇳 简体中文', value: 'zh-CN' },
                  { label: '🇭🇰/🇹🇼 繁體中文', value: 'zh-TW' },
                  { label: '🇺🇸 English', value: 'en-US' }
                ]"
                @update:model-value="setLocale"
              />
            </div>
          </AppCard>
      </div>

      <!-- 抽奖页面：中奖榜常驻首屏（窄屏在抽奖区上方、宽屏在侧边），开奖演示用全屏弹窗 -->
      <div v-else-if="currentView === 'lottery'" class="px-4 py-6 sm:px-0">
        <div class="lottery-layout">
          <!-- 常驻中奖榜：数据源是最新一条抽奖记录，开奖后立即更新 -->
          <AppCard class="overflow-hidden lottery-board">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 mb-3">
                <h2 class="title-text font-bold text-[var(--color-text)]">{{ t('lottery.boardTitle') }}</h2>
                <span v-if="latestDraw" class="text-xs text-[var(--color-text-secondary)] tabular-nums">
                  {{ formatDrawTime(latestDraw.at) }} · {{ t('lottery.seedLabel') }} <span class="font-id">{{ latestDraw.seed }}</span> · {{ latestDraw.poolSize }}{{ t('list.countSuffix') }}
                </span>
              </div>
              <div v-if="latestDraw" class="lottery-board-list">
                <div v-for="(name, i) in latestDraw.winners" :key="name" class="lottery-winner" :class="factionClass(name)">
                  <span class="lottery-winner-idx">{{ i + 1 }}</span>
                  <span class="lottery-winner-name">{{ name }}</span>
                </div>
              </div>
              <p v-else class="lottery-board-empty">{{ t('lottery.boardEmpty') }}</p>
          </AppCard>

          <!-- 抽奖控制区 -->
          <AppCard class="overflow-hidden">
              <h2 class="title-text font-bold text-[var(--color-text)] mb-1">{{ t('lottery.title') }}</h2>
              <p class="text-sm text-[var(--color-text-secondary)]">
                <template v-if="agents.length">{{ t('lottery.eligible', { n: eligiblePool.length }) }}<span v-if="lastUpdateText"> · {{ lastUpdateText }}</span></template>
                <template v-else>{{ t('lottery.noData') }}</template>
              </p>

              <!-- 种子 -->
              <div class="mt-5 mb-5">
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('lottery.seedLabel') }}</label>
                <div class="flex gap-2">
                  <AppInput v-model="lotterySeed" mono :placeholder="t('lottery.seedLabel')" />
                  <AppButton variant="secondary" class="shrink-0" :disabled="!!lotteryDrawState" @click="lotterySeed = randomSeed()">
                    {{ t('lottery.seedRandom') }}
                  </AppButton>
                </div>
              </div>

              <!-- 抽取人数 -->
              <div class="mb-5">
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('lottery.countLabel') }}</label>
                <AppInput v-model="lotteryCount" type="number" min="1" inputmode="numeric" />
                <p v-if="lotteryNotEnough" class="mt-2 text-sm text-[var(--color-warning-tint-text)]">
                  {{ t('lottery.notEnough', { n: eligiblePool.length }) }}
                </p>
              </div>

              <!-- 参与对象 -->
              <div class="mb-5">
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('lottery.poolLabel') }}</label>
                <AppSegmentedControl
                  :model-value="lotteryPoolMode"
                  :options="[
                    { label: t('lottery.poolChecked'), value: 'checked' },
                    { label: t('lottery.poolAll'), value: 'all' }
                  ]"
                  @update:model-value="setLotteryPoolMode"
                />
              </div>

              <!-- 跳过已中奖者 -->
              <label class="flex items-center gap-2 mb-6 text-sm font-medium text-[var(--color-text)] cursor-pointer">
                <input
                  v-model="lotteryExcludeWinners"
                  type="checkbox"
                  class="w-4 h-4 accent-[var(--color-primary)]"
                />
                {{ t('lottery.excludeWinners') }}
              </label>

              <AppButton block :disabled="!canDraw || !!lotteryDrawState" @click="drawLottery">
                {{ t('lottery.draw') }}
              </AppButton>
              <p v-if="agents.length && !eligiblePool.length" class="mt-2 text-sm text-[var(--color-warning-tint-text)]">
                {{ t('lottery.emptyPool') }}
              </p>
          </AppCard>
        </div>

        <!-- 抽奖记录：恒常显示，无记录时给出空态 -->
        <AppCard class="mt-6 overflow-hidden">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-base font-semibold text-[var(--color-text)]">{{ t('lottery.history') }}</h3>
              <AppButton v-if="currentSheetDraws.length" variant="ghost" size="small" @click="clearLotteryHistory">{{ t('lottery.clearHistory') }}</AppButton>
            </div>
            <div v-if="currentSheetDraws.length">
              <div v-for="entry in currentSheetDraws" :key="entry.at" class="lottery-history-row">
                <div class="text-xs text-[var(--color-text-secondary)] tabular-nums">
                  {{ formatDrawTime(entry.at) }} · {{ t('lottery.seedLabel') }} <span class="font-id">{{ entry.seed }}</span> · {{ entry.winners.length }}{{ t('list.countSuffix') }}
                </div>
                <div class="text-sm font-semibold text-[var(--color-text)]">{{ entry.winners.join('、') }}</div>
              </div>
            </div>
            <p v-else class="text-sm text-[var(--color-text-secondary)]">{{ t('lottery.historyEmpty') }}</p>
          </AppCard>
      </div>

      <!-- 操作页面 -->
      <div v-else class="px-4 py-6 sm:px-0">
        <!-- 签到表单异常告警：设置页检查出问题后，在签到页保持可见，一键直达设置 -->
        <div v-if="formWarningActive" class="form-warning no-select" role="alert">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z"></path>
          </svg>
          <span class="flex-1">{{ t('formCheck.' + formCheckState) }}</span>
          <button class="form-warning-action" @click="currentView = 'settings'">{{ t('formCheck.goSettings') }}</button>
        </div>

        <!-- 操作控制面板 -->
        <AppCard class="mb-6 overflow-hidden">
            <div class="flex items-center justify-between gap-3 mb-4 flex-nowrap">
              <!-- 搜索框 -->
              <div class="relative flex-1 min-w-0 sm:min-w-[240px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-secondary)] pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"></path>
                </svg>
                <AppInput v-model="searchQuery" :placeholder="t('search.placeholder')" :has-icon="true" />
                <button v-if="searchQuery" @click="clearSearch" :aria-label="t('common.clear')" class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <!-- 刷新按钮：工具性动作，弱于行内签到主操作 -->
              <AppButton variant="secondary" @click="loadData(false)" :loading="loading || isRefreshing" :disabled="loading || isRefreshing" class="shrink-0">
                {{ loading ? t('loading') : (isRefreshing ? t('refreshing') : t('refreshData')) }}
              </AppButton>
            </div>

            <!-- 排序 + 筛选收纳 -->
            <div class="mt-2 flex items-center justify-center sm:justify-start gap-2">
              <AppSegmentedControl
                :model-value="sortKey"
                :options="[
                  { label: t('sort.name'), value: 'AgentName' },
                  { label: t('sort.faction'), value: 'AgentFaction' },
                  { label: t('sort.ap'), value: 'APdiff' },
                  { label: t('sort.status'), value: 'PV' }
                ]"
                @update:model-value="setSort"
              >
                <template #label-suffix="{ active }">
                   <span v-if="active">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                </template>
              </AppSegmentedControl>
              <button
                class="filter-toggle"
                :class="{ 'is-open': showFilters }"
                :aria-expanded="showFilters"
                :aria-label="t('filter.toggle')"
                :title="t('filter.toggle')"
                @click="showFilters = !showFilters"
              >
                <svg class="w-[16px] h-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
                <span v-if="filtersActive" class="filter-dot" aria-hidden="true"></span>
              </button>
              <!-- 筛选结果计数：常驻可见，点击一键清除筛选 -->
              <Transition name="fade">
                <button v-if="filtersActive" class="filter-count-chip" :title="t('filter.clear')" @click="clearFilters">
                  <span class="tabular-nums">{{ t('list.countPrefix') }} {{ filteredAgents.length }} {{ t('list.countSuffix') }}</span>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </Transition>
            </div>

            <!-- 筛选面板（仅本地显示，不影响云端表格）：点三横线按钮展开 -->
            <Transition name="fade">
              <div v-if="showFilters" class="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <AppSegmentedControl
                  :model-value="statusFilter"
                  :options="[
                    { label: t('filter.all'), value: 'all' },
                    { label: t('filter.checked'), value: 'checked' },
                    { label: t('filter.unchecked'), value: 'unchecked' }
                  ]"
                  @update:model-value="setStatusFilter"
                />
                <AppSegmentedControl
                  :model-value="factionFilter"
                  :options="[
                    { label: t('filter.all'), value: 'all' },
                    { label: t('filter.resistance'), value: 'Resistance' },
                    { label: t('filter.enlightened'), value: 'Enlightened' }
                  ]"
                  @update:model-value="setFactionFilter"
                />
              </div>
            </Transition>

            <!-- 签到进度统计 -->
            <div v-if="agentStats.total" class="mt-4 rounded-[var(--radius-control)] bg-[var(--color-control-bg)] dark:bg-[var(--color-control-bg-dark)] p-3">
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span class="font-medium text-[var(--color-text)]">{{ t('stats.total') }} {{ agentStats.total }}</span>
                <span class="font-medium text-[var(--color-text)] tabular-nums">{{ t('stats.checkedIn') }} {{ agentStats.checkedIn }}/{{ agentStats.total }}（{{ checkedPercent }}%）</span>
                <span v-if="lastUpdateText" class="text-xs text-[var(--color-text-secondary)] tabular-nums">{{ lastUpdateText }}</span>
              </div>
              <div v-if="agentStats.resistance || agentStats.enlightened" class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                <div v-if="agentStats.resistance">
                  <div class="flex justify-between text-xs mb-1 text-[var(--color-resistance-text)]">
                    <span>{{ t('stats.resistance') }}</span>
                    <span class="tabular-nums">{{ agentStats.resistanceCheckedIn }}/{{ agentStats.resistance }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-[var(--color-control-bg-strong)] dark:bg-[var(--color-control-bg-strong-dark)] overflow-hidden">
                    <div class="h-full rounded-full bg-[var(--color-resistance)] transition-all duration-500" :style="{ width: (agentStats.resistanceCheckedIn / agentStats.resistance * 100) + '%' }"></div>
                  </div>
                </div>
                <div v-if="agentStats.enlightened">
                  <div class="flex justify-between text-xs mb-1 text-[var(--color-enlightened-text)]">
                    <span>{{ t('stats.enlightened') }}</span>
                    <span class="tabular-nums">{{ agentStats.enlightenedCheckedIn }}/{{ agentStats.enlightened }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-[var(--color-control-bg-strong)] dark:bg-[var(--color-control-bg-strong-dark)] overflow-hidden">
                    <div class="h-full rounded-full bg-[var(--color-enlightened)] transition-all duration-500" :style="{ width: (agentStats.enlightenedCheckedIn / agentStats.enlightened * 100) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </AppCard>


        <!-- 数据展示区域 -->
        <AppCard class="overflow-hidden">
            <!-- 加载状态 -->
            <div v-if="loading" class="text-center py-8">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto"></div>
              <p class="mt-2 text-[var(--color-text-secondary)]">{{ t('loadingData') }}</p>
            </div>

            <!-- 空状态 -->
            <div v-else-if="!filteredAgents.length" class="text-center py-10">
              <div class="mx-auto w-12 h-12 rounded-full bg-[var(--color-control-bg)] dark:bg-[var(--color-control-bg-dark)] flex items-center justify-center mb-3">
                <svg class="w-6 h-6 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <p class="title-text text-[var(--color-text)]">{{ t('empty.title') }}</p>
              <p class="text-xs text-[var(--color-text-secondary)] mt-1">{{ emptyHint }}</p>
            </div>

            <!-- 名单紧凑行 -->
            <div v-else>
              <div class="agent-list">
                <div v-for="(col, ci) in rosterColumns" :key="ci" class="agent-col">
                  <div v-for="agent in col" :key="agent.AgentName" class="agent-row">
                  <!-- 三区块：1「ID+阵营」靠左（空间不足时优先省略 ID），2「ΔAP+时间」与 3「状态+按钮」靠右；各区块内部上下排列 -->
                  <div class="agent-cell agent-cell-id">
                    <span class="agent-row-name" :class="agent.AgentFaction === 'Resistance' ? 'is-resistance' : (agent.AgentFaction === 'Enlightened' ? 'is-enlightened' : '')">{{ agent.AgentName }}</span>
                    <span class="faction-tag" :class="agent.AgentFaction === 'Resistance' ? 'is-resistance' : (agent.AgentFaction === 'Enlightened' ? 'is-enlightened' : '')">{{ agent.AgentFaction }}</span>
                  </div>
                  <div class="agent-cell agent-cell-data">
                    <span class="agent-row-ap" :class="{ 'is-negative': Number(agent.APdiff) < 0 }">
                      <svg class="ap-delta" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M6 1.6 10.9 10.4 H1.1 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                      </svg>
                      <span>AP {{ agent.APdiff ?? '—' }}</span>
                    </span>
                    <span v-if="getAgentModifiedTimeText(agent.AgentName)" class="agent-row-time">
                      {{ getAgentModifiedTimeText(agent.AgentName) }}
                    </span>
                  </div>
                  <div class="agent-cell agent-cell-action">
                    <span class="status-badge" :class="agent.PV === 'TRUE' ? 'is-checked' : 'is-unchecked'">
                      {{ t(agent.PV === 'TRUE' ? 'status.checkedIn' : 'status.notCheckedIn') }}
                    </span>
                    <!-- 撤销签到：二次确认开启时长按 1 秒（进度环走满执行）；关闭则点击直接撤销 -->
                    <!-- 环为独立描边层（conic-gradient 按 --hold-progress 扫过），与按钮尺寸解耦 -->
                    <span v-if="agent.PV === 'TRUE' && undoHoldRequired" class="hold-wrap no-select">
                      <span
                        v-if="pressState && pressState.agent === agent.AgentName"
                        class="hold-ring"
                        :style="{ '--hold-progress': String(pressState.progress ?? 0) }"
                        aria-hidden="true"
                      >
                        <svg><rect pathLength="1" /></svg>
                      </span>
                      <button
                        class="agent-action"
                        :class="{
                          'is-pressing': pressState && pressState.agent === agent.AgentName,
                          'opacity-50 cursor-not-allowed': verificationLoadingMap[agent.AgentName]
                        }"
                        :disabled="verificationLoadingMap[agent.AgentName]"
                        :title="t('actions.holdHint')"
                        :aria-label="t('actions.uncheck') + '，' + t('actions.holdHint')"
                        @pointerdown="beginUndoHold(agent)"
                        @pointerup="cancelUndoHold(agent.AgentName)"
                        @pointercancel="cancelUndoHold(agent.AgentName)"
                        @pointerleave="cancelUndoHold(agent.AgentName)"
                        @contextmenu.prevent
                        @click="onUndoButtonClick($event, agent)"
                      >
                        <AppSpinner v-if="verificationLoadingMap[agent.AgentName]" class="mr-1 inline-block h-3 w-3" />
                        {{ t('actions.uncheck') }}
                      </button>
                    </span>
                    <button
                      v-else-if="agent.PV !== 'TRUE'"
                      @click="toggleVerification(agent)"
                      class="agent-action"
                      :class="[getActionButtonClass(agent), { 'opacity-50 cursor-not-allowed': verificationLoadingMap[agent.AgentName] }]"
                      :disabled="verificationLoadingMap[agent.AgentName]"
                    >
                      <AppSpinner v-if="verificationLoadingMap[agent.AgentName]" class="mr-1 inline-block h-3 w-3" />
                      {{ t('actions.check') }}
                    </button>
                    <button
                      v-else
                      @click="toggleVerification(agent)"
                      class="agent-action"
                      :class="{ 'opacity-50 cursor-not-allowed': verificationLoadingMap[agent.AgentName] }"
                      :disabled="verificationLoadingMap[agent.AgentName]"
                    >
                      <AppSpinner v-if="verificationLoadingMap[agent.AgentName]" class="mr-1 inline-block h-3 w-3" />
                      {{ t('actions.uncheck') }}
                    </button>
                  </div>
                  </div>
                </div>
              </div>
            </div>
          </AppCard>

        <!-- 二维码弹窗 -->
        <div v-if="showQRCode" class="modal-overlay" @click="showQRCode = false">
          <AppCard class="w-full max-w-md" role="dialog" aria-modal="true" @click.stop>
            <!-- 头部 -->
            <div class="flex justify-between items-center mb-6">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-[var(--radius-tile)] flex items-center justify-center bg-white/60 dark:bg-white/10">
                  <svg class="w-5 h-5 text-[var(--color-primary)] dark:text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-[var(--color-text)]">{{ t('qr.title') }}</h3>
              </div>
              <button @click="showQRCode = false" class="ifs-iconbtn" :aria-label="t('common.close')" :title="t('common.close')">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <!-- 二维码容器 -->
            <div class="flex justify-center mb-6">
              <div class="qr-panel">
                <canvas ref="qrcodeCanvas"></canvas>
              </div>
            </div>

            <!-- 底部说明 -->
            <div class="text-center space-y-3">
              <p class="text-sm text-[var(--color-text-secondary)]">{{ t('qr.hint') }}</p>
              <!-- Link is now dynamic -->
              <div class="text-sm text-[var(--color-text-secondary)] break-all mt-4 text-center">
                <p class="mb-2">{{ t('qr.linkLabel') }}</p>
                <a v-if="safeCheckinFormUrl" :href="safeCheckinFormUrl" target="_blank" rel="noopener noreferrer" class="text-[var(--color-primary)] dark:text-[var(--color-primary)] hover:underline">{{ safeCheckinFormUrl }}</a>
              </div>

              <div class="flex items-center justify-center space-x-2 text-xs text-[var(--color-text-secondary)]">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>{{ t('qr.closeHint') }}</span>
              </div>
            </div>
          </AppCard>
        </div>
      </div>
    </main>

    <!-- 开奖高亮弹窗：滚动 → 逐名揭示 → 完成；结果已先行落账，随时可关 -->
    <div
      v-if="lotteryDrawState"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="t('lottery.title')"
      @click="lotteryDrawingFinished && closeLotteryModal()"
    >
      <div class="lottery-modal-card card" @click.stop>
        <div class="lottery-modal-head">
          <h3 class="text-lg font-bold text-[var(--color-text)]">{{ t('lottery.winnersTitle') }}</h3>
          <button class="ifs-iconbtn" :title="t('common.close')" :aria-label="t('common.close')" @click="closeLotteryModal">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <p v-if="lotteryDrawState.phase === 'rolling'" class="lottery-modal-caption">{{ t('lottery.drawing') }}</p>
        <div v-if="lotteryDrawState.phase === 'rolling'" class="lottery-rolling" :class="factionClass(lotteryDrawState.currentName)">
          {{ lotteryDrawState.currentName }}
        </div>
        <div v-else class="lottery-modal-winners" :class="{ 'is-single': lotteryDrawState.winners.length === 1 }">
          <div
            v-for="(name, i) in lotteryDrawState.winners.slice(0, lotteryDrawState.revealed)"
            :key="name"
            class="lottery-winner"
            :class="factionClass(name)"
          >
            <span class="lottery-winner-idx">{{ i + 1 }}</span>
            <span class="lottery-winner-name">{{ name }}</span>
          </div>
        </div>

        <div class="lottery-modal-foot">
          <span class="text-xs text-[var(--color-text-secondary)] tabular-nums">
            {{ t('lottery.seedLabel') }} <span class="font-id">{{ lotteryDrawState.seed }}</span> · {{ lotteryDrawState.poolSize }}{{ t('list.countSuffix') }}
          </span>
          <AppButton v-if="lotteryDrawingFinished" @click="closeLotteryModal">{{ t('lottery.finish') }}</AppButton>
        </div>
      </div>
    </div>

    <!-- 错误 Toast：异常的唯一界面出口，4 秒自动消失 -->
    <Transition name="fade">
      <div v-if="toast" class="error-toast" role="alert">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z"></path>
        </svg>
        <span class="error-toast-message">{{ toast.message }}</span>
        <button class="error-toast-close" :aria-label="t('common.close')" @click="dismissToast">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </Transition>

    <!-- 大屏展示模式：全屏覆盖，自动刷新签到进度 -->
    <div v-if="kioskMode" class="kiosk-overlay no-select" role="dialog" aria-modal="true" :aria-label="t('kiosk.title')">
      <div class="kiosk-top">
        <div class="kiosk-title">IFS · {{ t('kiosk.title') }}</div>
        <button class="ifs-iconbtn" :title="t('kiosk.exit')" :aria-label="t('kiosk.exit')" @click="kioskMode = false">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div class="kiosk-body" :style="kioskPanelStyle">
        <!-- 左列（窄屏时为顶部区块）：签到统计 + 签到二维码 -->
        <div class="kiosk-left">
          <section class="kiosk-stats" :aria-label="t('stats.checkedIn')">
            <div class="kiosk-big-num tabular-nums" :key="agentStats.checkedIn">{{ agentStats.checkedIn }}</div>
            <div class="kiosk-sub tabular-nums">
              {{ t('stats.checkedIn') }} / {{ t('stats.total') }} {{ agentStats.total }} · {{ checkedPercent }}%
            </div>
            <div class="kiosk-progress">
              <div class="kiosk-progress-fill" :style="{ width: checkedPercent + '%' }"></div>
            </div>

            <div v-if="agentStats.resistance || agentStats.enlightened" class="kiosk-factions">
              <div v-if="agentStats.resistance" class="kiosk-faction">
                <div class="kiosk-faction-head">
                  <span>{{ t('stats.resistance') }}</span>
                  <span class="tabular-nums">{{ agentStats.resistanceCheckedIn }}/{{ agentStats.resistance }}</span>
                </div>
                <div class="kiosk-faction-bar">
                  <div class="is-resistance" :style="{ width: (agentStats.resistanceCheckedIn / agentStats.resistance * 100) + '%' }"></div>
                </div>
              </div>
              <div v-if="agentStats.enlightened" class="kiosk-faction">
                <div class="kiosk-faction-head">
                  <span>{{ t('stats.enlightened') }}</span>
                  <span class="tabular-nums">{{ agentStats.enlightenedCheckedIn }}/{{ agentStats.enlightened }}</span>
                </div>
                <div class="kiosk-faction-bar">
                  <div class="is-enlightened" :style="{ width: (agentStats.enlightenedCheckedIn / agentStats.enlightened * 100) + '%' }"></div>
                </div>
              </div>
            </div>

            <div v-if="apTotalSum" class="kiosk-ap tabular-nums">AP +{{ apTotalSum.toLocaleString() }}</div>
          </section>

          <section class="kiosk-qr" aria-label="QR">
            <div v-if="safeCheckinFormUrl" class="kiosk-qr-panel">
              <canvas ref="kioskQrCanvas"></canvas>
            </div>
            <p class="kiosk-qr-caption" :class="{ 'is-missing': !safeCheckinFormUrl }">
              {{ safeCheckinFormUrl ? t('kiosk.scanToCheckIn') : t('kiosk.qrMissing') }}
            </p>
          </section>
        </div>

        <!-- 未签到名单：全部签完时整块隐藏，空间让给已签到面板 -->
        <section v-if="kioskUnchecked.length" class="kiosk-panel kiosk-panel-unchecked" :aria-label="t('status.notCheckedIn')">
          <header class="kiosk-panel-head">
            <span>{{ t('status.notCheckedIn') }}</span>
            <span class="kiosk-panel-count tabular-nums">{{ kioskUnchecked.length }}</span>
          </header>
          <div class="kiosk-marquee">
            <div class="kiosk-marquee-track" :style="marqueeStyle(kioskUnchecked.length)">
              <div class="kiosk-chips">
                <span v-for="agent in kioskUnchecked" :key="agent.AgentName" class="kiosk-chip" :class="factionClass(agent.AgentName)">
                  <span class="kiosk-chip-name">{{ agent.AgentName }}</span>
                  <svg class="kiosk-mark" viewBox="0 0 30 14" aria-hidden="true">
                    <path class="mark-path" d="M2 8.5 6.5 13 15 2.5" />
                    <path class="mark-path" d="M14 8.5 18.5 13 27 2.5" />
                  </svg>
                </span>
              </div>
              <div v-if="marqueeScrolling.unchecked" class="kiosk-chips" aria-hidden="true">
                <span v-for="agent in kioskUnchecked" :key="'dup-' + agent.AgentName" class="kiosk-chip" :class="factionClass(agent.AgentName)">
                  <span class="kiosk-chip-name">{{ agent.AgentName }}</span>
                  <svg class="kiosk-mark" viewBox="0 0 30 14" aria-hidden="true">
                    <path class="mark-path" d="M2 8.5 6.5 13 15 2.5" />
                    <path class="mark-path" d="M14 8.5 18.5 13 27 2.5" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 已签到名单（滚动展示）：还没有人签到时整块隐藏，空间让给未签到面板 -->
        <section v-if="kioskChecked.length" class="kiosk-panel kiosk-panel-checked" :aria-label="t('status.checkedIn')">
          <header class="kiosk-panel-head">
            <span>{{ t('status.checkedIn') }}</span>
            <span class="kiosk-panel-count tabular-nums">{{ kioskChecked.length }}</span>
          </header>
          <div class="kiosk-marquee">
            <div class="kiosk-marquee-track" :style="marqueeStyle(kioskChecked.length)">
              <div class="kiosk-chips">
                <span
                  v-for="agent in kioskChecked"
                  :key="agent.AgentName"
                  class="kiosk-chip"
                  :class="[factionClass(agent.AgentName), { 'is-alert': kioskMarkState(agent) === 'checkedOutInsufficient' }]"
                >
                  <span class="kiosk-chip-name">{{ agent.AgentName }}</span>
                  <svg class="kiosk-mark" viewBox="0 0 30 14" aria-hidden="true">
                    <path
                      class="mark-path"
                      :class="getCheckmarkVisual(kioskMarkState(agent)).first === 'solid' ? 'is-solid' : ''"
                      d="M2 8.5 6.5 13 15 2.5"
                    />
                    <path
                      class="mark-path"
                      :class="[
                        getCheckmarkVisual(kioskMarkState(agent)).second === 'solid' ? 'is-solid' : '',
                        getCheckmarkVisual(kioskMarkState(agent)).secondAlert ? 'is-alert' : ''
                      ]"
                      d="M14 8.5 18.5 13 27 2.5"
                    />
                  </svg>
                </span>
              </div>
              <div v-if="marqueeScrolling.checked" class="kiosk-chips" aria-hidden="true">
                <span
                  v-for="agent in kioskChecked"
                  :key="'dup-' + agent.AgentName"
                  class="kiosk-chip"
                  :class="[factionClass(agent.AgentName), { 'is-alert': kioskMarkState(agent) === 'checkedOutInsufficient' }]"
                >
                  <span class="kiosk-chip-name">{{ agent.AgentName }}</span>
                  <svg class="kiosk-mark" viewBox="0 0 30 14" aria-hidden="true">
                    <path
                      class="mark-path"
                      :class="getCheckmarkVisual(kioskMarkState(agent)).first === 'solid' ? 'is-solid' : ''"
                      d="M2 8.5 6.5 13 15 2.5"
                    />
                    <path
                      class="mark-path"
                      :class="[
                        getCheckmarkVisual(kioskMarkState(agent)).second === 'solid' ? 'is-solid' : '',
                        getCheckmarkVisual(kioskMarkState(agent)).secondAlert ? 'is-alert' : ''
                      ]"
                      d="M14 8.5 18.5 13 27 2.5"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 全空态：名单为空（如换场次后未加载）时兜底提示 -->
        <div v-if="!kioskUnchecked.length && !kioskChecked.length" class="kiosk-panel kiosk-panel-empty-all">
          <p class="kiosk-panel-empty">{{ agents.length ? t('kiosk.noCheckins') : t('empty.title') }}</p>
        </div>
      </div>

      <!-- 双钩图例：四种状态一眼可查 -->
      <div class="kiosk-legend no-select" aria-hidden="true">
        <span class="kiosk-legend-item">
          <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path" d="M14 8.5 18.5 13 27 2.5" /></svg>
          {{ t('kiosk.legendNone') }}
        </span>
        <span class="kiosk-legend-item">
          <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path is-solid" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path" d="M14 8.5 18.5 13 27 2.5" /></svg>
          {{ t('kiosk.legendIn') }}
        </span>
        <span class="kiosk-legend-item">
          <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path is-solid" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path is-solid" d="M14 8.5 18.5 13 27 2.5" /></svg>
          {{ t('kiosk.legendOut') }}
        </span>
        <span class="kiosk-legend-item is-alert-demo">
          <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path is-solid" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path is-solid is-alert" d="M14 8.5 18.5 13 27 2.5" /></svg>
          <span class="kiosk-chip-name">{{ t('kiosk.legendAlert') }}</span>
        </span>
      </div>

      <div class="kiosk-foot">
        <span v-if="lastUpdateText">{{ lastUpdateText }}</span>
        <span>IFSNext</span>
      </div>
    </div>
  </div>
</template>
