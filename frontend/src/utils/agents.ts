import type { Agent } from '../types';

// 从粘贴的 Google Sheets 链接中提取表格 ID；不是链接则返回 null
export const extractSpreadsheetId = (input: string): string | null => {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
};

export const filterAgents = (agents: Agent[], query: string): Agent[] => {
  if (!query) return agents;
  return agents.filter(agent => agent.AgentName.toLowerCase().includes(query.toLowerCase()));
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
