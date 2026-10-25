// 转义单个 CSV 字段：含逗号/引号/换行时用双引号包裹，内部引号翻倍
export const escapeCsvField = (value: string | number | null | undefined): string => {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

// 生成 CSV：CRLF 行尾，字段按需转义
export const buildCsv = (
  headers: Array<string | number | null | undefined>,
  rows: Array<Array<string | number | null | undefined>>
): string => {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\r\n');
};

// 带 UTF-8 BOM 的 CSV（Excel 直接打开不乱码）
export const buildCsvWithBom = (
  headers: Array<string | number | null | undefined>,
  rows: Array<Array<string | number | null | undefined>>
): string => '\uFEFF' + buildCsv(headers, rows);
