<script setup lang="ts">
// 设置页：表格与后端配置、历史场次、表单体检结果、功能开关与外观语言。
import { useI18n } from 'vue-i18n';
import AppCard from '@/components/ui/AppCard.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue';
import { useSettings } from '@/composables/useSettings';
import { useSheetRecents } from '@/composables/useSheetRecents';
import { useFormCheck } from '@/composables/useFormCheck';
import { useLottery } from '@/composables/useLottery';
import { useTheme } from '@/composables/useTheme';
import { useAgentData } from '@/composables/useAgentData';

const { t, locale } = useI18n();
const {
  spreadsheetId,
  apiBaseUrl,
  checkinFormUrl,
  undoHoldRequired,
  lotteryEnabled,
} = useSettings();
const { sheetRecents, switchSheet, removeSheetRecentEntry } = useSheetRecents();
const { formCheckState, formCheckIgnorable, ignoreFormCheck } = useFormCheck();
const { setLotteryEnabled } = useLottery();
const { themeMode, setThemeMode } = useTheme();
const { autoRefreshMode, setAutoRefresh, isRefreshing } = useAgentData();

const setLocale = (lang: string) => {
  locale.value = lang;
  try { localStorage.setItem('ifsnext_lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
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
</script>

<template>
  <div class="px-4 py-6 sm:px-0">
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
            <button v-if="formCheckIgnorable" type="button" class="form-warning-action" @click="ignoreFormCheck">{{ t('formCheck.ignore') }}</button>
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
</template>
