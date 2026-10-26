import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { getCheckmarkState, getCheckmarkVisual, IFS_CHECKOUT_AP_THRESHOLD, IFS_LEAVE_AP_THRESHOLD } from './checkmarks.ts';

test('未签到返回两枚空心钩', () => {
  strictEqual(getCheckmarkState('FALSE', 50000), 'none');
  strictEqual(getCheckmarkState(undefined, undefined), 'none');
  deepStrictEqual(getCheckmarkVisual('none'), { first: 'none', second: 'none', secondAlert: false, alert: false });
});

test('已签到且 ΔAP 低于离场阈值为一实一空', () => {
  strictEqual(IFS_LEAVE_AP_THRESHOLD, 5000);
  strictEqual(getCheckmarkState('TRUE', 4999), 'checkedIn');
  strictEqual(getCheckmarkState('TRUE', '0'), 'checkedIn');
  strictEqual(getCheckmarkState('true', undefined), 'checkedIn');
  deepStrictEqual(getCheckmarkVisual('checkedIn'), { first: 'solid', second: 'none', secondAlert: false, alert: false });
});

test('达到签退阈值（10000）即为完成态', () => {
  strictEqual(IFS_CHECKOUT_AP_THRESHOLD, 10000);
  strictEqual(getCheckmarkState('TRUE', 10000), 'checkedOut');
  strictEqual(getCheckmarkState('TRUE', '10000'), 'checkedOut');
  deepStrictEqual(getCheckmarkVisual('checkedOut'), { first: 'solid', second: 'solid', secondAlert: false, alert: false });
});

test('签退区间 [5000, 10000) 为未达标警示态', () => {
  strictEqual(getCheckmarkState('TRUE', 5000), 'checkedOutInsufficient');
  strictEqual(getCheckmarkState('TRUE', 9999), 'checkedOutInsufficient');
  deepStrictEqual(getCheckmarkVisual('checkedOutInsufficient'), { first: 'solid', second: 'solid', secondAlert: true, alert: true });
});

test('非法 AP 按在场处理（一实一空）', () => {
  strictEqual(getCheckmarkState('TRUE', 'abc'), 'checkedIn');
  strictEqual(getCheckmarkState('TRUE', NaN), 'checkedIn');
});
