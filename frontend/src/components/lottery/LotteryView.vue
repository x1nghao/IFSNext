<script setup lang="ts">
// 抽奖页：中奖榜常驻首屏（窄屏在抽奖区上方、宽屏在侧边），开奖演示用全屏弹窗（见 LotteryDrawModal）。
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import AppCard from '@/components/ui/AppCard.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue';
import { randomSeed } from '@/utils/lottery';
import { useLottery } from '@/composables/useLottery';
import { useAgentData } from '@/composables/useAgentData';

const { t } = useI18n();
const {
  lotterySeed,
  lotteryCount,
  lotteryPoolMode,
  lotteryExcludeWinners,
  lotteryDrawState,
  currentSheetDraws,
  eligiblePool,
  lotteryNotEnough,
  canDraw,
  latestDraw,
  factionClass,
  formatDrawTime,
  drawLottery,
  clearLotteryHistory,
  setLotteryPoolMode,
} = useLottery();
const { agents, lastUpdateText } = useAgentData();
</script>

<template>
  <div class="px-4 py-6 sm:px-0">
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
</template>
