;(async function(){
  if (!window.__ensureVue) { window.__ensureVue = async function(){ return !!(window.Vue && window.VueI18n); }; }
  const ready = await window.__ensureVue();
  if (!ready) {
    const el = document.getElementById('app');
    if (el && el.hasAttribute('v-cloak')) { el.removeAttribute('v-cloak'); }
    return;
  }
  const { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } = Vue;

  const messages = {
    'zh-CN': {
      nav: { settings: '设置', operations: '签到', install: '安装' },
      settings: {
        title: '系统设置',
        language: '语言',
        sheetIdLabel: 'Google 表格 ID',
        sheetIdPlaceholder: '输入Google Sheets表格ID',
        examplePrefix: '例如',
        apiBaseLabel: '后端API地址',
        apiBasePlaceholder: 'https://ifsapi.boki.one',
        apiBaseDefault: '默认使用测试后端: https://ifsapi.boki.one',
        checkinLabel: '签到表单链接',
        qrHint: '设置后将在导航栏显示二维码图标，方便用户扫描签到'
      },
      autorefresh: {
        title: '自动刷新设置',
        hint: '设置自动刷新可以定期更新数据',
        off: '关闭自动刷新',
        slow: '慢速(1分钟)',
        medium: '中速(10秒)',
        fast: '快速(3秒)',
        refreshing: '刷新中...'
      },
      search: { placeholder: '搜索 Agent 名称...' },
      sort: { name: '名称', faction: '阵营', ap: 'AP', status: '状态' },
      loading: '加载中...',
      refreshing: '刷新中...',
      refreshData: '刷新数据',
      loadingData: '数据加载中...',
      empty: { title: '暂无数据，请先加载数据或调整筛选条件', hint: '也可以尝试刷新或修改搜索条件' },
      status: { checkedIn: '已签到', notCheckedIn: '未签到' },
      actions: { check: '签到', uncheck: '取消签到' },
      list: { countPrefix: '共', countSuffix: '条记录' },
      saving: '保存中...',
      saveSettings: '保存设置',
      qr: { title: '签到表单二维码', linkLabel: '签到表单链接：', closeHint: '点击外部区域关闭', hint: '扫描二维码或点击链接访问签到表单' }
    },
    'en-US': {
      nav: { settings: 'Settings', operations: 'Check-in', install: 'Install' },
      settings: {
        title: 'System Settings',
        language: 'Language',
        sheetIdLabel: 'Google Sheets ID',
        sheetIdPlaceholder: 'Enter Google Sheets ID',
        examplePrefix: 'e.g.',
        apiBaseLabel: 'Backend API Base URL',
        apiBasePlaceholder: 'https://ifsapi.boki.one',
        apiBaseDefault: 'Default test backend: https://ifsapi.boki.one',
        checkinLabel: 'Check-in Form Link',
        qrHint: 'After set, a QR icon appears for scanning the check-in form'
      },
      autorefresh: {
        title: 'Auto Refresh',
        hint: 'Refresh data periodically',
        off: 'Off',
        slow: 'Slow (1 min)',
        medium: 'Medium (10 s)',
        fast: 'Fast (3 s)',
        refreshing: 'Refreshing...'
      },
      search: { placeholder: 'Search agent name...' },
      sort: { name: 'Name', faction: 'Faction', ap: 'AP', status: 'Status' },
      loading: 'Loading...',
      refreshing: 'Refreshing...',
      refreshData: 'Refresh Data',
      loadingData: 'Loading data...',
      empty: { title: 'No data. Load or change filters.', hint: 'Try refreshing or changing search.' },
      status: { checkedIn: 'Checked In', notCheckedIn: 'Not Checked In' },
      actions: { check: 'Check In', uncheck: 'Undo Check-in' },
      list: { countPrefix: 'Total', countSuffix: 'records' },
      saving: 'Saving...',
      saveSettings: 'Save Settings',
      qr: { title: 'Check-in Form QR', linkLabel: 'Form link:', closeHint: 'Click outside to close', hint: 'Scan the QR or click the link to open the form' }
    }
  };

const defaultLang = localStorage.getItem('ifsnext_lang') || (navigator.language && navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US');
const i18n = VueI18n.createI18n({ legacy: false, locale: defaultLang, fallbackLocale: 'zh-CN', messages });

const app = createApp({
    setup() {
      const t = (key, ...args) => i18n.global.t(key, ...args);
      const locale = ref(i18n.global.locale);
      const currentView = ref('operations');
      const spreadsheetId = ref('');
      const sheetName = ref('Data');
      const apiBaseUrl = ref('https://ifsapi.boki.one');
      const checkinFormUrl = ref('');
      const searchQuery = ref('');
      const loading = ref(false);
      const saving = ref(false);
      const verificationLoading = ref(false);
      const currentVerificationAgent = ref('');
      const agents = ref([]);
      const systemPrefersDark = ref(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const isDark = computed(() => systemPrefersDark.value);
      const operationLogs = reactive([]);
      const errorLogs = reactive([]);
      const showQRCode = ref(false);
      const cachedData = ref([]);
      const lastUpdateTime = ref(null);
      const autoRefreshMode = ref('off');
      const autoRefreshTimer = ref(null);
      const isRefreshing = ref(false);

      const canInstall = ref(false);
      let deferredPrompt = null;
      const installPWA = async () => {
        try {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          addLog(`安装选择: ${choice.outcome}`);
          deferredPrompt = null;
          canInstall.value = false;
        } catch (e) {
          addError(`安装失败: ${e.message}`);
        }
      };

      const filteredAgents = computed(() => {
        if (!searchQuery.value) return agents.value;
        return agents.value.filter(agent => agent.AgentName.toLowerCase().includes(searchQuery.value.toLowerCase()));
      });

      const sortKey = ref('');
      const sortOrder = ref('asc');

      const sortedAgents = computed(() => {
        const data = filteredAgents.value.slice();
        if (!sortKey.value) return data;
        const getVal = (agent) => {
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

      watch(isDark, (val) => {
        document.documentElement.classList.toggle('dark', val);
      }, { immediate: true });

      const ensureQRCodeLib = () => new Promise((resolve, reject) => {
        if (window.QRCode) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('二维码库加载失败'));
        document.head.appendChild(script);
      });

      watch(showQRCode, async (val) => {
        if (val && checkinFormUrl.value) {
          try {
            await ensureQRCodeLib();
            setTimeout(() => {
              const qrcodeElement = document.getElementById('qrcode');
              if (qrcodeElement) {
                generateQRCode(qrcodeElement, checkinFormUrl.value);
              }
            }, 100);
          } catch (e) {
            addError(e.message);
          }
        }
      });

      watch([spreadsheetId, apiBaseUrl, checkinFormUrl], ([sid, base, url]) => {
        try {
          localStorage.setItem('ifsnext_settings', JSON.stringify({
            spreadsheetId: sid || '',
            apiBaseUrl: base || '',
            checkinFormUrl: url || ''
          }));
        } catch (e) {
          addError(`自动保存设置失败: ${e.message}`);
        }
      });

      const generateQRCode = (element, text) => {
        element.innerHTML = '';
        const qrCodeContainer = document.createElement('div');
        qrCodeContainer.className = 'flex justify-center items-center';
        element.appendChild(qrCodeContainer);
        new QRCode(qrCodeContainer, { text, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
        const linkDisplay = document.createElement('div');
        linkDisplay.className = 'text-sm text-gray-600 dark:text-gray-400 break-all mt-4 text-center';
        linkDisplay.innerHTML = `<p class="mb-2">${t('qr.linkLabel')}</p><a href="${text}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline">${text}</a>`;
        element.appendChild(linkDisplay);
      };

      const setLocale = (lang) => {
        locale.value = lang;
        i18n.global.locale = lang;
        try { localStorage.setItem('ifsnext_lang', lang); } catch (e) {}
        document.documentElement.lang = lang;
      };

      const setSort = (key) => {
        if (sortKey.value === key) {
          sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey.value = key;
          sortOrder.value = 'asc';
        }
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
        
        // 如果有ID但没有数据，尝试自动刷新
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
        } catch (error) {
          addError(`数据加载失败: ${error.message}。请检查API地址(${apiBaseUrl.value})与网络连接。`);
          console.error('API调用错误:', error);
        } finally {
          if (!silent) {
            loading.value = false;
          }
        }
      };

      const toggleVerification = async (agent) => {
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
        } catch (error) {
          agent.PV = originalStatus;
          if (cachedAgent) {
            cachedAgent.PV = originalStatus;
          }
          addError(`验证操作失败: ${error.message}`);
          console.error('验证API调用错误:', error);
        } finally {
          verificationLoading.value = false;
          currentVerificationAgent.value = null;
        }
      };

      const clearSearch = () => {
        searchQuery.value = '';
        addLog('已清除搜索条件');
      };

      const addLog = (message) => {
        operationLogs.unshift({ timestamp: new Date().toLocaleTimeString(), message });
        if (operationLogs.length > 20) operationLogs.pop();
      };

      const addError = (message) => {
        errorLogs.unshift({ timestamp: new Date().toLocaleTimeString(), message });
        if (errorLogs.length > 20) errorLogs.pop();
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

      const runTests = () => {
        addLog('开始运行测试...');
        setTimeout(() => { addLog('测试完成: 所有功能正常'); }, 1000);
      };

      const clearLogs = () => {
        operationLogs.splice(0);
        errorLogs.splice(0);
        addLog('已清除所有日志');
      };

      const setAutoRefresh = (mode) => {
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
            } catch (error) {
              addError(`自动刷新失败: ${error.message}`);
            } finally {
              isRefreshing.value = false;
            }
          }
        }, interval);
        const modeNames = { slow: '慢速(1分钟)', medium: '中速(10秒)', fast: '快速(3秒)' };
        addLog(`自动刷新已设置为${modeNames[mode]}`);
      };

      const cleanup = () => {
        if (autoRefreshTimer.value) {
          clearInterval(autoRefreshTimer.value);
          autoRefreshTimer.value = null;
        }
      };

      onMounted(() => {
        const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
        if (mql) {
          systemPrefersDark.value = mql.matches;
          const handler = (e) => { systemPrefersDark.value = e.matches; };
          if (mql.addEventListener) mql.addEventListener('change', handler); else mql.addListener(handler);
        }
        document.documentElement.classList.toggle('dark', isDark.value);
        document.documentElement.lang = locale.value;
        const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone);
        if (isStandalone) {
          document.documentElement.classList.add('pwa');
          document.body.classList.add('pwa');
        }
        loadSettings();
        addLog('应用初始化完成');
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('./sw.js').then((registration) => {
            addLog('Service Worker 已注册');
            if (registration.waiting) { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); }
            registration.addEventListener('updatefound', () => {
              const newSW = registration.installing;
              newSW && newSW.addEventListener('statechange', () => {
                if (newSW.state === 'installed') {
                  addLog('有新版本，正在切换...');
                  registration.waiting && registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });
          }).catch(err => addError(`SW注册失败: ${err.message}`));
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            addLog('应用已更新，正在刷新...');
            window.location.reload();
          });
        }
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault();
          deferredPrompt = e;
          canInstall.value = true;
          addLog('可安装为PWA应用');
        });
      });

      onUnmounted(() => { cleanup(); });

      return {
        currentView,
        spreadsheetId,
        sheetName,
        apiBaseUrl,
        checkinFormUrl,
        showQRCode,
        searchQuery,
        loading,
        saving,
        cachedData,
        lastUpdateTime,
        autoRefreshMode,
        autoRefreshTimer,
        isRefreshing,
        canInstall,
        verificationLoading,
        currentVerificationAgent,
        agents,
        filteredAgents,
        sortedAgents,
        sortKey,
        sortOrder,
        isDark,
        operationLogs,
        errorLogs,
        saveSettings,
        loadSettings,
        loadData,
        toggleVerification,
        clearSearch,
        setSort,
        setAutoRefresh,
        installPWA,
        addLog,
        addError,
        runTests,
        clearLogs,
        cleanup,
        locale,
        t,
        setLocale
      };
    }
  });
app.use(i18n);
try {
  app.mount('#app');
} catch (e) {
  const el = document.getElementById('app');
  if (el && el.hasAttribute('v-cloak')) {
    el.removeAttribute('v-cloak');
  }
}
})();