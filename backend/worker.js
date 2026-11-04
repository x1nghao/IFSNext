// Cloudflare Worker 入口（Service Worker 格式）：路由分发与请求级编排。
// 具体能力分模块：环境配置 lib/config、HTTP 语义 lib/http、认证 lib/google-auth、
// Sheets 读写 lib/sheets、表单探测 lib/form-check、错误映射 lib/google-errors。
// Wrangler 打包时会把 lib/ 内联进部署产物，线上仍是单个脚本。
import { jsonResponse, handleOptions } from './lib/http.js';
import { getAllowedSpreadsheetIds, SHEET_COLUMNS } from './lib/config.js';
import { getSheetData, findAgentInfo, updateSheetCell } from './lib/sheets.js';
import { checkFormStatus } from './lib/form-check.js';

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  // 处理 CORS 预检请求
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  const url = new URL(request.url);
  const method = request.method;
  const spreadsheetId = url.searchParams.get('spreadsheet_id');
  const sheetName = url.searchParams.get('sheet_name') || 'Data';

  if (!spreadsheetId) {
    return jsonResponse({ error: 'Missing spreadsheet_id' }, 400);
  }

  // 可选白名单：设置 ALLOWED_SPREADSHEET_IDS 后仅放行列表内的表格
  const allowedIds = getAllowedSpreadsheetIds();
  if (allowedIds && !allowedIds.includes(spreadsheetId)) {
    return jsonResponse({ error: 'Spreadsheet not allowed' }, 403);
  }

  // 统一缓存键构造逻辑
  const cache = caches.default;
  const dataUrl = new URL(request.url);
  dataUrl.pathname = '/data';
  dataUrl.searchParams.delete('agent_name'); // 验证接口不影响数据接口的缓存键内容
  dataUrl.searchParams.sort();               // 排序参数保证键的一致性
  const dataCacheKey = dataUrl.toString();

  // 路由: 获取数据
  if (url.pathname === '/data' && method === 'GET') {
    try {
      // 尝试从 Cloudflare Cache API 获取 (按数据中心缓存)
      let cachedResponse = await cache.match(dataCacheKey);
      if (cachedResponse) {
        // 增加一个自定义响应头标识缓存命中（可选，方便调试）
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Cache-Status', 'HIT');
        // 保留缓存响应的真实状态码（Response 的 status 是原型 getter，spread 复制不到）
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers
        });
      }

      // 获取数据
      const sheetData = await getSheetData(spreadsheetId, sheetName);

      const filteredData = sheetData.slice(1).map(row => ({
        PV: row[SHEET_COLUMNS.PV],
        AgentFaction: row[SHEET_COLUMNS.FACTION],
        AgentName: row[SHEET_COLUMNS.NAME],
        APdiff: row[SHEET_COLUMNS.AP_DIFF]
      })).filter(row => row.AgentName);

      const response = jsonResponse(filteredData, 200, {
        // s-maxage=10 让 Cloudflare 缓存 10 秒
        // max-age=0 和 must-revalidate 强制浏览器每次都向服务器检查，不使用本地强缓存
        'Cache-Control': 'public, s-maxage=10, max-age=0, must-revalidate',
        'X-Cache-Status': 'MISS'
      });

      // 存入缓存 (使用 clone 因为响应体只能读取一次)
      event.waitUntil(cache.put(dataCacheKey, response.clone()));

      return response;
    } catch (error) {
      console.error('[/data] 处理失败:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // 路由: 验证/切换状态
  // 可选 value 参数（TRUE/FALSE，大小写不敏感）：目标状态语义，幂等写入；
  // 缺省时保持旧的 toggle 行为（向前兼容已部署的旧前端）。
  if (url.pathname === '/verify' && method === 'POST') {
    try {
      const agent_name = url.searchParams.get('agent_name');
      if (!agent_name) {
        return jsonResponse({ error: 'Missing agent_name' }, 400);
      }

      let targetValue = null;
      const rawValue = url.searchParams.get('value');
      if (rawValue !== null) {
        const normalized = rawValue.trim().toUpperCase();
        if (normalized === 'TRUE' || normalized === '1') targetValue = 'TRUE';
        else if (normalized === 'FALSE' || normalized === '0') targetValue = 'FALSE';
        else {
          return jsonResponse({ error: 'Invalid value, expected TRUE or FALSE' }, 400);
        }
      }

      // 一次 API 调用获取行号和当前 PV 状态
      const agentInfo = await findAgentInfo(spreadsheetId, sheetName, agent_name);

      if (!agentInfo) {
        return jsonResponse({ error: 'Agent not found' }, 404);
      }

      const { rowIndex, currentPV } = agentInfo;
      const isTrue = String(currentPV).toUpperCase() === "TRUE";

      // 目标状态语义：已是目标值则不写入（幂等）；未传 value 时切换
      const newValue = targetValue !== null ? targetValue : (isTrue ? 'FALSE' : 'TRUE');

      if (String(newValue).toUpperCase() === String(currentPV).toUpperCase()) {
        return jsonResponse({ status: 'success', message: 'No change needed', new_value: newValue, unchanged: true });
      }

      const updateResult = await updateSheetCell(spreadsheetId, sheetName, rowIndex, "A", newValue);

      // 如果更新成功，清除 /data 接口的缓存
      event.waitUntil(cache.delete(dataCacheKey));

      return jsonResponse({ status: 'success', message: updateResult, new_value: newValue });
    } catch (error) {
      console.error('[/verify] 处理失败:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // 路由: 检查签到表单状态（存在性 / 是否收集中 / 是否已关联本表格）
  if (url.pathname === '/form-check' && method === 'GET') {
    try {
      const formUrl = url.searchParams.get('form_url');
      if (!formUrl) {
        return jsonResponse({ error: 'Missing form_url' }, 400);
      }

      const result = await checkFormStatus(formUrl, spreadsheetId);

      return jsonResponse(result, 200, { 'Cache-Control': 'public, max-age=30' });
    } catch (error) {
      console.error('[/form-check] 处理失败:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  return jsonResponse({ error: 'Not Found' }, 404);
}
