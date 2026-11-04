// 签到表单状态自动检查：输入防抖后调用后端 /form-check，
// 结论只有四类可行动告警会上浮（closed/notfound/notlinked/invalid），瞬时网络失败保持沉默。
import { ref, computed, watch } from 'vue';
import { parseIgnoredFormUrls, addIgnoredFormUrl, isGoogleFormUrl } from '@/utils/formCheck';
import { isSafeHttpUrl } from '@/utils/url';
import { useSettings } from './useSettings';

const { checkinFormUrl, apiBaseUrl, spreadsheetId } = useSettings();

type FormCheckState = 'idle' | 'checking' | 'ok' | 'closed' | 'notfound' | 'notlinked' | 'invalid' | 'failed';
const formCheckState = ref<FormCheckState>('idle');
let formCheckTimer: ReturnType<typeof setTimeout> | null = null;
let formCheckSeq = 0;

// 忽略名单：链接可能并非 Google 表单而是其他引导页，组织者对误报点击「忽略」后收进名单，
// 本机后续遇到同一链接直接放行，不再检查也不再提示
const FORM_IGNORE_STORAGE_KEY = 'ifsnext_ignored_form_urls';
let rawIgnoredFormUrls: string | null = null;
try { rawIgnoredFormUrls = localStorage.getItem(FORM_IGNORE_STORAGE_KEY); } catch (e) {}
const ignoredFormUrls = ref<string[]>(parseIgnoredFormUrls(rawIgnoredFormUrls));

const checkFormStatus = async () => {
  const url = checkinFormUrl.value.trim();
  if (!url || !url.includes('docs.google.com')) {
    formCheckState.value = 'idle';
    return;
  }
  if (ignoredFormUrls.value.includes(url)) {
    formCheckState.value = 'idle';
    return;
  }
  if (!isGoogleFormUrl(url)) {
    formCheckState.value = 'invalid';
    return;
  }
  if (!isSafeHttpUrl(apiBaseUrl.value) || !spreadsheetId.value) {
    formCheckState.value = 'idle';
    return;
  }
  const seq = ++formCheckSeq;
  formCheckState.value = 'checking';
  try {
    const requestUrl = `${apiBaseUrl.value}/form-check?form_url=${encodeURIComponent(url)}&spreadsheet_id=${encodeURIComponent(spreadsheetId.value)}`;
    const response = await fetch(requestUrl, { headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (seq !== formCheckSeq) return;
    if (result.supported === false) {
      formCheckState.value = 'idle';
    } else if (result.exists === false) {
      formCheckState.value = 'notfound';
    } else if (result.exists === true) {
      if (result.acceptingResponses === false) {
        formCheckState.value = 'closed';
      } else if (result.linkedLikely === false) {
        formCheckState.value = 'notlinked';
      } else {
        formCheckState.value = 'ok';
      }
    } else {
      formCheckState.value = 'failed';
    }
  } catch {
    if (seq === formCheckSeq) formCheckState.value = 'failed';
  }
};

// 点「忽略」：当前链接收进白名单并立即回到静默；作废在途请求，防止旧检查结果把告警顶回来
const ignoreFormCheck = () => {
  const next = addIgnoredFormUrl(ignoredFormUrls.value, checkinFormUrl.value.trim());
  if (next !== ignoredFormUrls.value) {
    ignoredFormUrls.value = next;
    try { localStorage.setItem(FORM_IGNORE_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  }
  if (formCheckTimer) clearTimeout(formCheckTimer);
  formCheckSeq++;
  formCheckState.value = 'idle';
};

// 表单链接、表格或后端地址变化后都应重新体检（防抖 600ms）
watch([checkinFormUrl, spreadsheetId, apiBaseUrl], () => {
  if (formCheckTimer) clearTimeout(formCheckTimer);
  formCheckTimer = setTimeout(checkFormStatus, 600);
});

// 签到页告警条：仅显示可行动的确定性表单异常；failed 属瞬时网络问题不上浮
const formWarningActive = computed(() =>
  ['closed', 'notfound', 'notlinked'].includes(formCheckState.value)
);

// 「可能有问题」的提示都可一键忽略（ignored 状态即已放行）；failed 属瞬时网络问题，忽略无意义
const formCheckIgnorable = computed(() =>
  ['invalid', 'notfound', 'closed', 'notlinked'].includes(formCheckState.value)
);

// 应用卸载时作废在途防抖检查（与原清理行为一致）
const stopFormCheck = () => {
  if (formCheckTimer) clearTimeout(formCheckTimer);
};

export function useFormCheck() {
  return {
    formCheckState,
    formWarningActive,
    formCheckIgnorable,
    ignoreFormCheck,
    stopFormCheck,
  };
}
