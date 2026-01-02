<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppCard from '@/components/ui/AppCard.vue';
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue';

// Types
interface Agent {
  AgentName: string;
  AgentFaction: string;
  APdiff: number | string;
  PV: string;
  [key: string]: any;
}

interface Log {
  timestamp: string;
  message: string;
}

const { t, locale } = useI18n();

// State
const currentView = ref('operations');
const spreadsheetId = ref('');
const apiBaseUrl = ref('https://ifsapi.boki.one');
const checkinFormUrl = ref('');
const searchQuery = ref('');
const loading = ref(false);
const saving = ref(false);
const verificationLoading = ref(false);
const currentVerificationAgent = ref('');
const agents = ref<Agent[]>([]);
const systemPrefersDark = ref(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
const isDark = computed(() => systemPrefersDark.value);
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

// Methods
const addLog = (message: string) => {
  operationLogs.unshift({ timestamp: new Date().toLocaleTimeString(), message });
  if (operationLogs.length > 20) operationLogs.pop();
};

const addError = (message: string) => {
  errorLogs.unshift({ timestamp: new Date().toLocaleTimeString(), message });
  if (errorLogs.length > 20) errorLogs.pop();
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

const filteredAgents = computed(() => {
  if (!searchQuery.value) return agents.value;
  return agents.value.filter(agent => agent.AgentName.toLowerCase().includes(searchQuery.value.toLowerCase()));
});

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

const sortedAgents = computed(() => {
  const data = filteredAgents.value.slice();
  if (!sortKey.value) return data;
  const getVal = (agent: Agent) => {
    switch (sortKey.value) {
      case 'AgentName': return (agent.AgentName || '').toLowerCase();
      case 'AgentFaction': return (agent.AgentFaction || '').toLowerCase();
      case 'APdiff': return Number(agent.APdiff ?? 0);
      case 'PV': return agent.PV === 'TRUE' ? 1 : 0;
      default: return 0;
    }
  };
  data.sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    if (va < vb) return sortOrder.value === 'asc' ? -1 : 1;
    if (va > vb) return sortOrder.value === 'asc' ? 1 : -1;
    return 0;
  });
  return data;
});

const generateQRCode = async () => {
  if (qrcodeCanvas.value && checkinFormUrl.value) {
    try {
      await QRCode.toCanvas(qrcodeCanvas.value, checkinFormUrl.value, {
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

watch(showQRCode, (val) => {
  if (val) {
    // Wait for DOM update
    setTimeout(generateQRCode, 100);
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
    localStorage.setItem('ifsnext_settings', JSON.stringify({
      spreadsheetId: spreadsheetId.value,
      apiBaseUrl: apiBaseUrl.value,
      checkinFormUrl: checkinFormUrl.value
    }));
    addLog('设置已保存');
  } finally {
    saving.value = false;
  }
};

const loadSettings = () => {
  const saved = localStorage.getItem('ifsnext_settings');
  if (saved) {
    const settings = JSON.parse(saved);
    spreadsheetId.value = settings.spreadsheetId || '';
    apiBaseUrl.value = settings.apiBaseUrl || 'https://ifsapi.boki.one';
    checkinFormUrl.value = settings.checkinFormUrl || '';
  }
  
  if (spreadsheetId.value && agents.value.length === 0) {
    loadData(true, true);
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
    const requestUrl = `${apiBaseUrl.value}/data?spreadsheet_id=${spreadsheetId.value}`;
    const response = await fetch(requestUrl, { headers: { 'Accept': 'application/json' } });
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
  if (agent.PV === 'TRUE') {
    return 'text-xs px-3 py-1.5 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 font-medium';
  }
  const base = 'text-xs px-3 py-1.5 rounded-md text-white shadow-md hover:shadow-lg transition-all duration-200 border border-white/40 font-medium';
  if (agent.AgentFaction === 'Resistance') {
    return `${base} bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500`;
  } else if (agent.AgentFaction === 'Enlightened') {
    return `${base} bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500`;
  }
  return `${base} bg-[var(--color-primary)] hover:opacity-90`;
};

const toggleVerification = async (agent: Agent) => {
  if (!spreadsheetId.value) {
    addError('请先设置表格ID');
    return;
  }
  verificationLoading.value = true;
  currentVerificationAgent.value = agent.AgentName;
  addLog(`正在${agent.PV === 'TRUE' ? '取消' : ''}验证 ${agent.AgentName}`);
  const originalStatus = agent.PV;
  const newStatus = agent.PV === 'TRUE' ? 'FALSE' : 'TRUE';
  
  agent.PV = newStatus;
  const cachedAgent = cachedData.value.find(a => a.AgentName === agent.AgentName);
  if (cachedAgent) {
    cachedAgent.PV = newStatus;
  }
  
  try {
    const requestUrl = `${apiBaseUrl.value}/verify?agent_name=${encodeURIComponent(agent.AgentName)}&spreadsheet_id=${spreadsheetId.value}`;
    const response = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
    addError(`验证操作失败: ${error.message}`);
    console.error('验证API调用错误:', error);
  } finally {
    verificationLoading.value = false;
    currentVerificationAgent.value = '';
  }
};

const clearSearch = () => {
  searchQuery.value = '';
  addLog('已清除搜索条件');
};

watch(spreadsheetId, (newVal) => {
  if (!newVal) return;
  const match = newVal.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    spreadsheetId.value = match[1];
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
  addLog('应用初始化完成');
  
  // PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canInstall.value = true;
    addLog('可安装为PWA应用');
  });
});

onUnmounted(() => { cleanup(); });
</script>

<template>
  <div class="min-h-screen bg-[var(--color-bg)] dark:bg-[var(--color-bg-dark)]">
    <!-- 导航栏 -->
    <nav class="sticky top-0 z-50 backdrop-blur-xl bg-[var(--color-titlebar)] dark:bg-[var(--color-titlebar-dark)] text-white shadow-lg border-b border-white/10 safe-pt no-select">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <h1 class="title-text font-bold text-white">IFSNext</h1>
          </div>
          <div class="flex items-center space-x-4">
            <button v-if="checkinFormUrl" @click="showQRCode = true" class="tap-target w-11 h-11 flex items-center justify-center rounded-[14px] hover:bg-white/10 text-white transition-colors duration-200" :title="t('qr.title')">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
              </svg>
            </button>
            <button @click="currentView = 'settings'" :class="{ 'bg-white/10': currentView === 'settings' }" class="px-4 py-2 rounded-[10px] text-white hover:bg-white/10 tap-target transition-colors duration-200">
              {{ t('nav.settings') }}
            </button>
            <button @click="currentView = 'operations'" :class="{ 'bg-white/10': currentView === 'operations' }" class="px-4 py-2 rounded-[10px] text-white hover:bg-white/10 tap-target transition-colors duration-200">
              {{ t('nav.operations') }}
            </button>
            <button v-if="canInstall" @click="installPWA" class="px-4 h-[44px] rounded-[10px] bg-green-600 hover:bg-green-700 text-white tap-target transition-colors duration-200">
              {{ t('nav.install') }}
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- 主内容区域 -->
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 safe-pb">
      <!-- 设置页面 -->
      <div v-if="currentView === 'settings'" class="px-4 py-6 sm:px-0">
        <div class="card overflow-hidden">
          <div class="p-4 sm:p-6">
            <h2 class="title-text font-bold text-gray-900 dark:text-gray-100 mb-4">{{ t('settings.title') }}</h2>

            <!-- 语言设置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">{{ t('settings.language') }}</label>
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
                <label class="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">{{ t('settings.sheetIdLabel') }}</label>
                <AppInput v-model="spreadsheetId" :placeholder="t('settings.sheetIdPlaceholder')" />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ t('settings.examplePrefix') }}: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
                </p>
              </div>
            </div>

            <!-- 后端配置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">{{ t('settings.apiBaseLabel') }}</label>
              <AppInput v-model="apiBaseUrl" :placeholder="t('settings.apiBasePlaceholder')" />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ t('settings.apiBaseDefault') }}
              </p>
            </div>

            <!-- 签到表单配置 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">{{ t('settings.checkinLabel') }}</label>
              <AppInput v-model="checkinFormUrl" placeholder="https://example.com/checkin-form" />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ t('settings.qrHint') }}
              </p>
            </div>
            <!-- 自动刷新设置 -->
            <div class="mt-6">
              <h3 class="text-md font-medium text-gray-800 dark:text-gray-200">{{ t('autorefresh.title') }}</h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('autorefresh.hint') }}</p>
              <div class="mt-3 flex items-center gap-3">
                <select v-model="autoRefreshMode" @change="setAutoRefresh(autoRefreshMode)" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="off">{{ t('autorefresh.off') }}</option>
                  <option value="slow">{{ t('autorefresh.slow') }}</option>
                  <option value="medium">{{ t('autorefresh.medium') }}</option>
                  <option value="fast">{{ t('autorefresh.fast') }}</option>
                </select>
                <span v-if="isRefreshing" class="flex items-center text-sm text-blue-500">
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
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-400 pointer-events-none z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"></path>
                </svg>
                <AppInput v-model="searchQuery" :placeholder="t('search.placeholder')" :has-icon="true" />
                <button v-if="searchQuery" @click="clearSearch" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
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
          </div>
        </div>


        <!-- 数据展示区域 -->
        <div class="card overflow-hidden">
          <div class="p-4 sm:p-6">
            <!-- 加载状态 -->
            <div v-if="loading" class="text-center py-8">
              <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto dark:border-blue-400"></div>
              <p class="mt-2 text-gray-600 dark:text-gray-400">{{ t('loadingData') }}</p>
            </div>

            <!-- 空状态 -->
            <div v-else-if="!filteredAgents.length" class="text-center py-10">
              <div class="mx-auto w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                <svg class="w-6 h-6 text-gray-400 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <p class="title-text text-gray-700 dark:text-gray-300">{{ t('empty.title') }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ t('empty.hint') }}</p>
            </div>

            <!-- 数据卡片栅格 -->
            <div v-else>
              <!-- 卡片栅格：最多三列 -->
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-4 justify-items-center">
                <div v-for="agent in sortedAgents" :key="agent.AgentName" :class="[
                                       'card w-full max-w-md p-4 transition rounded-[20px]',
                                       agent.AgentFaction === 'Resistance' ? 'agent-card--resistance' : 'agent-card--enlightened'
                                     ]">
                  <div class="flex items-start justify-between">
                    <div>
                      <div :class="[
                                                'text-xl font-bold truncate',
                                                agent.AgentFaction === 'Resistance' ? 'text-blue-600 dark:text-blue-300' : 'text-green-600 dark:text-green-300'
                                            ]">
                        {{ agent.AgentName }}
                      </div>
                      <div class="mt-2 flex items-center text-sm">
                        <span class="inline-block w-2 h-2 rounded-full mr-2" :class="Number(agent.APdiff) >= 10000 ? 'bg-green-500' : 'bg-red-500'"></span>
                        <span :class="['text-gray-600 dark:text-gray-300', (Number(agent.APdiff) < 0) ? 'text-red-500 dark:text-red-400 font-semibold' : ((Number(agent.APdiff) > 0 && Number(agent.APdiff) < 10000) ? 'text-amber-500 dark:text-amber-400 font-semibold' : '')]">ΔAP: {{ agent.APdiff }}</span>
                      </div>
                    </div>
                    <span :class="[
                                            'px-3 py-1 rounded-full text-xs font-semibold',
                                            agent.PV === 'TRUE' ? 'bg-green-800 text-white dark:bg-green-900' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                        ]">
                      {{ t(agent.PV === 'TRUE' ? 'status.checkedIn' : 'status.notCheckedIn') }}
                    </span>
                  </div>

                  <div class="mt-3 flex items-center justify-between">
                    <span :class="[
                                            'px-2 py-1 rounded-full text-xs',
                                            agent.AgentFaction === 'Resistance' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                        ]">{{ agent.AgentFaction }}</span>

                    <button @click="toggleVerification(agent)" :class="getActionButtonClass(agent)">
                      {{ t(agent.PV === 'TRUE' ? 'actions.uncheck' : 'actions.check') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 显示总数 -->
            <div class="flex justify-end mt-4">
              <span class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('list.countPrefix') }} {{ filteredAgents.length }} {{ t('list.countSuffix') }}
              </span>
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
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('qr.title') }}</h3>
              </div>
              <button @click="showQRCode = false" class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors duration-200">
                <svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('qr.hint') }}</p>
              <!-- Link is now dynamic -->
              <div class="text-sm text-gray-600 dark:text-gray-400 break-all mt-4 text-center">
                <p class="mb-2">{{ t('qr.linkLabel') }}</p>
                <a :href="checkinFormUrl" target="_blank" class="text-[var(--color-primary)] dark:text-[var(--color-primary)] hover:underline">{{ checkinFormUrl }}</a>
              </div>

              <div class="flex items-center justify-center space-x-2 text-xs text-gray-500 dark:text-gray-500">
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
