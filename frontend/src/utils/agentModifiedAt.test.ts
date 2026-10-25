import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { parseAgentModifiedAt, addAgentModifiedTime, removeAgentModifiedTime } from './agentModifiedAt.ts';

test('parseAgentModifiedAt 空输入返回 null（保留现有状态）', () => {
  strictEqual(parseAgentModifiedAt(null, 'sheet1'), null);
  strictEqual(parseAgentModifiedAt('', 'sheet1'), null);
});

test('parseAgentModifiedAt 非法 JSON 返回 null', () => {
  strictEqual(parseAgentModifiedAt('{not json', 'sheet1'), null);
});

test('parseAgentModifiedAt 非对象 JSON 返回 null', () => {
  strictEqual(parseAgentModifiedAt('"text"', 'sheet1'), null);
  strictEqual(parseAgentModifiedAt('5', 'sheet1'), null);
  strictEqual(parseAgentModifiedAt('null', 'sheet1'), null);
});

test('parseAgentModifiedAt 空对象返回空映射', () => {
  const result = parseAgentModifiedAt('{}', 'sheet1');
  deepStrictEqual(result, { map: {}, migrated: false });
});

test('parseAgentModifiedAt 旧版扁平结构迁移到当前表格 ID 下', () => {
  const raw = JSON.stringify({ Alpha: 1700000000000, Beta: 1700000001000 });
  const result = parseAgentModifiedAt(raw, 'sheet1');
  deepStrictEqual(result, {
    map: { sheet1: { Alpha: 1700000000000, Beta: 1700000001000 } },
    migrated: true,
  });
});

test('parseAgentModifiedAt 旧版扁平结构使用空表格 ID 兜底', () => {
  const raw = JSON.stringify({ Alpha: 1700000000000 });
  const result = parseAgentModifiedAt(raw, '');
  deepStrictEqual(result, { map: { '': { Alpha: 1700000000000 } }, migrated: true });
});

test('parseAgentModifiedAt 旧版扁平结构判定要求全部值为有限数字', () => {
  // 1e999 序列化后解析为 Infinity，非有限值 → 不按旧版结构处理
  const result = parseAgentModifiedAt('{"Alpha": 1e999}', 'sheet1');
  deepStrictEqual(result, { map: {}, migrated: false });
});

test('parseAgentModifiedAt 新版嵌套结构原样清洗保留', () => {
  const raw = JSON.stringify({
    sheet1: { Alpha: 1700000000000, Bad: 'no', Gone: Infinity },
    sheet2: { Beta: 1700000001000 },
  });
  const result = parseAgentModifiedAt(raw, 'sheet1');
  deepStrictEqual(result, {
    map: {
      sheet1: { Alpha: 1700000000000 },
      sheet2: { Beta: 1700000001000 },
    },
    migrated: false,
  });
});

test('parseAgentModifiedAt 丢弃空表格 ID 与无效条目', () => {
  const raw = JSON.stringify({
    '': { Alpha: 1700000000000 },
    sheet1: 'not-an-object',
    sheet3: {},
    sheet4: { Valid: 1 },
  });
  const result = parseAgentModifiedAt(raw, 'sheet1');
  deepStrictEqual(result, { map: { sheet4: { Valid: 1 } }, migrated: false });
});

test('addAgentModifiedTime 新增与覆盖均生成新对象', () => {
  const original = { sheet1: { Alpha: 1 } };
  const added = addAgentModifiedTime(original, 'sheet1', 'Beta', 2);
  deepStrictEqual(added, { sheet1: { Alpha: 1, Beta: 2 } });
  deepStrictEqual(original, { sheet1: { Alpha: 1 } });

  const updated = addAgentModifiedTime(added, 'sheet1', 'Alpha', 9);
  deepStrictEqual(updated, { sheet1: { Alpha: 9, Beta: 2 } });
});

test('addAgentModifiedTime 为未知表格创建分组', () => {
  const added = addAgentModifiedTime({}, 'sheet2', 'Gamma', 3);
  deepStrictEqual(added, { sheet2: { Gamma: 3 } });
});

test('removeAgentModifiedTime 删除条目并清理空分组', () => {
  const map = { sheet1: { Alpha: 1, Beta: 2 }, sheet2: { Gamma: 3 } };
  const removed = removeAgentModifiedTime(map, 'sheet1', 'Alpha');
  deepStrictEqual(removed, { sheet1: { Beta: 2 }, sheet2: { Gamma: 3 } });

  const pruned = removeAgentModifiedTime(removed, 'sheet1', 'Beta');
  deepStrictEqual(pruned, { sheet2: { Gamma: 3 } });
  deepStrictEqual(map, { sheet1: { Alpha: 1, Beta: 2 }, sheet2: { Gamma: 3 } });
});

test('removeAgentModifiedTime 条目不存在时返回原对象', () => {
  const map = { sheet1: { Alpha: 1 } };
  strictEqual(removeAgentModifiedTime(map, 'sheet1', 'Ghost'), map);
  strictEqual(removeAgentModifiedTime(map, 'sheetX', 'Alpha'), map);
});
