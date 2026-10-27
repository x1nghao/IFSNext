// 签到表单检查忽略名单：链接可能不是 Google 表单而是其他引导页，
// 组织者对误报提示点击「忽略」后，本机后续遇到同一链接直接放行。
// 纯函数便于测试：解析容错、去重追加；localStorage 读写由调用方负责。

// 解析 localStorage 中记录的忽略名单；内容缺失或无效时返回空名单
export const parseIgnoredFormUrls = (raw: string | null): string[] => {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
};

// 追加一个链接；已存在或为空则原样返回（同一引用，调用方可据此跳过持久化）
export const addIgnoredFormUrl = (list: string[], url: string): string[] => {
  if (!url || list.includes(url)) return list;
  return [...list, url];
};
