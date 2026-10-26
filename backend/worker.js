// 服务账号的配置信息
// 注意：GOOGLE_PRIVATE_KEY 和 GOOGLE_CLIENT_EMAIL 应在 Cloudflare Worker 的环境变量中设置
// 可选：ALLOWED_SPREADSHEET_IDS —— 逗号分隔的表格 ID 白名单。设置后仅允许访问列表内的表格，
// 防止本 Worker 被当作开放代理读取/写入服务账号可见的任意表格；留空则不限制（保持旧行为）。
const SERVICE_ACCOUNT_INFO = {
  private_key: (typeof GOOGLE_PRIVATE_KEY !== 'undefined' ? GOOGLE_PRIVATE_KEY : '').replace(/\\n/g, '\n'),
  client_email: typeof GOOGLE_CLIENT_EMAIL !== 'undefined' ? GOOGLE_CLIENT_EMAIL : '',
};

const getAllowedSpreadsheetIds = () => {
  if (typeof ALLOWED_SPREADSHEET_IDS === 'undefined' || !ALLOWED_SPREADSHEET_IDS) return null;
  return String(ALLOWED_SPREADSHEET_IDS).split(',').map(s => s.trim()).filter(Boolean);
};

// Google Sheets 列索引配置 (从 0 开始)
const SHEET_COLUMNS = {
  PV: 0,          // A列: Passcode Verified
  FACTION: 2,     // C列: Agent Faction
  NAME: 4,        // E列: Agent Name
  AP_DIFF: 11,    // L列: AP Difference
};

// 辅助函数：标准化 JSON 响应
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // 生产环境建议修改为特定域名
      ...extraHeaders
    },
  });
}

// 辅助函数：处理 Google Sheets API 频率限制
function handleApiRateLimit(response) {
  if (response.status === 429) {
    throw new Error("Google Sheets API 频率限制，请稍后再试 (Quota exceeded)");
  }
}

// 处理 Base64 编码
function pemToArrayBuffer(pem) {
  // 清理私钥中的换行符和其他格式字符
  const b64Lines = pem.replace("-----BEGIN PRIVATE KEY-----", '')
                      .replace("-----END PRIVATE KEY-----", '')
                      .replace(/\s/g, ''); // 移除所有空白字符（包括换行）
  const binary = atob(b64Lines);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array.buffer;
}

// Base64url 编码函数
function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  let b64 = btoa(binary);
  // 处理 base64url 编码，替换不合法的字符
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let __token = null;
let __token_exp = 0;

// 4. 获取访问令牌的函数
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (__token && now < __token_exp - 60) {
    return __token;
  }
  
  if (!SERVICE_ACCOUNT_INFO.private_key || !SERVICE_ACCOUNT_INFO.client_email) {
    throw new Error("Missing Google Service Account credentials");
  }

  const jwtHeader = {
    alg: "RS256",
    typ: "JWT"
  };

  const jwtClaimSet = {
    iss: SERVICE_ACCOUNT_INFO.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, // 1 小时后过期
    iat: now
  };

  const encoder = new TextEncoder();
  const headerEncoded = base64urlEncode(encoder.encode(JSON.stringify(jwtHeader)));
  const claimSetEncoded = base64urlEncode(encoder.encode(JSON.stringify(jwtClaimSet)));
  const data = `${headerEncoded}.${claimSetEncoded}`; // 拼接 JWT 头部和负载

  // 导入私钥
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(SERVICE_ACCOUNT_INFO.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  // 签名数据
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(data)
  );

  const signatureEncoded = base64urlEncode(signature);
  const jwt = `${data}.${signatureEncoded}`; // 拼接完整的 JWT

  // 请求访问令牌
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    // 详情只进 Workers 日志，不外发：响应体可能包含服务账号邮箱等敏感信息
    const error = await response.text();
    console.error('获取访问令牌失败:', response.status, error);
    throw new Error(`获取访问令牌失败: HTTP ${response.status}`);
  }

  const dataResponse = await response.json();
  __token = dataResponse.access_token;
  __token_exp = now + (dataResponse.expires_in || 3600);
  return __token;
}

// 5. 获取 Google Sheets 数据的函数
// 优化：支持 range 参数，避免不必要的数据传输
async function getSheetData(spreadsheetId, sheetName, range = 'A1:L2000') {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${range}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    handleApiRateLimit(response);
    const error = await response.text();
    console.error('获取数据失败:', response.status, error);
    throw new Error(`获取数据失败: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.values || [];
}

// 优化：一次性获取 A 到 E 列，既能找到行号，也能拿到当前的 PV 状态
async function findAgentInfo(spreadsheetId, sheetName, agentName) {
  // 获取 A 到 E 列 (A: PV, C: Faction, E: Name)
  const data = await getSheetData(spreadsheetId, sheetName, 'A:E');
  
  // 查找匹配的行索引 (行号 = 索引 + 1)
  // Agent Name 在 E 列 (索引 4)
  const index = data.findIndex(row => row[SHEET_COLUMNS.NAME] === agentName);
  
  if (index === -1) return null;

  return {
    rowIndex: index + 1,
    currentPV: data[index][SHEET_COLUMNS.PV] || "FALSE"
  };
}

// 解析 Google Forms 链接，返回可公开访问的 viewform 地址；非 Google 表单返回 null
function normalizeGoogleFormUrl(rawUrl) {
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

// 读取表格全部工作表标题（用于检测「表单响应」tab 是否存在）
async function getSheetTitles(spreadsheetId) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const error = await response.text();
    console.error('获取工作表列表失败:', response.status, error);
    throw new Error(`获取工作表列表失败: HTTP ${response.status}`);
  }
  const data = await response.json();
  return (data.sheets || []).map(s => s.properties && s.properties.title).filter(Boolean);
}

// 更新 Google Sheets 中的字段
async function updateSheetCell(spreadsheetId, sheetName, rowIndex, colLetter, value) {  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${colLetter}${rowIndex}?valueInputOption=RAW`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: `${sheetName}!${colLetter}${rowIndex}`,
      values: [[value]]
    })
  });

  if (!response.ok) {
    handleApiRateLimit(response);
    const error = await response.text();
    console.error('更新失败:', response.status, error);
    throw new Error(`更新失败: HTTP ${response.status}`);
  }

  return 'Update successful';
}

// Cloudflare Worker 入口
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event));
});

// 处理 CORS 预检请求
function handleOptions(request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  return new Response(null, { headers });
}

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
      console.error('/data 处理失败:', error);
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

      // 优化：一次 API 调用获取行号和当前 PV 状态
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
      console.error('/verify 处理失败:', error);
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

      const result = { exists: null, acceptingResponses: null, title: null, linkedLikely: null, supported: false };

      const normalized = normalizeGoogleFormUrl(formUrl);
      if (normalized) {
        result.supported = true;

        let response = null;
        try {
          response = await fetch(normalized, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
        } catch (e) {
          console.error('/form-check 表单页获取失败:', e);
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
            console.error('/form-check 表格检查失败:', e);
            result.linkedLikely = null;
          }
        }
      }

      return jsonResponse(result, 200, { 'Cache-Control': 'public, max-age=30' });
    } catch (error) {
      console.error('/form-check 处理失败:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  }

  return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
}
