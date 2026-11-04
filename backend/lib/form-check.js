// /form-check 业务核心：解析 Google Forms 链接并探测表单状态（存在性 / 是否收集中 / 是否已关联本表格）。
import { getSheetTitles } from './sheets.js';

// 解析 Google Forms 链接，返回可公开访问的 viewform 地址；非 Google 表单返回 null
export function normalizeGoogleFormUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname !== 'docs.google.com') return null;
    const prefixMatch = parsed.pathname.match(/^\/forms\/d(?:\/e)?\/([a-zA-Z0-9_-]+)/);
    if (!prefixMatch) return null;
    return `https://docs.google.com${prefixMatch[0]}/viewform`;
  } catch (e) {
    return null;
  }
}

// 探测表单状态：返回 { exists, acceptingResponses, title, linkedLikely, supported }
export async function checkFormStatus(formUrl, spreadsheetId) {
  const result = { exists: null, acceptingResponses: null, title: null, linkedLikely: null, supported: false };

  const normalized = normalizeGoogleFormUrl(formUrl);
  if (normalized) {
    result.supported = true;

    let response = null;
    try {
      response = await fetch(normalized, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
    } catch (e) {
      console.error('[/form-check] 表单页获取失败:', e);
    }

    if (response && response.status === 404) {
      result.exists = false;
    } else if (response && response.ok) {
      const html = await response.text();
      // 真实表单页必然内联 FB_PUBLIC_LOAD_DATA_；缺失说明拿到的是同意页/中间页，不做断言
      if (html.includes('FB_PUBLIC_LOAD_DATA_')) {
        result.exists = true;
        // 「已停止收集回复」横幅的 class，与语言无关；非公开契约，仅作尽力检测
        result.acceptingResponses = !html.includes('freebirdFormviewerViewResponseClosedMessage');
        const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
        if (titleMatch) {
          result.title = titleMatch[1].replace(/\s*[-–]\s*Google.*$/i, '').trim() || null;
        }
      }
    }

    if (result.exists === true) {
      try {
        const titles = await getSheetTitles(spreadsheetId);
        result.linkedLikely = titles.some(t => /^form responses/i.test(t) || t.includes('表单响应'));
      } catch (e) {
        console.error('[/form-check] 表格检查失败:', e);
        result.linkedLikely = null;
      }
    }
  }

  return result;
}
