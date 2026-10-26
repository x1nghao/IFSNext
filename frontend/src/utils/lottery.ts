// 可复现抽奖：种子字符串 → 32 位哈希 → mulberry32 确定性 PRNG → 部分 Fisher–Yates 抽取。
// 相同的（名单顺序、种子、排除名单）组合必然得到相同中奖者序列。

// FNV-1a 32 位哈希：把任意字符串种子映射为 32 位无符号整数
export const hashSeed = (seed: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// mulberry32：小型确定性伪随机数生成器，输出 [0, 1)
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// 从名单中确定性抽取 count 名，返回按抽取次序排列的中奖者；
// exclude 中的名字不参与（用于剔除往轮已中奖者）；不足时返回全部符合条件者
export const drawWinners = (pool: string[], count: number, seed: string, exclude: string[] = []): string[] => {
  const excludeSet = new Set(exclude);
  const eligible = pool.filter(name => !excludeSet.has(name));
  if (count <= 0 || eligible.length === 0) return [];
  const n = Math.min(count, eligible.length);
  const rand = mulberry32(hashSeed(seed));
  const arr = eligible.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    const picked = arr[j];
    const current = arr[i];
    if (picked === undefined || current === undefined) continue;
    arr[j] = current;
    arr[i] = picked;
  }
  return arr.slice(0, n);
};

// 生成 16 位十六进制随机种子（用于默认随机化，不要求可预测）
export const randomSeed = (): string => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};
