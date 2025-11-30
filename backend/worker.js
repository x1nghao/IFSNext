// 服务账号的配置信息
const SERVICE_ACCOUNT_INFO = {
  private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: GOOGLE_CLIENT_EMAIL, 
};

// 处理 Base64 编码
function pemToArrayBuffer(pem) {
  // 清理私钥中的换行符和其他格式字符
  const b64Lines = pem.replace("-----BEGIN PRIVATE KEY-----", '')
                      .replace("-----END PRIVATE KEY-----", '')
                      .replace(/\n/g, ''); // 移除换行符
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
    encoder.encode(data) // 确保编码为 ArrayBuffer
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
async function getSheetData(spreadsheetId, sheetName) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:Z1000`;

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
  return data.values;
}

// 更新 Google Sheets 中的字段
async function updateSheetCell(spreadsheetId, sheetName, rowIndex, colIndex, value) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${colIndex}${rowIndex}?valueInputOption=RAW`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: `${sheetName}!${colIndex}${rowIndex}`,
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
    "Access-Control-Allow-Origin": "*", // 允许所有来源，生产环境应限制为特定域名
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // 缓存预检请求结果 24 小时
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
  if (url.pathname === '/data' && method === 'GET') {
    try {
      const cacheKey = `${spreadsheetId}:${sheetName}`;
      const cachedEntry = __data_cache.get(cacheKey);
      const nowMs = Date.now();
      if (cachedEntry && (nowMs - cachedEntry.time) < 10000) {
        return new Response(JSON.stringify(cachedEntry.data), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=10' },
        });
      }
      const sheetData = await getSheetData(spreadsheetId, sheetName);
      const filteredData = sheetData.slice(1).map(row => ({
        PV: row[0],
        AgentFaction: row[2],
        AgentName: row[4],
        APdiff: row[11]
      })).filter(row => row.AgentName);
      __data_cache.set(cacheKey, { data: filteredData, time: nowMs });
      return new Response(JSON.stringify(filteredData), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=10' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (url.pathname === '/verify' && method === 'POST') {
    try {
      const agent_name = url.searchParams.get('agent_name');
      const sheetData = await getSheetData(spreadsheetId, sheetName);
      const rowIndex = sheetData.findIndex(row => row[4] === agent_name) + 1;  // 找到该代理的行索引
      if (rowIndex === 0) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const currentValue = sheetData[rowIndex - 1][0];
      const newValue = currentValue === "TRUE" ? "FALSE" : "TRUE";

      const updateResult = await updateSheetCell(spreadsheetId, sheetName, rowIndex, "A", newValue);

      return new Response(JSON.stringify({ status: 'success', message: updateResult }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
}