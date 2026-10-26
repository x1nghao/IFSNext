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
