// 抽奖：设置页开关开启，按表格分别保存记录，种子驱动可复现抽取。
// 开奖演示状态收敛为单个对象（null = 弹窗关闭）；中奖结果以历史记录为唯一数据源，
// 落账先于动画——弹窗只是演示，中途关闭不影响结果与中奖榜。
import { ref, computed } from 'vue';
import type { LotteryDrawRecord } from '@/types';
import { drawWinners, randomSeed } from '@/utils/lottery';
import { i18n } from '@/i18n';
import { useSettings } from './useSettings';
import { useToast } from './useToast';
import { useAgentData } from './useAgentData';
import { useAppView } from './useAppView';

const { t } = i18n.global;
const { addError } = useToast();
const { spreadsheetId, lotteryEnabled } = useSettings();
const { agents, factionClass } = useAgentData();
const { currentView } = useAppView();

const LOTTERY_HISTORY_STORAGE_KEY = 'ifsnext_lottery_history';
const lotterySeed = ref('');
const lotteryCount = ref<number | string>(1);
const lotteryPoolMode = ref<'checked' | 'all'>('checked');
const lotteryExcludeWinners = ref(true);

interface LotteryDrawState {
  phase: 'rolling' | 'revealed';
  winners: string[];
  revealed: number;
  currentName: string;
  seed: string;
  poolSize: number;
}
const lotteryDrawState = ref<LotteryDrawState | null>(null);
const lotteryHistory = ref<Record<string, LotteryDrawRecord[]>>({});
let lotteryRunSeq = 0;

const loadLotteryHistory = () => {
  try {
    const raw = localStorage.getItem(LOTTERY_HISTORY_STORAGE_KEY);
    lotteryHistory.value = raw ? JSON.parse(raw) : {};
  } catch (e) {
    lotteryHistory.value = {};
  }
};

const persistLotteryHistory = () => {
  try {
    localStorage.setItem(LOTTERY_HISTORY_STORAGE_KEY, JSON.stringify(lotteryHistory.value));
  } catch (e) {}
};

// 抽奖参与池以名单加载顺序（表格行序）为准，与界面排序/筛选无关，保证可复现
const lotteryPool = computed<string[]>(() => {
  const base = lotteryPoolMode.value === 'checked' ? agents.value.filter(a => a.PV === 'TRUE') : agents.value;
  return base.map(a => a.AgentName);
});

const currentSheetDraws = computed<LotteryDrawRecord[]>(() =>
  spreadsheetId.value ? lotteryHistory.value[spreadsheetId.value] || [] : []
);

const previousWinners = computed<Set<string>>(() => new Set(currentSheetDraws.value.flatMap(e => e.winners)));

const eligiblePool = computed<string[]>(() =>
  lotteryExcludeWinners.value ? lotteryPool.value.filter(name => !previousWinners.value.has(name)) : lotteryPool.value
);

const lotteryCountNumber = computed(() => {
  const n = Math.floor(Number(lotteryCount.value));
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const lotteryNotEnough = computed(() =>
  eligiblePool.value.length > 0 && lotteryCountNumber.value > eligiblePool.value.length
);

const canDraw = computed(() =>
  agents.value.length > 0 && eligiblePool.value.length > 0 && lotteryCountNumber.value > 0
);

const formatDrawTime = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  } catch (e) {
    return new Date(timestamp).toLocaleTimeString();
  }
};

// 常驻中奖榜展示最新一轮记录；历史记录是中奖结果的唯一数据源
const latestDraw = computed<LotteryDrawRecord | undefined>(() => currentSheetDraws.value[0]);

// 全部中奖者揭示完毕，才允许「完成」关闭弹窗（点 ✕ 可随时中止演示）
const lotteryDrawingFinished = computed(() => {
  const state = lotteryDrawState.value;
  return !!state && state.phase === 'revealed' && state.revealed >= state.winners.length;
});

const closeLotteryModal = () => {
  lotteryRunSeq++;
  lotteryDrawState.value = null;
};

const drawLottery = async () => {
  if (lotteryDrawState.value || !canDraw.value) return;
  const pool = eligiblePool.value;
  const count = lotteryCountNumber.value;
  const seed = lotterySeed.value.trim() || randomSeed();
  lotterySeed.value = seed;
  const winners = drawWinners(pool, count, seed);
  if (!winners.length) {
    addError(t('lottery.emptyPool'));
    return;
  }

  // 结果先落账（数据先行），中奖榜与历史立即可见；随后的弹窗只是开奖演示
  const entry: LotteryDrawRecord = { at: Date.now(), seed, count, poolSize: pool.length, winners };
  const sid = spreadsheetId.value || 'default';
  lotteryHistory.value = { ...lotteryHistory.value, [sid]: [entry, ...(lotteryHistory.value[sid] || [])] };
  persistLotteryHistory();

  const seq = ++lotteryRunSeq;
  lotteryDrawState.value = {
    phase: 'rolling',
    winners,
    revealed: 0,
    currentName: pool[0] || winners[0] || '',
    seed,
    poolSize: pool.length,
  };

  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    if (!winner) continue;
    // 每名中奖者：约 0.9 秒滚动 → 揭示 → 停留 0.55 秒；结果由种子确定性给出，动画只为观感
    const rollStart = performance.now();
    await new Promise<void>(resolve => {
      const step = () => {
        if (seq !== lotteryRunSeq) { resolve(); return; }
        if (performance.now() - rollStart >= 900) { resolve(); return; }
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        if (candidate && lotteryDrawState.value) lotteryDrawState.value.currentName = candidate;
        setTimeout(step, 70);
      };
      step();
    });
    if (seq !== lotteryRunSeq) return;
    if (lotteryDrawState.value) {
      lotteryDrawState.value.phase = 'revealed';
      lotteryDrawState.value.revealed = i + 1;
      lotteryDrawState.value.currentName = winner;
    }
    await new Promise(r => setTimeout(r, 550));
    if (seq !== lotteryRunSeq) return;
  }
};

const clearLotteryHistory = () => {
  if (!spreadsheetId.value) return;
  lotteryHistory.value = { ...lotteryHistory.value, [spreadsheetId.value]: [] };
  persistLotteryHistory();
};

const setLotteryPoolMode = (v: string) => { lotteryPoolMode.value = v as 'checked' | 'all'; };

const setLotteryEnabled = (val: string) => {
  lotteryEnabled.value = val === 'on';
  if (!lotteryEnabled.value) {
    // 关闭抽奖时若正在开奖演示，一并中止并离开抽奖页
    closeLotteryModal();
    if (currentView.value === 'lottery') currentView.value = 'operations';
  }
};

// 应用卸载时中断进行中的抽奖演示（与原清理行为一致）
const cancelLotteryDraw = () => {
  lotteryRunSeq++;
  lotteryDrawState.value = null;
};

export function useLottery() {
  return {
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
    lotteryDrawingFinished,
    factionClass,
    formatDrawTime,
    loadLotteryHistory,
    drawLottery,
    closeLotteryModal,
    clearLotteryHistory,
    setLotteryPoolMode,
    setLotteryEnabled,
    cancelLotteryDraw,
  };
}
