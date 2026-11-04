// Google Sheets 读写封装：读取名单、定位 Agent 行、写回 PV 状态、列出工作表标题。
import { SHEET_COLUMNS } from './config.js';
import { getAccessToken } from './google-auth.js';
import { assertGoogleResponse } from './google-errors.js';

// 获取 Google Sheets 数据；支持 range 参数，避免不必要的数据传输
export async function getSheetData(spreadsheetId, sheetName, range = 'A1:L2000') {
  const token = await getAccessToken();
  // 工作表名经 URL 编码，兼容含空格/中文的名称（A1 记法里的 ! 分隔符不编码）
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${range}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  await assertGoogleResponse(response, `读取表格 ${spreadsheetId}/${sheetName}`);

  const data = await response.json();
  return data.values || [];
}

// 一次性获取 A 到 E 列，既能找到行号，也能拿到当前的 PV 状态
export async function findAgentInfo(spreadsheetId, sheetName, agentName) {
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

// 读取表格全部工作表标题（用于检测「表单响应」tab 是否存在）
export async function getSheetTitles(spreadsheetId) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await assertGoogleResponse(response, `列出表格 ${spreadsheetId} 的工作表`);
  const data = await response.json();
  return (data.sheets || []).map(s => s.properties && s.properties.title).filter(Boolean);
}

// 更新 Google Sheets 中的字段
export async function updateSheetCell(spreadsheetId, sheetName, rowIndex, colLetter, value) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${colLetter}${rowIndex}?valueInputOption=RAW`;

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

  await assertGoogleResponse(response, `写入 ${spreadsheetId}/${sheetName}!${colLetter}${rowIndex}`);

  return 'Update successful';
}
