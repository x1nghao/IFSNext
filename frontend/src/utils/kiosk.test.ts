import { test } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { computeMarqueeDuration } from './kiosk.ts';

test('computeMarqueeDuration 随条目数线性增长', () => {
  strictEqual(computeMarqueeDuration(40), 40);
  strictEqual(computeMarqueeDuration(100), 100);
});

test('computeMarqueeDuration 低于下限时取最小值', () => {
  strictEqual(computeMarqueeDuration(0), 20);
  strictEqual(computeMarqueeDuration(5), 20);
});

test('computeMarqueeDuration 超过上限时取最大值', () => {
  strictEqual(computeMarqueeDuration(500), 240);
});

test('computeMarqueeDuration 非法输入回落到最小值', () => {
  strictEqual(computeMarqueeDuration(NaN), 20);
  strictEqual(computeMarqueeDuration(-3), 20);
});

test('computeMarqueeDuration 支持自定义参数', () => {
  strictEqual(computeMarqueeDuration(10, 2, 5, 100), 20);
  strictEqual(computeMarqueeDuration(60, 2, 5, 100), 100);
  strictEqual(computeMarqueeDuration(2, 2, 5, 100), 5); // 4 低于下限，取 5
  strictEqual(computeMarqueeDuration(3, 2, 5, 100), 6);
});
