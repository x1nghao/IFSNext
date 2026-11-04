<script setup lang="ts">
// 开奖高亮弹窗：滚动 → 逐名揭示 → 完成；结果已先行落账，随时可关。
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import { useLottery } from '@/composables/useLottery';

const { t } = useI18n();
const {
  lotteryDrawState,
  lotteryDrawingFinished,
  factionClass,
  closeLotteryModal,
} = useLottery();
</script>

<template>
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
</template>
