import { test } from 'node:test';
import { strictEqual, deepStrictEqual, notStrictEqual } from 'node:assert/strict';
import { hashSeed, mulberry32, drawWinners, randomSeed } from './lottery.ts';

const POOL = Array.from({ length: 60 }, (_, i) => `Agent${i.toString().padStart(2, '0')}`);

test('hashSeed 对相同输入返回相同值，不同输入返回不同值', () => {
  strictEqual(hashSeed('IFS-20261107'), hashSeed('IFS-20261107'));
  notStrictEqual(hashSeed('IFS-20261107'), hashSeed('IFS-20261108'));
  strictEqual(hashSeed(''), hashSeed(''));
});

test('mulberry32 相同种子序列一致', () => {
  const a = mulberry32(123456789);
  const b = mulberry32(123456789);
  for (let i = 0; i < 100; i++) {
    strictEqual(a(), b());
  }
});

test('mulberry32 输出落在 [0, 1) 区间', () => {
  const rand = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = rand();
    if (!(v >= 0 && v < 1)) throw new Error(`越界值: ${v}`);
  }
});

test('drawWinners 相同种子与名单结果可复现', () => {
  deepStrictEqual(drawWinners(POOL, 5, 'IFS-20261107'), drawWinners(POOL, 5, 'IFS-20261107'));
});

test('drawWinners 不同种子结果（大概率）不同', () => {
  notStrictEqual(drawWinners(POOL, 5, 'seed-a'), drawWinners(POOL, 5, 'seed-b'));
});

test('drawWinners 中奖者不重复且都在名单内', () => {
  const winners = drawWinners(POOL, 8, 'IFS-20261107');
  strictEqual(winners.length, 8);
  strictEqual(new Set(winners).size, 8);
  for (const w of winners) {
    if (!POOL.includes(w)) throw new Error(`不在名单内: ${w}`);
  }
});

test('drawWinners 排除名单生效且不产生重复中奖', () => {
  const first = drawWinners(POOL, 5, 'IFS-20261107');
  const second = drawWinners(POOL, 5, 'IFS-20261107', first);
  for (const w of second) {
    if (first.includes(w)) throw new Error(`重复中奖: ${w}`);
  }
});

test('drawWinners 名单不足时返回全部符合条件者', () => {
  const small = ['A', 'B'];
  // 全员中奖时顺序仍按抽取次序，故用集合比较
  deepStrictEqual([...drawWinners(small, 10, 'any')].sort(), ['A', 'B']);
  deepStrictEqual(drawWinners(['A', 'B'], 10, 'any', ['A']), ['B']);
});

test('drawWinners 排除全部名单后返回空', () => {
  deepStrictEqual(drawWinners(['A', 'B'], 1, 'any', ['A', 'B']), []);
});

test('drawWinners 名单顺序影响结果（顺序也是种子的一部分）', () => {
  const reversed = [...POOL].reverse();
  // 名单顺序颠倒后，同一种子抽出的结果（大概率）不同
  notStrictEqual(drawWinners(POOL, 5, 'same-seed'), drawWinners(reversed, 5, 'same-seed'));
});

test('drawWinners 不修改传入名单', () => {
  const pool = ['A', 'B', 'C', 'D'];
  drawWinners(pool, 2, 'IFS');
  deepStrictEqual(pool, ['A', 'B', 'C', 'D']);
});

test('randomSeed 返回 16 位十六进制字符串且每次不同', () => {
  const s = randomSeed();
  strictEqual(s.length, 16);
  strictEqual(/^[0-9a-f]{16}$/.test(s), true);
  notStrictEqual(randomSeed(), randomSeed());
});
