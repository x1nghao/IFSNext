<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppCard from '@/components/ui/AppCard.vue';
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue';
import type { Agent, Log } from '@/types';
import { extractSpreadsheetId, filterAgents, sortAgents, computeAgentStats } from '@/utils/agents';
import { formatRelativeTime } from '@/utils/time';
import {
  addAgentModifiedTime,
  parseAgentModifiedAt,
  removeAgentModifiedTime,
} from '@/utils/agentModifiedAt';
import { isSafeHttpUrl } from '@/utils/url';
import { buildCsvWithBom } from '@/utils/csv';

const { t, locale } = useI18n();

// State
const currentView = ref('operations');
const spreadsheetId = ref('');
const apiBaseUrl = ref('https://ifsapi.boki.one');
const checkinFormUrl = ref('');
const searchQuery = ref('');
const loading = ref(false);
const saving = ref(false);
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
const operationLogs = reactive<Log[]>([]);
const errorLogs = reactive<Log[]>([]);
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

// Methods
const addLog = (message: string) => {
  operationLogs.unshift({ timestamp: new Date().toLocaleTimeString(), message });
  if (operationLogs.length > 20) operationLogs.pop();
};

const addError = (message: string) => {
  errorLogs.unshift({ timestamp: new Date().toLocaleTimeString(), message });
  if (errorLogs.length > 20) errorLogs.pop();
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
    const choice = await deferredPrompt.userChoice;
    addLog(`安装选择: ${choice.outcome}`);
    deferredPrompt = null;
    canInstall.value = false;
  } catch (e: any) {
    addError(`安装失败: ${e.message}`);
  }
};

const filteredAgents = computed(() => filterAgents(agents.value, searchQuery.value));

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

const agentStats = computed(() => computeAgentStats(agents.value));
const checkedPercent = computed(() =>
  agentStats.value.total ? Math.round((agentStats.value.checkedIn / agentStats.value.total) * 100) : 0
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
      addError(`二维码生成失败: ${err.message}`);
    }
  }
};

// 仅放行 http(s) 链接，避免 javascript: 等伪协议进入二维码与 <a href>
const safeCheckinFormUrl = computed(() => (isSafeHttpUrl(checkinFormUrl.value) ? checkinFormUrl.value : ''));

const onGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    showQRCode.value = false;
  }
};

watch(showQRCode, (val) => {
  if (val) {
    window.addEventListener('keydown', onGlobalKeydown);
    // Wait for DOM update
    setTimeout(generateQRCode, 100);
  } else {
    window.removeEventListener('keydown', onGlobalKeydown);
  }
});

watch([spreadsheetId, apiBaseUrl, checkinFormUrl], ([sid, base, url]) => {
  try {
    localStorage.setItem('ifsnext_settings', JSON.stringify({
      spreadsheetId: sid || '',
      apiBaseUrl: base || '',
      checkinFormUrl: url || ''
    }));
  } catch (e: any) {
    addError(`自动保存设置失败: ${e.message}`);
  }
});

const setLocale = (lang: string) => {
  locale.value = lang;
  try { localStorage.setItem('ifsnext_lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
};

const saveSettings = async () => {
  saving.value = true;
  try {
    try {
      localStorage.setItem('ifsnext_settings', JSON.stringify({
        spreadsheetId: spreadsheetId.value,
        apiBaseUrl: apiBaseUrl.value,
        checkinFormUrl: checkinFormUrl.value
      }));
      addLog('设置已保存');
    } catch (e: any) {
      addError(`设置保存失败: ${e.message}`);
    }
  } finally {
    saving.value = false;
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
    }
  } catch (e: any) {
    addError(`读取设置失败: ${e.message}`);
  }
  
  if (spreadsheetId.value && agents.value.length === 0) {
    loadData(true);
  }
};

const loadData = async (useCache = false, silent = false) => {
  if (!spreadsheetId.value) {
    addError('请输入表格ID');
    return;
  }
  if (useCache && cachedData.value.length > 0 && lastUpdateTime.value) {
    const timeDiff = Date.now() - lastUpdateTime.value;
    if (timeDiff < 30000) {
      agents.value = [...cachedData.value];
      addLog('使用缓存数据');
      return;
    }
  }
  if (!silent) {
    loading.value = true;
    addLog('开始通过Agent加载数据...');
  }
  try {
    if (!isSafeHttpUrl(apiBaseUrl.value)) {
      throw new Error('API地址无效，必须以 http:// 或 https:// 开头');
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
      addLog(`加载 ${data.length} 条数据`);
    } else {
      throw new Error('API返回的数据格式不正确');
    }
  } catch (error: any) {
    addError(`数据加载失败: ${error.message}。请检查API地址(${apiBaseUrl.value})与网络连接。`);
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

const toggleVerification = async (agent: Agent) => {
  if (!spreadsheetId.value) {
    addError('请先设置表格ID');
    return;
  }
  if (verificationLoadingMap.value[agent.AgentName]) {
    return; // 已经在处理中
  }

  verificationLoadingMap.value[agent.AgentName] = true;
  addLog(`正在${agent.PV === 'TRUE' ? '取消' : ''}验证 ${agent.AgentName}`);
  const originalStatus = agent.PV;
  const newStatus = agent.PV === 'TRUE' ? 'FALSE' : 'TRUE';
  
  agent.PV = newStatus;
  setAgentModifiedTime(spreadsheetId.value, agent.AgentName, Date.now());
  const cachedAgent = cachedData.value.find(a => a.AgentName === agent.AgentName);
  if (cachedAgent) {
    cachedAgent.PV = newStatus;
  }
  
  try {
    const requestUrl = `${apiBaseUrl.value}/verify?agent_name=${encodeURIComponent(agent.AgentName)}&spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}`;
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
      addLog(`${agent.AgentName} 验证状态已${originalStatus === 'TRUE' ? '取消' : '通过'}`);
    } else {
      throw new Error(result.message || '验证操作失败');
    }
  } catch (error: any) {
    agent.PV = originalStatus;
    if (cachedAgent) {
      cachedAgent.PV = originalStatus;
    }
    // 回滚乐观更新时记录的修改时间，避免显示从未生效的时间戳
    removeAgentModifiedTimeEntry(spreadsheetId.value, agent.AgentName);
    addError(`验证操作失败: ${error.message}`);
    console.error('验证API调用错误:', error);
  } finally {
    verificationLoadingMap.value[agent.AgentName] = false;
  }
};

const clearSearch = () => {
  searchQuery.value = '';
  addLog('已清除搜索条件');
};

const exportCsv = () => {
  const list = sortedAgents.value;
  if (!list.length) {
    addError(t('csv.noData'));
    return;
  }
  const headers = [
    t('csv.col.name'),
    t('csv.col.faction'),
    t('csv.col.ap'),
    t('csv.col.status'),
    t('csv.col.modifiedAt'),
  ];
  const rows = list.map(a => [
    a.AgentName,
    a.AgentFaction,
    a.APdiff ?? '',
    a.PV === 'TRUE' ? t('status.checkedIn') : t('status.notCheckedIn'),
    getAgentModifiedTimeText(a.AgentName),
  ]);
  const blob = new Blob([buildCsvWithBom(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `IFSNext-${(spreadsheetId.value || 'export').slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  addLog(t('csv.exported', { n: list.length }));
};

watch(spreadsheetId, (newVal) => {
  if (!newVal) return;
  const extracted = extractSpreadsheetId(newVal);
  if (extracted) {
    spreadsheetId.value = extracted;
    addLog('已自动从链接提取表格ID');
  }
});

watch(currentView, (newVal) => {
  if (newVal === 'operations' && spreadsheetId.value) {
    loadData();
  }
});

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
    default: addLog('自动刷新已关闭'); return;
  }
  autoRefreshTimer.value = setInterval(async () => {
    if (currentView.value !== 'operations') return; // 非操作页不刷新
    if (!isRefreshing.value && !loading.value) {
      isRefreshing.value = true;
      try {
        await loadData(false, true);
        addLog(`自动刷新完成 (${mode}模式)`);
      } catch (error: any) {
        addError(`自动刷新失败: ${error.message}`);
      } finally {
        isRefreshing.value = false;
      }
    }
  }, interval);
  const modeNames: Record<string, string> = { slow: '慢速(1分钟)', medium: '中速(10秒)', fast: '快速(3秒)' };
  addLog(`自动刷新已设置为${modeNames[mode]}`);
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
  nowTickTimer = setInterval(() => { nowTick.value = Date.now(); }, 10_000);
  addLog('应用初始化完成');
  
  // PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canInstall.value = true;
    addLog('可安装为PWA应用');
  });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
});

onUnmounted(() => {
  cleanup();
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>

<template>
  <div class="min-h-screen">
    <!-- 浮动玻璃顶栏 -->
    <header class="ifs-topbar no-select">
      <div class="ifs-topbar-inner">
        <h1 class="text-lg font-bold tracking-tight text-[var(--color-text)]">IFSNext</h1>
        <div class="flex items-center gap-2">
          <button v-if="checkinFormUrl" @click="showQRCode = true" class="ifs-iconbtn" :title="t('qr.title')" :aria-label="t('qr.title')">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
            </svg>
          </button>
          <button v-if="canInstall" @click="installPWA" class="agent-action action-primary">
            {{ t('nav.install') }}
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
      <button class="ifs-tab" :class="{ 'is-active': currentView === 'settings' }" @click="currentView = 'settings'" :aria-current="currentView === 'settings' ? 'page' : undefined">
        <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
        </svg>
        {{ t('nav.settings') }}
      </button>
    </nav>

    <!-- 离线提示横幅 -->
    <div v-if="isOffline" class="bg-[var(--color-warning)] text-white text-sm text-center py-1.5 px-4 no-select">
      {{ t('offline.banner') }}
    </div>

    <!-- 主内容区域 -->
    <main class="max-w-7xl mx-auto py-4 sm:px-6 lg:px-8 tabbar-space">
      <!-- 设置页面 -->
      <div v-if="currentView === 'settings'" class="px-4 py-6 sm:px-0">
        <div class="card overflow-hidden">
          <div class="p-4 sm:p-6">
            <h2 class="title-text font-bold text-[var(--color-text)] mb-4">{{ t('settings.title') }}</h2>

            <!-- 外观设置 -->
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
            <div class="mb-6">
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

            <!-- 表格配置 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label class="block text-sm font-medium text-[var(--color-text)] mb-2">{{ t('settings.sheetIdLabel') }}</label>
                <AppInput v-model="spreadsheetId" :placeholder="t('settings.sheetIdPlaceholder')" mono />
                <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {{ t('settings.examplePrefix') }}: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
                </p>
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
              <p class="mt-1 text-sm text-[var(--color-text-secondary)]">
                {{ t('settings.qrHint') }}
              </p>
            </div>
            <!-- 自动刷新设置 -->
            <div class="mt-6">
              <h3 class="text-md font-medium text-[var(--color-text)]">{{ t('autorefresh.title') }}</h3>
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
            <!-- 操作按钮 -->
            <div class="flex space-x-4 mt-4">
              <AppButton @click="saveSettings" :loading="saving" class="transition-all duration-200 hover:scale-105 active:scale-95">
                {{ saving ? t('saving') : t('saveSettings') }}
              </AppButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作页面 -->
      <div v-else class="px-4 py-6 sm:px-0">
        <!-- 操作控制面板 -->
        <div class="card mb-6 overflow-hidden">
          <div class="p-4 sm:p-6">
            <div class="flex items-center justify-between gap-3 mb-4 flex-nowrap">
              <!-- 搜索框 -->
              <div class="relative flex-1 min-w-0 sm:min-w-[240px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-secondary)] pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"></path>
                </svg>
                <AppInput v-model="searchQuery" :placeholder="t('search.placeholder')" :has-icon="true" />
                <button v-if="searchQuery" @click="clearSearch" class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                  ✕
                </button>
              </div>

              <!-- 刷新按钮 -->
              <AppButton @click="loadData(false)" :loading="loading || isRefreshing" :disabled="loading || isRefreshing" class="transition-all duration-200 hover:scale-105 active:scale-95 shrink-0">
                {{ loading ? t('loading') : (isRefreshing ? t('refreshing') : t('refreshData')) }}
              </AppButton>
            </div>

            <!-- 排序区域 -->
            <div class="mt-2 flex justify-center sm:justify-start">
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
            </div>

            <!-- 签到进度统计 -->
            <div v-if="agentStats.total" class="mt-4 rounded-[12px] bg-[var(--color-control-bg)] dark:bg-[var(--color-control-bg-dark)] p-3">
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
          </div>
        </div>


        <!-- 数据展示区域 -->
        <div class="card overflow-hidden">
          <div class="p-4 sm:p-6">
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
              <p class="text-xs text-[var(--color-text-secondary)] mt-1">{{ t('empty.hint') }}</p>
            </div>

            <!-- 名单紧凑行 -->
            <div v-else>
              <div class="agent-list">
                <div v-for="agent in sortedAgents" :key="agent.AgentName" class="agent-row">
                  <div class="agent-row-main">
                    <span class="agent-row-name" :class="agent.AgentFaction === 'Resistance' ? 'is-resistance' : (agent.AgentFaction === 'Enlightened' ? 'is-enlightened' : '')">{{ agent.AgentName }}</span>
                    <span class="faction-tag" :class="agent.AgentFaction === 'Resistance' ? 'is-resistance' : (agent.AgentFaction === 'Enlightened' ? 'is-enlightened' : '')">{{ agent.AgentFaction }}</span>
                  </div>
                  <div class="agent-row-side">
                    <span class="agent-row-ap" :class="{ 'is-negative': Number(agent.APdiff) < 0 }">
                      <svg class="ap-delta" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M6 1.6 10.9 10.4 H1.1 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                      </svg>
                      <span>AP {{ agent.APdiff ?? '—' }}</span>
                    </span>
                    <span class="status-badge" :class="agent.PV === 'TRUE' ? 'is-checked' : 'is-unchecked'">
                      {{ t(agent.PV === 'TRUE' ? 'status.checkedIn' : 'status.notCheckedIn') }}
                    </span>
                    <span v-if="getAgentModifiedTimeText(agent.AgentName)" class="agent-row-time">
                      {{ getAgentModifiedTimeText(agent.AgentName) }}
                    </span>
                    <button
                      @click="toggleVerification(agent)"
                      class="agent-action"
                      :class="[getActionButtonClass(agent), { 'opacity-50 cursor-not-allowed': verificationLoadingMap[agent.AgentName] }]"
                      :disabled="verificationLoadingMap[agent.AgentName]"
                    >
                      <span v-if="verificationLoadingMap[agent.AgentName]" class="inline-block animate-spin mr-1">⌛</span>
                      {{ t(agent.PV === 'TRUE' ? 'actions.uncheck' : 'actions.check') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部：总数与导出 -->
            <div class="flex items-center justify-between mt-4">
              <span class="text-sm text-[var(--color-text-secondary)]">
                {{ t('list.countPrefix') }} {{ filteredAgents.length }} {{ t('list.countSuffix') }}
              </span>
              <button v-if="sortedAgents.length" @click="exportCsv" class="export-link">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"></path>
                </svg>
                {{ t('csv.export') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 二维码弹窗 -->
        <div v-if="showQRCode" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" @click="showQRCode = false">
          <AppCard class="w-full max-w-md shadow-xl" role="dialog" aria-modal="true" @click.stop>
            <!-- 头部 -->
            <div class="flex justify-between items-center mb-6">
              <div class="flex items-center space-x-3">
                <div class="w-11 h-11 rounded-[14px] flex items-center justify-center bg-white/60 dark:bg-white/10">
                  <svg class="w-6 h-6 text-[var(--color-primary)] dark:text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-[var(--color-text)]">{{ t('qr.title') }}</h3>
              </div>
              <button @click="showQRCode = false" class="w-8 h-8 rounded-full bg-[var(--color-control-bg)] dark:bg-[var(--color-control-bg-dark)] hover:bg-[var(--color-control-bg-strong)] dark:hover:bg-[var(--color-control-bg-strong-dark)] flex items-center justify-center transition-colors duration-200">
                <svg class="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <!-- 二维码容器 -->
            <div class="flex justify-center mb-6">
              <div class="qr-panel">
                <!-- Replaced div with canvas -->
                <canvas ref="qrcodeCanvas" class="bg-white rounded-lg p-2 shadow-sm"></canvas>
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
  </div>
</template>
