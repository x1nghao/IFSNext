// Agent 修改时间：按表格分别记录本机对签到状态的改动时刻，
// 签到页在行内展示「几点改的」，撤销/回滚时同步清除避免显示从未生效的时间戳。
// 纯逻辑（增删/迁移/解析）在 utils/agentModifiedAt.ts，本模块只管存储与查询。
import { ref } from 'vue';
import {
  addAgentModifiedTime,
  parseAgentModifiedAt,
  removeAgentModifiedTime,
} from '@/utils/agentModifiedAt';
import { useSettings } from './useSettings';

const AGENT_MODIFIED_AT_STORAGE_KEY = 'ifsnext_agent_modified_at';

const agentModifiedAtBySheet = ref<Record<string, Record<string, number>>>({});
const { spreadsheetId } = useSettings();

const loadAgentModifiedAt = () => {
  try {
    const raw = localStorage.getItem(AGENT_MODIFIED_AT_STORAGE_KEY);
    const parsed = parseAgentModifiedAt(raw, spreadsheetId.value || '');
    if (!parsed) return;

    agentModifiedAtBySheet.value = parsed.map;
    if (parsed.migrated) {
      persistAgentModifiedAt();
    }
  } catch (e) {}
};

const persistAgentModifiedAt = () => {
  try {
    localStorage.setItem(AGENT_MODIFIED_AT_STORAGE_KEY, JSON.stringify(agentModifiedAtBySheet.value));
  } catch (e) {}
};

const setAgentModifiedTime = (sheetId: string, agentName: string, timestamp: number) => {
  agentModifiedAtBySheet.value = addAgentModifiedTime(agentModifiedAtBySheet.value, sheetId, agentName, timestamp);
  persistAgentModifiedAt();
};

const removeAgentModifiedTimeEntry = (sheetId: string, agentName: string) => {
  agentModifiedAtBySheet.value = removeAgentModifiedTime(agentModifiedAtBySheet.value, sheetId, agentName);
  persistAgentModifiedAt();
};

const formatModifiedTime = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(timestamp));
  } catch (e) {
    return new Date(timestamp).toLocaleTimeString();
  }
};

// 行内展示用：当前表格下该 Agent 的修改时间短文案；无记录返回空串
const getAgentModifiedTimeText = (agentName: string) => {
  const sheetId = spreadsheetId.value;
  if (!sheetId) return '';
  const timestamp = agentModifiedAtBySheet.value[sheetId]?.[agentName];
  if (typeof timestamp !== 'number') return '';
  return formatModifiedTime(timestamp);
};

export function useAgentModifiedAt() {
  return {
    loadAgentModifiedAt,
    setAgentModifiedTime,
    removeAgentModifiedTimeEntry,
    getAgentModifiedTimeText,
  };
}
