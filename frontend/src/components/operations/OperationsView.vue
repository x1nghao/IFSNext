<script setup lang="ts">
// 签到操作页：表单告警条 + 控制面板（搜索/排序/筛选/统计）+ 名单列表。
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import AppCard from '@/components/ui/AppCard.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue';
import AgentRow from '@/components/operations/AgentRow.vue';
import { useAppView } from '@/composables/useAppView';
import { useSettings } from '@/composables/useSettings';
import { useAgentData } from '@/composables/useAgentData';
import { useFilters } from '@/composables/useFilters';
import { useFormCheck } from '@/composables/useFormCheck';

const { t } = useI18n();
const { currentView } = useAppView();
const { spreadsheetId } = useSettings();
const { agents, loading, isRefreshing, agentStats, checkedPercent, lastUpdateText, loadData } = useAgentData();
const {
  searchQuery,
  statusFilter,
  factionFilter,
  showFilters,
  filtersActive,
  filteredAgents,
  rosterColumns,
  sortKey,
  sortOrder,
  setStatusFilter,
  setFactionFilter,
  setSort,
  clearSearch,
  clearFilters,
} = useFilters();
const { formCheckState, formWarningActive, ignoreFormCheck } = useFormCheck();

// 空态提示：按「搜索无结果 → 筛选无结果 → 未配置表格 → 常规引导」排序给出可行动文案
const emptyHint = computed(() => {
  if (agents.value.length > 0 && searchQuery.value) {
    return t('empty.noMatch', { q: searchQuery.value });
  }
  if (agents.value.length > 0 && filtersActive.value) {
    return t('empty.filtered');
  }
  // 连表格 ID 都没配置时，「点击刷新」是死胡同：刷新只会提示先去设置
  if (!spreadsheetId.value) {
    return t('empty.needSetup');
  }
  return t('empty.hint');
});
</script>

<template>
  <div class="px-4 py-6 sm:px-0">
    <!-- 签到表单异常告警：设置页检查出问题后，在签到页保持可见，一键直达设置 -->
    <div v-if="formWarningActive" class="form-warning no-select" role="alert">
      <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z"></path>
      </svg>
      <span class="flex-1">{{ t('formCheck.' + formCheckState) }}</span>
      <button class="form-warning-action" @click="ignoreFormCheck">{{ t('formCheck.ignore') }}</button>
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
              <AgentRow v-for="agent in col" :key="agent.AgentName" :agent="agent" />
            </div>
          </div>
        </div>
      </AppCard>
  </div>
</template>
