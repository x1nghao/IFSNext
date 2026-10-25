export type RelativeTimeResult =
  | { kind: 'seconds'; n: number }
  | { kind: 'minutes'; n: number }
  | { kind: 'clock'; text: string };

// 把时间戳转为相对时间：1 小时内用秒/分钟表述，更早则回退到本地时刻
export const formatRelativeTime = (timestamp: number, now: number): RelativeTimeResult => {
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 60) {
    return { kind: 'seconds', n: diffSeconds };
  }
  if (diffSeconds < 3600) {
    return { kind: 'minutes', n: Math.floor(diffSeconds / 60) };
  }
  return { kind: 'clock', text: new Date(timestamp).toLocaleTimeString() };
};
