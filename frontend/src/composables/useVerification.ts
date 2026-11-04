// 签到核验（PV 状态写入）与撤销长按确认。
// 乐观更新可能与后台自动刷新交错——请求持有的对象可能已脱离当前 agents 数组，
// 因此所有 PV 变更都按名字同步到展示列表与缓存，保证界面一致。
import { ref } from 'vue';
import type { Agent } from '@/types';
import { createLogger } from '@/utils/logger';
import { i18n } from '@/i18n';
import { useSettings } from './useSettings';
import { useToast } from './useToast';
import { useAgentData } from './useAgentData';
import { useAgentModifiedAt } from './useAgentModifiedAt';

const { t } = i18n.global;
const { addError } = useToast();
const { spreadsheetId, apiBaseUrl, undoHoldRequired } = useSettings();
const { agents, cachedData } = useAgentData();
const { setAgentModifiedTime, removeAgentModifiedTimeEntry } = useAgentModifiedAt();

// 模块级日志：写入失败现场统一带 [IFSNext:verify] 前缀
const verifyLogger = createLogger('verify');

const verificationLoadingMap = ref<Record<string, boolean>>({});

// PV 回写：同时落到名单与缓存两处，乐观更新的对象无论是否还在展示列表都能生效
const applyPv = (agent: Agent, pv: string) => {
  agent.PV = pv;
  for (const list of [agents.value, cachedData.value]) {
    const current = list.find(a => a.AgentName === agent.AgentName);
    if (current) current.PV = pv;
  }
};

const toggleVerification = async (agent: Agent) => {
  if (!spreadsheetId.value) {
    addError(t('error.needSheetId'));
    return;
  }
  if (verificationLoadingMap.value[agent.AgentName]) {
    return; // 已经在处理中
  }

  verificationLoadingMap.value[agent.AgentName] = true;
  const originalStatus = agent.PV;
  const newStatus = agent.PV === 'TRUE' ? 'FALSE' : 'TRUE';

  applyPv(agent, newStatus);
  setAgentModifiedTime(spreadsheetId.value, agent.AgentName, Date.now());

  try {
    // 目标状态语义：携带 value 让后端幂等写入，避免多人同时操作时被 toggle 翻转两次
    const requestUrl = `${apiBaseUrl.value}/verify?agent_name=${encodeURIComponent(agent.AgentName)}&spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}&value=${newStatus}`;
    const response = await fetch(requestUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } });
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }
    const result = await response.json();
    if (result.status === 'success') {
      const serverValue = result.new_value === 'TRUE' ? 'TRUE' : result.new_value === 'FALSE' ? 'FALSE' : null;
      if (serverValue && serverValue !== newStatus) {
        // 另一位操作者已把该 Agent 改成别的状态：以服务器为准回写本地
        applyPv(agent, serverValue);
        if (serverValue === 'TRUE') {
          setAgentModifiedTime(spreadsheetId.value, agent.AgentName, Date.now());
        } else {
          removeAgentModifiedTimeEntry(spreadsheetId.value, agent.AgentName);
        }
      }
    } else {
      throw new Error(result.message || t('error.verifyFailed', { message: `HTTP ${response.status}` }));
    }
  } catch (error: any) {
    applyPv(agent, originalStatus);
    // 回滚乐观更新时记录的修改时间，避免显示从未生效的时间戳
    removeAgentModifiedTimeEntry(spreadsheetId.value, agent.AgentName);
    addError(t('error.verifyFailed', { message: error.message }));
    verifyLogger.error('签到状态写入失败', {
      agent: agent.AgentName,
      sheet: spreadsheetId.value,
      attempted: newStatus,
      rolledBackTo: originalStatus,
      reason: error?.message,
      error,
    });
  } finally {
    verificationLoadingMap.value[agent.AgentName] = false;
  }
};

// ── 撤销签到长按确认 ──
// 已签到的撤销按钮改为按住 1 秒触发：定时器驱动进度环，松手/移出/系统打断即取消。
// 快速点按不触发（进度环会提示「长按撤销」）；键盘 Enter/Space 产生的 click（detail 为 0）直接执行。
const UNDO_HOLD_MS = 1000;
const pressState = ref<{ agent: string; progress: number } | null>(null);
let holdTimer: ReturnType<typeof setInterval> | null = null;
let holdStart = 0;

const beginUndoHold = (agent: Agent) => {
  if (!undoHoldRequired.value) return; // 设置关闭：点按直接撤销（click 路径处理）
  if (verificationLoadingMap.value[agent.AgentName] || pressState.value) return;
  holdStart = performance.now();
  pressState.value = { agent: agent.AgentName, progress: 0 };
  const tick = () => {
    if (!pressState.value || pressState.value.agent !== agent.AgentName) {
      // 长按已被取消或被其他按钮接管：本定时器再无用途，原地自清防止空转泄漏
      if (holdTimer !== null) {
        clearInterval(holdTimer);
        holdTimer = null;
      }
      return;
    }
    const progress = Math.min(1, (performance.now() - holdStart) / UNDO_HOLD_MS);
    pressState.value.progress = progress;
    if (progress >= 1) {
      pressState.value = null;
      toggleVerification(agent);
    }
  };
  holdTimer = setInterval(tick, 30);
};

const cancelUndoHold = (agentName: string) => {
  if (pressState.value && pressState.value.agent !== agentName) return;
  if (holdTimer !== null) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
  pressState.value = null;
};

const onUndoButtonClick = (e: MouseEvent, agent: Agent) => {
  // 键盘触发（detail 0）或关闭二次确认时：点击直接撤销；否则等待长按进度环
  if (e.detail === 0 || !undoHoldRequired.value) {
    toggleVerification(agent);
  }
};

// 应用卸载时停掉进行中的长按定时器（与原清理行为一致）
const disposeUndoHold = () => {
  if (holdTimer !== null) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
};

export function useVerification() {
  return {
    verificationLoadingMap,
    pressState,
    toggleVerification,
    beginUndoHold,
    cancelUndoHold,
    onUndoButtonClick,
    disposeUndoHold,
  };
}
