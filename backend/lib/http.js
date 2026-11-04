// HTTP 层：统一 JSON 响应与 CORS 预检。

// 标准化 JSON 响应（默认放开 CORS；生产环境建议修改为特定域名）
export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    },
  });
}

// 处理 CORS 预检请求
export function handleOptions(request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  return new Response(null, { headers });
}
