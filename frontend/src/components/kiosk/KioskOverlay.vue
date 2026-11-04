<script setup lang="ts">
// 大屏展示模式：全屏覆盖，自动刷新签到进度。
// 数据轮询的开关在 useKiosk；本组件只负责大屏的呈现逻辑——
// 二维码渲染、名单溢出测量（无缝滚动启用）与面板空间分配。
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import KioskChip from '@/components/kiosk/KioskChip.vue';
import { shuffleAgentsByNames, computeMarqueeDuration } from '@/utils/kiosk';
import { renderQrCode } from '@/utils/qrcode';
import { useAgentData } from '@/composables/useAgentData';
import { useSettings } from '@/composables/useSettings';
import { useToast } from '@/composables/useToast';
import { useKiosk } from '@/composables/useKiosk';

const { t } = useI18n();
const { addError } = useToast();
const { agents, agentStats, checkedPercent, apTotalSum, lastUpdateText } = useAgentData();
const { safeCheckinFormUrl } = useSettings();
const { kioskMode } = useKiosk();

// 名单确定性洗牌：状态组不按表格行序扎堆；洗牌键稳定（名字不变则顺序不变），
// 10 秒自动刷新不会引起胶囊跳动
const kioskChecked = computed(() => shuffleAgentsByNames(agents.value.filter(a => a.PV === 'TRUE')));
const kioskUnchecked = computed(() => shuffleAgentsByNames(agents.value.filter(a => a.PV !== 'TRUE')));

// 面板空间按人数平方根比例分配：人少的一边自动让位给人多的一边。
// 少于 minRows 人的面板保底两行高度（保底由 CSS minmax 完成，这里只算 flex 数值）。
const KIOSK_MIN_ROWS = 2;
const kioskPanelBasis = computed(() => {
  const u = kioskUnchecked.value.length;
  const c = kioskChecked.value.length;
  if (!u || !c) return { unchecked: 1, checked: 1 }; // 单面板时由 :only-of-type 规则接管
  const ru = Math.max(KIOSK_MIN_ROWS, Math.sqrt(u));
  const rc = Math.max(KIOSK_MIN_ROWS, Math.sqrt(c));
  return { unchecked: ru, checked: rc };
});
const kioskPanelStyle = computed(() => ({
  '--rows-unchecked': String(kioskPanelBasis.value.unchecked),
  '--rows-checked': String(kioskPanelBasis.value.checked),
}));

const marqueeStyle = (count: number) => ({ '--marquee-duration': `${computeMarqueeDuration(count)}s` });

// ── 大屏二维码：高分辨率画布渲染，尺寸交给 CSS 按视口伸缩 ──
const kioskQrCanvas = ref<HTMLCanvasElement | null>(null);
let kioskQrSeq = 0;
const generateKioskQR = async () => {
  const seq = ++kioskQrSeq;
  const canvas = kioskQrCanvas.value;
  if (!canvas || !safeCheckinFormUrl.value) return;
  try {
    await renderQrCode(canvas, safeCheckinFormUrl.value, { width: 480, margin: 2, clearInlineSize: true });
    if (seq !== kioskQrSeq) return; // 渲染期间又有新调用：本次作废
  } catch (err: any) {
    if (seq === kioskQrSeq) addError(t('error.qrFailed', { message: err.message }));
  }
};

// ── 名单是否溢出面板要渲染后才知道：逐面板测一次自然高，溢出才启用无缝滚动。
// 滚动需要"双拷贝"实现无缝循环；静止时不渲染第二份拷贝，避免少人数面板出现重复名单。
// 人数不足以填满面板时整体向上对齐、行距恒定、留白沉底；这里只读不写样式，测量与布局彻底解耦。──
const marqueeScrolling = ref({ unchecked: false, checked: false });
const updateKioskMarquees = async () => {
  await nextTick();
  const next = { unchecked: false, checked: false };
  document.querySelectorAll<HTMLElement>('.kiosk-marquee').forEach((box) => {
    const track = box.querySelector<HTMLElement>('.kiosk-marquee-track');
    if (!track) return;
    const key = box.closest('.kiosk-panel-unchecked') ? 'unchecked' : 'checked';
    const chips = track.querySelector<HTMLElement>('.kiosk-chips');
    if (!chips) return;
    next[key] = chips.scrollHeight > box.clientHeight + 1;
    box.classList.toggle('is-scrolling', next[key]);
  });
  marqueeScrolling.value = next;
};

const handleKioskResize = () => {
  updateKioskMarquees();
};

// 表单链接变化或名单刷新后，保持二维码与跑马灯状态正确
watch(safeCheckinFormUrl, () => nextTick(generateKioskQR));
watch(agents, () => updateKioskMarquees());

// 挂载即等首帧布局完成：渲染二维码 + 测量名单溢出
onMounted(() => {
  window.addEventListener('resize', handleKioskResize);
  nextTick(() => {
    generateKioskQR();
    updateKioskMarquees();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', handleKioskResize);
});
</script>

<template>
  <div class="kiosk-overlay no-select" role="dialog" aria-modal="true" :aria-label="t('kiosk.title')">
    <div class="kiosk-top">
      <div class="kiosk-title">IFS · {{ t('kiosk.title') }}</div>
      <button class="ifs-iconbtn" :title="t('kiosk.exit')" :aria-label="t('kiosk.exit')" @click="kioskMode = false">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <div class="kiosk-body" :style="kioskPanelStyle">
      <!-- 左列（窄屏时为顶部区块）：签到统计 + 签到二维码 -->
      <div class="kiosk-left">
        <section class="kiosk-stats" :aria-label="t('stats.checkedIn')">
          <div class="kiosk-big-num tabular-nums" :key="agentStats.checkedIn">{{ agentStats.checkedIn }}</div>
          <div class="kiosk-sub tabular-nums">
            {{ t('stats.checkedIn') }} / {{ t('stats.total') }} {{ agentStats.total }} · {{ checkedPercent }}%
          </div>
          <div class="kiosk-progress">
            <div class="kiosk-progress-fill" :style="{ width: checkedPercent + '%' }"></div>
          </div>

          <div v-if="agentStats.resistance || agentStats.enlightened" class="kiosk-factions">
            <div v-if="agentStats.resistance" class="kiosk-faction">
              <div class="kiosk-faction-head">
                <span>{{ t('stats.resistance') }}</span>
                <span class="tabular-nums">{{ agentStats.resistanceCheckedIn }}/{{ agentStats.resistance }}</span>
              </div>
              <div class="kiosk-faction-bar">
                <div class="is-resistance" :style="{ width: (agentStats.resistanceCheckedIn / agentStats.resistance * 100) + '%' }"></div>
              </div>
            </div>
            <div v-if="agentStats.enlightened" class="kiosk-faction">
              <div class="kiosk-faction-head">
                <span>{{ t('stats.enlightened') }}</span>
                <span class="tabular-nums">{{ agentStats.enlightenedCheckedIn }}/{{ agentStats.enlightened }}</span>
              </div>
              <div class="kiosk-faction-bar">
                <div class="is-enlightened" :style="{ width: (agentStats.enlightenedCheckedIn / agentStats.enlightened * 100) + '%' }"></div>
              </div>
            </div>
          </div>

          <div v-if="apTotalSum" class="kiosk-ap tabular-nums">AP +{{ apTotalSum.toLocaleString() }}</div>
        </section>

        <section class="kiosk-qr" :aria-label="t('kiosk.qrLabel')">
          <div v-if="safeCheckinFormUrl" class="kiosk-qr-panel">
            <canvas ref="kioskQrCanvas"></canvas>
          </div>
          <p class="kiosk-qr-caption" :class="{ 'is-missing': !safeCheckinFormUrl }">
            {{ safeCheckinFormUrl ? t('kiosk.scanToCheckIn') : t('kiosk.qrMissing') }}
          </p>
        </section>
      </div>

      <!-- 未签到名单：全部签完时整块隐藏，空间让给已签到面板 -->
      <section v-if="kioskUnchecked.length" class="kiosk-panel kiosk-panel-unchecked" :aria-label="t('status.notCheckedIn')">
        <header class="kiosk-panel-head">
          <span>{{ t('status.notCheckedIn') }}</span>
          <span class="kiosk-panel-count tabular-nums">{{ kioskUnchecked.length }}</span>
        </header>
        <div class="kiosk-marquee">
          <div class="kiosk-marquee-track" :style="marqueeStyle(kioskUnchecked.length)">
            <div class="kiosk-chips">
              <KioskChip v-for="agent in kioskUnchecked" :key="agent.AgentName" :agent="agent" />
            </div>
            <div v-if="marqueeScrolling.unchecked" class="kiosk-chips" aria-hidden="true">
              <KioskChip v-for="agent in kioskUnchecked" :key="'dup-' + agent.AgentName" :agent="agent" />
            </div>
          </div>
        </div>
      </section>

      <!-- 已签到名单（滚动展示）：还没有人签到时整块隐藏，空间让给未签到面板 -->
      <section v-if="kioskChecked.length" class="kiosk-panel kiosk-panel-checked" :aria-label="t('status.checkedIn')">
        <header class="kiosk-panel-head">
          <span>{{ t('status.checkedIn') }}</span>
          <span class="kiosk-panel-count tabular-nums">{{ kioskChecked.length }}</span>
        </header>
        <div class="kiosk-marquee">
          <div class="kiosk-marquee-track" :style="marqueeStyle(kioskChecked.length)">
            <div class="kiosk-chips">
              <KioskChip v-for="agent in kioskChecked" :key="agent.AgentName" :agent="agent" />
            </div>
            <div v-if="marqueeScrolling.checked" class="kiosk-chips" aria-hidden="true">
              <KioskChip v-for="agent in kioskChecked" :key="'dup-' + agent.AgentName" :agent="agent" />
            </div>
          </div>
        </div>
      </section>

      <!-- 全空态：名单为空（未加载或被清空）时兜底提示 -->
      <div v-if="!kioskUnchecked.length && !kioskChecked.length" class="kiosk-panel kiosk-panel-empty-all">
        <p class="kiosk-panel-empty">{{ t('kiosk.rosterMissing') }}</p>
      </div>
    </div>

    <!-- 双钩图例：四种状态一眼可查 -->
    <div class="kiosk-legend no-select" aria-hidden="true">
      <span class="kiosk-legend-item">
        <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path" d="M14 8.5 18.5 13 27 2.5" /></svg>
        {{ t('kiosk.legendNone') }}
      </span>
      <span class="kiosk-legend-item">
        <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path is-solid" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path" d="M14 8.5 18.5 13 27 2.5" /></svg>
        {{ t('kiosk.legendIn') }}
      </span>
      <span class="kiosk-legend-item">
        <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path is-solid" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path is-solid" d="M14 8.5 18.5 13 27 2.5" /></svg>
        {{ t('kiosk.legendOut') }}
      </span>
      <span class="kiosk-legend-item is-alert-demo">
        <svg class="kiosk-mark" viewBox="0 0 30 14"><path class="mark-path is-solid" d="M2 8.5 6.5 13 15 2.5" /><path class="mark-path is-solid is-alert" d="M14 8.5 18.5 13 27 2.5" /></svg>
        <span class="kiosk-chip-name">{{ t('kiosk.legendAlert') }}</span>
      </span>
    </div>

    <div class="kiosk-foot">
      <span v-if="lastUpdateText">{{ lastUpdateText }}</span>
      <span>IFSNext</span>
    </div>
  </div>
</template>
