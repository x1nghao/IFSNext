// 服务账号的配置信息
// 注意：GOOGLE_PRIVATE_KEY 和 GOOGLE_CLIENT_EMAIL 应在 Cloudflare Worker 的环境变量中设置
const SERVICE_ACCOUNT_INFO = {
  private_key: (typeof GOOGLE_PRIVATE_KEY !== 'undefined' ? GOOGLE_PRIVATE_KEY : '').replace(/\\n/g, '\n'),
  client_email: typeof GOOGLE_CLIENT_EMAIL !== 'undefined' ? GOOGLE_CLIENT_EMAIL : '',
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
    const error = await response.text();
    throw new Error(`获取访问令牌失败: ${response.status} ${error}`);
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
    throw new Error(`获取数据失败: ${response.status} ${error}`);
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

// 更新 Google Sheets 中的字段
async function updateSheetCell(spreadsheetId, sheetName, rowIndex, colLetter, value) {
  const token = await getAccessToken();
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
    throw new Error(`更新失败: ${response.status} ${error}`);
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
        return new Response(cachedResponse.body, { ...cachedResponse, headers });
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
      return jsonResponse({ error: error.message }, 500);
    }
  }

  // 路由: 验证/切换状态
  if (url.pathname === '/verify' && method === 'POST') {
    try {
      const agent_name = url.searchParams.get('agent_name');
      if (!agent_name) {
        return jsonResponse({ error: 'Missing agent_name' }, 400);
      }

      // 优化：一次 API 调用获取行号和当前 PV 状态
      const agentInfo = await findAgentInfo(spreadsheetId, sheetName, agent_name);

      if (!agentInfo) {
        return jsonResponse({ error: 'Agent not found' }, 404);
      }

      const { rowIndex, currentPV } = agentInfo;
      
      // 健壮的布尔值切换逻辑
      const isTrue = String(currentPV).toUpperCase() === "TRUE";
      const newValue = !isTrue;

      const updateResult = await updateSheetCell(spreadsheetId, sheetName, rowIndex, "A", newValue);

      // 如果更新成功，清除 /data 接口的缓存
      event.waitUntil(cache.delete(dataCacheKey));

      return jsonResponse({ status: 'success', message: updateResult, new_value: newValue });
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  }

  return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
}
