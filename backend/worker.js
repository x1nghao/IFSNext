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
async function getSheetData(spreadsheetId, sheetName, range = 'A1:Z1000') {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${range}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`获取数据失败: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.values || [];
}

// 优化：仅查找代理名称所在的行，而不是拉取整个表格
async function findAgentRowIndex(spreadsheetId, sheetName, agentName) {
  // 假设 Agent Name 在 E 列 (索引 4)，我们只获取这一列
  // 注意：API 范围是 E:E，返回的数据将是一个数组的数组，每个内部数组包含一个值
  const nameColumnData = await getSheetData(spreadsheetId, sheetName, 'E:E');
  
  // 查找匹配的行索引 (行号 = 索引 + 1)
  // 忽略大小写进行比较可能更健壮，但这里保持严格匹配以符合原逻辑
  const index = nameColumnData.findIndex(row => row[0] === agentName);
  
  return index !== -1 ? index + 1 : 0;
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
    const error = await response.text();
    throw new Error(`更新失败: ${response.status} ${error}`);
  }

  return 'Update successful';
}

// Cloudflare Worker 入口
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
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

const __data_cache = new Map();

async function handleRequest(request) {
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

  // 路由: 获取数据
  if (url.pathname === '/data' && method === 'GET') {
    try {
      const cacheKey = `${spreadsheetId}:${sheetName}`;
      const cachedEntry = __data_cache.get(cacheKey);
      const nowMs = Date.now();
      
      // 缓存策略：10秒缓存
      if (cachedEntry && (nowMs - cachedEntry.time) < 10000) {
        return jsonResponse(cachedEntry.data, 200, { 'Cache-Control': 'public, max-age=10' });
      }

      // 获取数据 (依然获取 A-Z 列以保留原始逻辑的完整性，但可以通过调整 getSheetData 参数优化)
      const sheetData = await getSheetData(spreadsheetId, sheetName);
      
      const filteredData = sheetData.slice(1).map(row => ({
        PV: row[SHEET_COLUMNS.PV],
        AgentFaction: row[SHEET_COLUMNS.FACTION],
        AgentName: row[SHEET_COLUMNS.NAME],
        APdiff: row[SHEET_COLUMNS.AP_DIFF]
      })).filter(row => row.AgentName); // 过滤掉没有名字的空行

      __data_cache.set(cacheKey, { data: filteredData, time: nowMs });
      
      return jsonResponse(filteredData, 200, { 'Cache-Control': 'public, max-age=10' });
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

      // 优化：只获取需要的那一列来查找行号，极大减少数据传输
      const rowIndex = await findAgentRowIndex(spreadsheetId, sheetName, agent_name);

      if (rowIndex === 0) {
        return jsonResponse({ error: 'Agent not found' }, 404);
      }

      // 获取当前状态 (只获取该单元格)
      // 注意：这里需要单独获取一次当前值，因为 findAgentRowIndex 没返回 PV 列的数据
      const pvCellData = await getSheetData(spreadsheetId, sheetName, `A${rowIndex}`);
      const currentValue = pvCellData.length > 0 && pvCellData[0].length > 0 ? pvCellData[0][0] : "FALSE";
      
      // 健壮的布尔值切换逻辑
      const isTrue = String(currentValue).toUpperCase() === "TRUE";
      const newValue = !isTrue;

      const updateResult = await updateSheetCell(spreadsheetId, sheetName, rowIndex, "A", newValue);

      // 如果更新成功，清除缓存以确保下次获取 /data 是最新的
      const cacheKey = `${spreadsheetId}:${sheetName}`;
      __data_cache.delete(cacheKey);

      return jsonResponse({ status: 'success', message: updateResult, new_value: newValue });
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  }

  return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
}
