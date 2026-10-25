import { test } from 'node:test';
import { strictEqual, deepStrictEqual, notStrictEqual } from 'node:assert/strict';
import { extractSpreadsheetId, filterAgents, sortAgents, getSortValue, computeAgentStats } from './agents.ts';
import type { Agent } from '../types';

const makeAgent = (overrides: Partial<Agent>): Agent => ({
  AgentName: 'X',
  AgentFaction: 'Resistance',
  APdiff: 0,
  PV: 'FALSE',
  ...overrides,
});

test('extractSpreadsheetId 从链接中提取表格 ID', () => {
  strictEqual(
    extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  strictEqual(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/abc-123_456'), 'abc-123_456');
});

test('extractSpreadsheetId 对非链接输入返回 null', () => {
  strictEqual(extractSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), null);
  strictEqual(extractSpreadsheetId(''), null);
  strictEqual(extractSpreadsheetId('https://example.com/other/path'), null);
});

test('filterAgents 空条件返回全部', () => {
  const agents = [makeAgent({ AgentName: 'Alpha' }), makeAgent({ AgentName: 'Beta' })];
  deepStrictEqual(filterAgents(agents, ''), agents);
});

test('filterAgents 大小写不敏感匹配', () => {
  const agents = [makeAgent({ AgentName: 'AlphaWolf' }), makeAgent({ AgentName: 'beta' })];
  deepStrictEqual(filterAgents(agents, 'ALPH'), [agents[0]]);
  deepStrictEqual(filterAgents(agents, 'wolf'), [agents[0]]);
  deepStrictEqual(filterAgents(agents, 'zzz'), []);
});

test('getSortValue 各排序键的取值', () => {
  strictEqual(getSortValue(makeAgent({ AgentName: 'AbC' }), 'AgentName'), 'abc');
  strictEqual(getSortValue(makeAgent({ AgentFaction: 'ENLIGHTENED' }), 'AgentFaction'), 'enlightened');
  strictEqual(getSortValue(makeAgent({ APdiff: '1234' }), 'APdiff'), 1234);
  strictEqual(getSortValue(makeAgent({ APdiff: undefined }), 'APdiff'), 0);
  strictEqual(getSortValue(makeAgent({ PV: 'TRUE' }), 'PV'), 1);
  strictEqual(getSortValue(makeAgent({ PV: 'FALSE' }), 'PV'), 0);
  strictEqual(getSortValue(makeAgent({ PV: 'true' }), 'PV'), 0);
  strictEqual(getSortValue(makeAgent({}), 'unknown-key'), 0);
});

test('sortAgents 按 APdiff 数值排序（字符串输入也可）', () => {
  const agents = [makeAgent({ AgentName: 'A', APdiff: '9000' }), makeAgent({ AgentName: 'B', APdiff: 250 }), makeAgent({ AgentName: 'C', APdiff: '10000' })];
  deepStrictEqual(sortAgents(agents, 'APdiff', 'asc').map(a => a.AgentName), ['B', 'A', 'C']);
  deepStrictEqual(sortAgents(agents, 'APdiff', 'desc').map(a => a.AgentName), ['C', 'A', 'B']);
});

test('sortAgents 按状态排序：已签到（TRUE）视为 1', () => {
  const agents = [makeAgent({ AgentName: 'A', PV: 'TRUE' }), makeAgent({ AgentName: 'B', PV: 'FALSE' })];
  deepStrictEqual(sortAgents(agents, 'PV', 'asc').map(a => a.AgentName), ['B', 'A']);
});

test('sortAgents 名称按小写字典序', () => {
  const agents = [makeAgent({ AgentName: 'charlie' }), makeAgent({ AgentName: 'Bravo' }), makeAgent({ AgentName: 'alpha' })];
  deepStrictEqual(sortAgents(agents, 'AgentName', 'asc').map(a => a.AgentName), ['alpha', 'Bravo', 'charlie']);
});

test('sortAgents key 为空时不排序但返回副本', () => {
  const agents = [makeAgent({ AgentName: 'B' }), makeAgent({ AgentName: 'A' })];
  const result = sortAgents(agents, '', 'asc');
  deepStrictEqual(result.map(a => a.AgentName), ['B', 'A']);
  notStrictEqual(result, agents);
});

test('sortAgents 不修改原数组', () => {
  const agents = [makeAgent({ AgentName: 'B', APdiff: 2 }), makeAgent({ AgentName: 'A', APdiff: 1 })];
  sortAgents(agents, 'APdiff', 'asc');
  deepStrictEqual(agents.map(a => a.AgentName), ['B', 'A']);
});

test('computeAgentStats 统计总数、签到数与分阵营进度', () => {
  const agents = [
    makeAgent({ AgentName: 'R1', AgentFaction: 'Resistance', PV: 'TRUE' }),
    makeAgent({ AgentName: 'R2', AgentFaction: 'Resistance', PV: 'FALSE' }),
    makeAgent({ AgentName: 'E1', AgentFaction: 'Enlightened', PV: 'TRUE' }),
    makeAgent({ AgentName: 'X1', AgentFaction: 'Unknown', PV: 'TRUE' }),
  ];
  deepStrictEqual(computeAgentStats(agents), {
    total: 4,
    checkedIn: 3,
    resistance: 2,
    resistanceCheckedIn: 1,
    enlightened: 1,
    enlightenedCheckedIn: 1,
  });
});

test('computeAgentStats 空名单', () => {
  deepStrictEqual(computeAgentStats([]), {
    total: 0,
    checkedIn: 0,
    resistance: 0,
    resistanceCheckedIn: 0,
    enlightened: 0,
    enlightenedCheckedIn: 0,
  });
});
