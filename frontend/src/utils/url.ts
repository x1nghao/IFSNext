// 仅放行 http(s) 绝对链接，用于阻止 javascript: 等伪协议注入到 href
export const isSafeHttpUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
