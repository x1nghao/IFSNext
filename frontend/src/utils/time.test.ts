import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { formatRelativeTime } from './time.ts';

const NOW = 1700000000000;

test('60 秒内按秒表述', () => {
  deepStrictEqual(formatRelativeTime(NOW - 0, NOW), { kind: 'seconds', n: 0 });
  deepStrictEqual(formatRelativeTime(NOW - 59_000, NOW), { kind: 'seconds', n: 59 });
});

test('1 小时内按分钟表述', () => {
  deepStrictEqual(formatRelativeTime(NOW - 60_000, NOW), { kind: 'minutes', n: 1 });
  deepStrictEqual(formatRelativeTime(NOW - 3_599_000, NOW), { kind: 'minutes', n: 59 });
});

test('更早则回退到本地时刻', () => {
  const result = formatRelativeTime(NOW - 3_600_000, NOW);
  deepStrictEqual(result.kind, 'clock');
});

test('未来时间戳按 0 秒处理（时钟偏差兜底）', () => {
  deepStrictEqual(formatRelativeTime(NOW + 5_000, NOW), { kind: 'seconds', n: 0 });
});
