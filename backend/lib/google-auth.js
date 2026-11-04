// 服务账号认证：用 JWT（RS256）换取 Google API 访问令牌。
import { getServiceAccountInfo } from './config.js';

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

// 令牌缓存按凭据键控：同一凭据复用令牌直到临期；凭据变更（或测试注入新凭据）自动重新换取，
// 不会把 A 凭据换来的令牌误用到 B 凭据上
const tokenCache = new Map();

// 获取访问令牌；凭据缺失时直接给出可行动报错（先校验再查缓存，凭据缺失永远是配置问题）
export async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const serviceAccount = getServiceAccountInfo();

  if (!serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('缺少 Google 服务账号凭据：请在 Worker 环境变量中配置 GOOGLE_PRIVATE_KEY 与 GOOGLE_CLIENT_EMAIL');
  }

  const cacheKey = `${serviceAccount.client_email}\n${serviceAccount.private_key}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.exp - 60) {
    return cached.token;
  }

  const jwtHeader = {
    alg: "RS256",
    typ: "JWT"
  };

  const jwtClaimSet = {
    iss: serviceAccount.client_email,
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
    pemToArrayBuffer(serviceAccount.private_key),
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
    console.error('[oauth] 换取访问令牌失败: HTTP', response.status, error);
    throw new Error(`获取访问令牌失败: HTTP ${response.status}`);
  }

  const dataResponse = await response.json();
  const token = dataResponse.access_token;
  const exp = now + (dataResponse.expires_in || 3600);
  tokenCache.set(cacheKey, { token, exp });
  return token;
}
