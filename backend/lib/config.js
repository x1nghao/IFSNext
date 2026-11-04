// 环境配置：凭据与可选白名单都从 Worker 全局环境变量读取。
// 采用「调用时读取」而非模块加载时快照：Wrangler 注入的环境变量运行期不变，
// 行为一致；测试则可在 import 之后改写 globalThis 来注入不同场景。
//
// 注意：GOOGLE_PRIVATE_KEY 和 GOOGLE_CLIENT_EMAIL 应在 Cloudflare Worker 的环境变量中设置；
// ALLOWED_SPREADSHEET_IDS 为可选安全白名单——逗号分隔的表格 ID。设置后仅允许访问列表内的表格，
// 防止本 Worker 被当作开放代理读取/写入服务账号可见的任意表格；留空则不限制（保持旧行为）。

// 服务账号凭据；GOOGLE_PRIVATE_KEY 中的 \n 转义还原为真实换行
export const getServiceAccountInfo = () => ({
  private_key: (typeof GOOGLE_PRIVATE_KEY !== 'undefined' ? GOOGLE_PRIVATE_KEY : '').replace(/\\n/g, '\n'),
  client_email: typeof GOOGLE_CLIENT_EMAIL !== 'undefined' ? GOOGLE_CLIENT_EMAIL : '',
});

// 可选白名单：未设置返回 null（不限制），设置后返回去空白后的 ID 数组
export const getAllowedSpreadsheetIds = () => {
  if (typeof ALLOWED_SPREADSHEET_IDS === 'undefined' || !ALLOWED_SPREADSHEET_IDS) return null;
  return String(ALLOWED_SPREADSHEET_IDS).split(',').map(s => s.trim()).filter(Boolean);
};

// Google Sheets 列索引配置 (从 0 开始)
export const SHEET_COLUMNS = {
  PV: 0,          // A列: Passcode Verified
  FACTION: 2,     // C列: Agent Faction
  NAME: 4,        // E列: Agent Name
  AP_DIFF: 11,    // L列: AP Difference
};
