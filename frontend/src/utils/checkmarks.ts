// 大屏双钩状态（参考 Telegram 已读回执的双钩语言）：
// - 未签到：两枚空心钩
// - 已签到、尚未离场（ΔAP < 5000）：一实一空
// - 已签退且 ΔAP ≥ 10000（完成全部活动目标）：双实心（第二枚完成绿）
// - 已签退但 ΔAP < 10000（5000 ≤ ΔAP）：红名 + 黄框，灰实心钩 + 红实心钩（警示未达标离场）
//
// 名单没有独立「签退」列，用 ΔAP 区间近似签退阶段：≥10000 完成；[5000, 10000) 视为
// 打了相当 AP 后离场（未达标）；<5000 视为还在场内。现场可按惯例调整两个阈值。
export const IFS_CHECKOUT_AP_THRESHOLD = 10000;
export const IFS_LEAVE_AP_THRESHOLD = 5000;

export type CheckmarkState = 'none' | 'checkedIn' | 'checkedOut' | 'checkedOutInsufficient';

export interface CheckmarkVisual {
  // 两枚钩的呈现：'none' 空心 / 'solid' 实心（颜色由 CSS 类决定）
  first: 'none' | 'solid';
  second: 'none' | 'solid';
  // second 钩是否为红色（仅未达标签退时 true；达标签退为完成绿）
  secondAlert: boolean;
  // 名字标红 + 黄色边框
  alert: boolean;
}

export const getCheckmarkState = (pv: string | undefined, apDiff: number | string | undefined): CheckmarkState => {
  if (String(pv).toUpperCase() !== 'TRUE') return 'none';
  const ap = Number(apDiff);
  if (!Number.isFinite(ap)) return 'checkedIn';
  if (ap >= IFS_CHECKOUT_AP_THRESHOLD) return 'checkedOut';
  if (ap >= IFS_LEAVE_AP_THRESHOLD) return 'checkedOutInsufficient';
  return 'checkedIn';
};

export const getCheckmarkVisual = (state: CheckmarkState): CheckmarkVisual => {
  switch (state) {
    case 'none':
      // 未签到：两枚空心钩
      return { first: 'none', second: 'none', secondAlert: false, alert: false };
    case 'checkedIn':
      // 已签到未签退：一枚实心 + 一枚空心
      return { first: 'solid', second: 'none', secondAlert: false, alert: false };
    case 'checkedOut':
      // 已签退且达标：双实心（完成绿）
      return { first: 'solid', second: 'solid', secondAlert: false, alert: false };
    case 'checkedOutInsufficient':
      // 已签退未达标：灰实心 + 红实心，红名黄框警示
      return { first: 'solid', second: 'solid', secondAlert: true, alert: true };
  }
};
