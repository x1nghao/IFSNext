export type AgentModifiedAtMap = Record<string, Record<string, number>>;

export interface ParsedAgentModifiedAt {
  map: AgentModifiedAtMap;
  // 旧版扁平结构是否被迁移为新结构（调用方需持久化迁移结果）
  migrated: boolean;
}

// 纯函数：解析 localStorage 中记录的 Agent 修改时间。
// 返回 null 表示内容缺失或无效，调用方应保留现有状态。
// 兼容旧版扁平结构 { agentName: timestamp }，会迁移到 { [fallbackSheetId]: { agentName: timestamp } }。
export const parseAgentModifiedAt = (
  raw: string | null,
  fallbackSheetId: string
): ParsedAgentModifiedAt | null => {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const entries = Object.entries(parsed as Record<string, unknown>);
  const isLegacyFlatMap =
    entries.length > 0 &&
    entries.every(([key, val]) => typeof key === 'string' && typeof val === 'number' && Number.isFinite(val));

  if (isLegacyFlatMap) {
    const cleanedAgents: Record<string, number> = {};
    for (const [agentName, timestamp] of entries as Array<[string, number]>) {
      cleanedAgents[agentName] = timestamp;
    }
    return { map: { [fallbackSheetId]: cleanedAgents }, migrated: true };
  }

  const cleaned: AgentModifiedAtMap = {};
  for (const [sheetId, val] of entries) {
    if (!sheetId || typeof sheetId !== 'string') continue;
    if (!val || typeof val !== 'object') continue;
    const perSheet: Record<string, number> = {};
    for (const [agentName, timestamp] of Object.entries(val as Record<string, unknown>)) {
      if (typeof agentName === 'string' && typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        perSheet[agentName] = timestamp;
      }
    }
    if (Object.keys(perSheet).length) {
      cleaned[sheetId] = perSheet;
    }
  }
  return { map: cleaned, migrated: false };
};

// 以下均为纯函数，返回新对象，不修改入参
export const addAgentModifiedTime = (
  map: AgentModifiedAtMap,
  sheetId: string,
  agentName: string,
  timestamp: number
): AgentModifiedAtMap => ({
  ...map,
  [sheetId]: { ...(map[sheetId] || {}), [agentName]: timestamp }
});

export const removeAgentModifiedTime = (
  map: AgentModifiedAtMap,
  sheetId: string,
  agentName: string
): AgentModifiedAtMap => {
  const perSheet = map[sheetId];
  if (!perSheet || !(agentName in perSheet)) return map;
  const nextPerSheet = { ...perSheet };
  delete nextPerSheet[agentName];
  const next: AgentModifiedAtMap = { ...map, [sheetId]: nextPerSheet };
  if (Object.keys(nextPerSheet).length === 0) {
    delete next[sheetId];
  }
  return next;
};
