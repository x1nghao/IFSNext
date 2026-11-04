// Google API 错误映射：把常见失败状态翻译成可行动提示——组织者看一眼就知道下一步改什么。
// 原始响应体只进 Workers 日志，不对外（可能包含服务账号邮箱等敏感信息）。

export function describeGoogleApiError(status, context) {
  if (status === 401) {
    return `服务账号凭据被 Google 拒绝（401）：请检查环境变量 GOOGLE_PRIVATE_KEY 与 GOOGLE_CLIENT_EMAIL（${context}）`;
  }
  if (status === 403) {
    return `无权访问该表格（403）：请在 Google 表格「共享」中把服务账号邮箱添加为编辑者（${context}）`;
  }
  if (status === 404) {
    return `找不到表格或工作表（404）：请核对表格 ID 与工作表名称是否正确（${context}）`;
  }
  if (status === 429) {
    return `Google Sheets API 频率限制，请稍后再试（${context}）`;
  }
  return `Google Sheets API 请求失败: HTTP ${status}（${context}）`;
}

// 统一的 Google API 响应校验：失败时记录完整现场并抛出带修复建议的错误
export async function assertGoogleResponse(response, context) {
  if (response.ok) return;
  const detail = await response.text();
  console.error(`[google-api] ${context} 失败: HTTP ${response.status}`, detail);
  throw new Error(describeGoogleApiError(response.status, context));
}
