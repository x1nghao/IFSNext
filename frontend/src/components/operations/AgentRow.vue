<script setup lang="ts">
// 名单紧凑行：三区块「ID+阵营 | ΔAP+时间 | 状态+按钮」。
// 行内动作依赖核验域（含撤销长按），按钮阵营配色为本组件的展示职责。
import { useI18n } from 'vue-i18n';
import AppSpinner from '@/components/ui/AppSpinner.vue';
import type { Agent } from '@/types';
import { useVerification } from '@/composables/useVerification';
import { useSettings } from '@/composables/useSettings';
import { useAgentModifiedAt } from '@/composables/useAgentModifiedAt';

defineProps<{ agent: Agent }>();

const { t } = useI18n();
const {
  verificationLoadingMap,
  pressState,
  toggleVerification,
  beginUndoHold,
  cancelUndoHold,
  onUndoButtonClick,
} = useVerification();
const { undoHoldRequired } = useSettings();
const { getAgentModifiedTimeText } = useAgentModifiedAt();

// 行内动作按钮阵营配色：PV 达标交给徽章表达，其余按阵营着色
const getActionButtonClass = (agent: Agent) => {
  if (agent.PV === 'TRUE') return '';
  if (agent.AgentFaction === 'Resistance') return 'action-resistance';
  if (agent.AgentFaction === 'Enlightened') return 'action-enlightened';
  return 'action-primary';
};
</script>

<template>
  <div class="agent-row">
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
</template>
