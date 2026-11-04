<script setup lang="ts">
// 应用壳与编排层：顶栏/底部导航/视图切换/Escape 层级/生命周期装配。
// 各领域状态与逻辑在 composables/ 中，视图呈现在其引用的组件内；本文件只做「接线」。
import { watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorToast from '@/components/layout/ErrorToast.vue';
import QrCodeModal from '@/components/layout/QrCodeModal.vue';
import SettingsView from '@/components/settings/SettingsView.vue';
import LotteryView from '@/components/lottery/LotteryView.vue';
import LotteryDrawModal from '@/components/lottery/LotteryDrawModal.vue';
import OperationsView from '@/components/operations/OperationsView.vue';
import KioskOverlay from '@/components/kiosk/KioskOverlay.vue';
import { useAppView } from '@/composables/useAppView';
import { useTheme } from '@/composables/useTheme';
import { useToast } from '@/composables/useToast';
import { usePwa } from '@/composables/usePwa';
import { useKiosk } from '@/composables/useKiosk';
import { useAgentData } from '@/composables/useAgentData';
import { useLottery } from '@/composables/useLottery';
import { useSettings } from '@/composables/useSettings';
import { useAgentModifiedAt } from '@/composables/useAgentModifiedAt';
import { useViewPrefs } from '@/composables/useViewPrefs';
import { useSheetRecents } from '@/composables/useSheetRecents';
import { useFilters } from '@/composables/useFilters';
import { useFormCheck } from '@/composables/useFormCheck';
import { useVerification } from '@/composables/useVerification';

const { t, locale } = useI18n();
const { currentView, showQRCode } = useAppView();
const { initTheme, disposeTheme } = useTheme();
const { toast, dismissToast, clearToastTimer } = useToast();
const { isOffline, canInstall, installPWA, initPwa, disposePwa } = usePwa();
const { kioskMode, enterKiosk, stopKioskTimer } = useKiosk();
const { agents, agentStats, loadData, startNowTick, stopNowTick, stopAutoRefresh } = useAgentData();
const { lotterySeed, lotteryDrawState, closeLotteryModal, cancelLotteryDraw, loadLotteryHistory } = useLottery();
const { spreadsheetId, checkinFormUrl, lotteryEnabled, loadSettings } = useSettings();
const { loadAgentModifiedAt } = useAgentModifiedAt();
const { loadViewPrefs } = useViewPrefs();
const { loadSheetRecents } = useSheetRecents();
const { initRosterColumns, disposeRosterColumns } = useFilters();
const { stopFormCheck } = useFormCheck();
const { disposeUndoHold } = useVerification();

// ── 全局 Escape：按浮层层级从高到低逐层关闭（Toast 永远浮在最上）──
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

// ── 视图切换的联动：进签到页刷新数据，进抽奖页补默认种子 ──
watch(currentView, (newVal) => {
  if (newVal === 'operations' && spreadsheetId.value) {
    loadData();
  }
  if (newVal === 'lottery' && !lotterySeed.value) {
    const now = new Date();
    lotterySeed.value = `IFS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }
});

onMounted(() => {
  initTheme();
  initPwa();
  document.documentElement.lang = locale.value;
  // 启动装配：先恢复设置（含表格 ID），再载入依赖它的本地数据，最后启动心跳与监听
  loadSettings();
  loadAgentModifiedAt();
  loadViewPrefs();
  loadLotteryHistory();
  loadSheetRecents();
  // 启动即有表格 ID 时自动拉一次数据（30 秒内新鲜缓存直接复用）
  if (spreadsheetId.value && agents.value.length === 0) {
    loadData(true);
  }
  startNowTick();
  initRosterColumns();
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  disposeTheme();
  disposePwa();
  disposeRosterColumns();
  stopNowTick();
  stopAutoRefresh();
  stopKioskTimer();
  stopFormCheck();
  disposeUndoHold();
  cancelLotteryDraw();
  clearToastTimer();
  window.removeEventListener('keydown', onGlobalKeydown);
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
    <nav class="ifs-tabbar no-select" :aria-label="t('nav.tabbarLabel')">
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
      <SettingsView v-if="currentView === 'settings'" />
      <LotteryView v-else-if="currentView === 'lottery'" />
      <OperationsView v-else />
    </main>

    <!-- 二维码弹窗：入口在全局顶栏，挂在根层级保证任意视图下都能打开 -->
    <QrCodeModal v-if="showQRCode" />

    <!-- 开奖高亮弹窗：滚动 → 逐名揭示 → 完成；结果已先行落账，随时可关 -->
    <LotteryDrawModal />

    <!-- 错误 Toast：异常的唯一界面出口，4 秒自动消失 -->
    <ErrorToast />

    <!-- 大屏展示模式：全屏覆盖，自动刷新签到进度 -->
    <KioskOverlay v-if="kioskMode" />
  </div>
</template>
