// 历史场次：自动记录成功加载过的表格 ID，供设置页一键切换。
// 纯函数便于测试：置顶去重、容量裁剪。
export interface SheetRecent {
  id: string;
  lastUsed: number;
}

// 记录一次使用：已有则置顶并更新时间，无则插入队首；超出容量裁掉最旧的
export const upsertSheetRecent = (list: SheetRecent[], id: string, ts: number, cap = 6): SheetRecent[] => {
  if (!id) return list;
  const rest = list.filter(r => r.id !== id);
  return [{ id, lastUsed: ts }, ...rest].slice(0, cap);
};

export const removeSheetRecent = (list: SheetRecent[], id: string): SheetRecent[] =>
  list.filter(r => r.id !== id);
