<script setup lang="ts">
// 大屏名单胶囊：名字 + 双钩状态（参考 Telegram 已读回执）。
// 未签到（state none）时两枚钩均为空心，与已签到胶囊共用同一套动态渲染。
import { computed } from 'vue';
import type { Agent } from '@/types';
import { getCheckmarkState, getCheckmarkVisual } from '@/utils/checkmarks';

const props = defineProps<{ agent: Agent }>();

// 双钩状态：胶囊按 Telegram 已读回执语言区分四种签到进度
const markState = computed(() => getCheckmarkState(props.agent.PV, props.agent.APdiff));
const visual = computed(() => getCheckmarkVisual(markState.value));
</script>

<template>
  <span class="kiosk-chip" :class="[agent.AgentFaction === 'Resistance' ? 'is-resistance' : (agent.AgentFaction === 'Enlightened' ? 'is-enlightened' : ''), { 'is-alert': markState === 'checkedOutInsufficient' }]">
    <span class="kiosk-chip-name">{{ agent.AgentName }}</span>
    <svg class="kiosk-mark" viewBox="0 0 30 14" aria-hidden="true">
      <path
        class="mark-path"
        :class="visual.first === 'solid' ? 'is-solid' : ''"
        d="M2 8.5 6.5 13 15 2.5"
      />
      <path
        class="mark-path"
        :class="[
          visual.second === 'solid' ? 'is-solid' : '',
          visual.secondAlert ? 'is-alert' : ''
        ]"
        d="M14 8.5 18.5 13 27 2.5"
      />
    </svg>
  </span>
</template>
