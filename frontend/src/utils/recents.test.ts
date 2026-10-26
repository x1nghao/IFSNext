import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { upsertSheetRecent, removeSheetRecent } from './recents.ts';
import type { SheetRecent } from './recents.ts';

const make = (id: string, lastUsed: number): SheetRecent => ({ id, lastUsed });

test('upsertSheetRecent 新增时插入队首', () => {
  const list = [make('a', 1), make('b', 2)];
  deepStrictEqual(upsertSheetRecent(list, 'c', 3), [make('c', 3), make('a', 1), make('b', 2)]);
});

test('upsertSheetRecent 已存在则置顶并更新时间', () => {
  const list = [make('a', 1), make('b', 2)];
  deepStrictEqual(upsertSheetRecent(list, 'b', 9), [make('b', 9), make('a', 1)]);
});

test('upsertSheetRecent 超出容量裁掉最旧的', () => {
  const list = [make('c', 3), make('b', 2), make('a', 1)]; // 按最近使用降序
  deepStrictEqual(upsertSheetRecent(list, 'd', 4, 3), [make('d', 4), make('c', 3), make('b', 2)]);
});

test('upsertSheetRecent 空 id 不处理', () => {
  const list = [make('a', 1)];
  deepStrictEqual(upsertSheetRecent(list, '', 2), list);
});

test('removeSheetRecent 按 id 移除', () => {
  const list = [make('a', 1), make('b', 2)];
  deepStrictEqual(removeSheetRecent(list, 'a'), [make('b', 2)]);
  strictEqual(removeSheetRecent(list, 'zzz').length, 2);
});
