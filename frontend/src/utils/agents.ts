import type { Agent } from '../types';

// 从粘贴的 Google Sheets 链接中提取表格 ID；不是链接则返回 null
export const extractSpreadsheetId = (input: string): string | null => {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
};

export type StatusFilter = 'all' | 'checked' | 'unchecked';
export type FactionFilter = 'all' | 'Resistance' | 'Enlightened';

export interface AgentFilters {
  status?: StatusFilter;
  faction?: FactionFilter;
}

export const hasActiveFilters = (filters: AgentFilters): boolean =>
  (filters.status !== undefined && filters.status !== 'all') ||
  (filters.faction !== undefined && filters.faction !== 'all');

// 按搜索词与筛选条件过滤（仅本地显示，不触碰云端数据）；条件为空时原样返回
export const filterAgents = (agents: Agent[], query: string, filters: AgentFilters = {}): Agent[] => {
  let result = agents;
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(agent => agent.AgentName.toLowerCase().includes(q));
  }
  if (filters.status === 'checked') {
    result = result.filter(agent => agent.PV === 'TRUE');
  } else if (filters.status === 'unchecked') {
    result = result.filter(agent => agent.PV !== 'TRUE');
  }
  if (filters.faction && filters.faction !== 'all') {
    result = result.filter(agent => agent.AgentFaction === filters.faction);
  }
  return result;
};

export const getSortValue = (agent: Agent, key: string): string | number => {
  switch (key) {
    case 'AgentName': return (agent.AgentName || '').toLowerCase();
    case 'AgentFaction': return (agent.AgentFaction || '').toLowerCase();
    case 'APdiff': return Number(agent.APdiff ?? 0);
    case 'PV': return agent.PV === 'TRUE' ? 1 : 0;
    default: return 0;
  }
};

export interface AgentStats {
  total: number;
  checkedIn: number;
  resistance: number;
  resistanceCheckedIn: number;
  enlightened: number;
  enlightenedCheckedIn: number;
}

// 基于全量名单统计签到进度；阵营之外的条目只计入总数
export const computeAgentStats = (agents: Agent[]): AgentStats => {
  const stats: AgentStats = {
    total: agents.length,
    checkedIn: 0,
    resistance: 0,
    resistanceCheckedIn: 0,
    enlightened: 0,
    enlightenedCheckedIn: 0,
  };
  for (const agent of agents) {
    const checked = agent.PV === 'TRUE';
    if (checked) stats.checkedIn++;
    if (agent.AgentFaction === 'Resistance') {
      stats.resistance++;
      if (checked) stats.resistanceCheckedIn++;
    } else if (agent.AgentFaction === 'Enlightened') {
      stats.enlightened++;
      if (checked) stats.enlightenedCheckedIn++;
    }
  }
  return stats;
};

// 返回排序后的新数组，不修改入参；key 为空或未知时不排序
export const sortAgents = (agents: Agent[], key: string, order: string): Agent[] => {
  const data = agents.slice();
  if (!key) return data;
  data.sort((a, b) => {
    const va = getSortValue(a, key);
    const vb = getSortValue(b, key);
    if (va < vb) return order === 'asc' ? -1 : 1;
    if (va > vb) return order === 'asc' ? 1 : -1;
    return 0;
  });
  return data;
};
