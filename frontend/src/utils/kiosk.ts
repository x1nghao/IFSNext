// 大屏展示的纯排版逻辑：跑马灯时长与名单确定性洗牌。
// 洗牌键稳定（名字不变则顺序不变），10 秒自动刷新不会引起胶囊跳动。
import { hashSeed, mulberry32 } from './lottery.ts';
import type { Agent } from '../types';

// 大屏跑马灯滚动一轮的时长：随条目数线性增长——名单越长转一圈越久，
// 让不同规模名单的视觉滚动速度大致接近；空名单回落到最小值。
export const computeMarqueeDuration = (
  count: number,
  perItemSeconds = 1,
  minSeconds = 20,
  maxSeconds = 240
): number => {
  if (!Number.isFinite(count) || count <= 0) return minSeconds;
  return Math.min(maxSeconds, Math.max(minSeconds, Math.round(count * perItemSeconds)));
};

// 大屏名单确定性洗牌：以名字为键伪随机重排，状态组不按表格行序扎堆。
// 纯函数返回新数组，不修改入参。
export const shuffleAgentsByNames = (list: Agent[]): Agent[] => {
  const arr = list.slice();
  const rand = mulberry32(hashSeed(arr.map(a => a.AgentName).join('|')));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = arr[i];
    const b = arr[j];
    if (a && b) {
      arr[i] = b;
      arr[j] = a;
    }
  }
  return arr;
};
