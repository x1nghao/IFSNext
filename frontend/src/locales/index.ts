export const messages = {
  'zh-CN': {
    nav: { settings: '设置', operations: '签到', install: '安装' },
    theme: { label: '外观', auto: '自动', light: '浅色', dark: '深色' },
    offline: { banner: '当前离线，展示的是最近一次缓存数据' },
    settings: {
      title: '系统设置',
      language: '语言',
      sheetIdLabel: '表格 ID',
      sheetIdPlaceholder: '输入表格 ID',
      examplePrefix: '例如',
      apiBaseLabel: 'API 地址',
      apiBasePlaceholder: 'https://ifsapi.boki.one',
      apiBaseDefault: '默认: https://ifsapi.boki.one',
      checkinLabel: '表单链接',
      qrHint: '设置后导航栏将显示二维码'
    },
    autorefresh: {
      title: '自动刷新',
      hint: '定时更新数据',
      off: '关闭',
      slow: '慢速 (1分钟)',
      medium: '中速 (10秒)',
      fast: '快速 (3秒)',
      refreshing: '刷新中...'
    },
    search: { placeholder: '搜索 Agent...' },
    stats: {
      total: '总人数',
      checkedIn: '已签到',
      resistance: '抵抗军',
      enlightened: '启蒙军',
      secondsAgo: '更新于 {n} 秒前',
      minutesAgo: '更新于 {n} 分钟前',
      clock: '更新于 {time}'
    },
    sort: { name: '名称', faction: '阵营', ap: 'AP', status: '状态' },
    loading: '加载中...',
    refreshing: '刷新中...',
    refreshData: '刷新',
    loadingData: '数据加载中...',
    empty: { title: '暂无数据', hint: '请加载数据或清除搜索' },
    status: { checkedIn: '已签到', notCheckedIn: '未签到' },
    actions: { check: '签到', uncheck: '撤销' },
    csv: {
      noData: '暂无数据可导出',
      exported: '已导出 {n} 条记录',
      col: { name: 'Agent', faction: '阵营', ap: 'ΔAP', status: '签到状态', modifiedAt: '本地修改时间' }
    },
    data: { title: '数据', export: '导出原始数据', hint: '将当前名单（含排序与筛选结果）导出为 CSV 文件' },
    formCheck: {
      checking: '正在检查表单状态…',
      ok: '表单可访问，正在收集回复',
      closed: '注意：该表单已停止收集回复',
      notfound: '找不到该表单，请检查链接是否正确',
      notlinked: '未在表格中找到「表单响应」工作表，表单可能未关联此表格',
      invalid: '这不是有效的 Google 表单链接',
      failed: '暂时无法检查表单状态'
    },
    list: { countPrefix: '共', countSuffix: '人' },
    saving: '保存中...',
    saveSettings: '保存',
    qr: { title: '签到二维码', linkLabel: '链接：', closeHint: '点击外部关闭', hint: '扫码或点击链接签到' }
  },
  'en-US': {
    nav: { settings: 'Settings', operations: 'Check-in', install: 'Install' },
    theme: { label: 'Appearance', auto: 'Auto', light: 'Light', dark: 'Dark' },
    offline: { banner: 'Offline — showing last cached data' },
    settings: {
      title: 'Settings',
      language: 'Language',
      sheetIdLabel: 'Sheet ID',
      sheetIdPlaceholder: 'Enter Sheet ID',
      examplePrefix: 'e.g.',
      apiBaseLabel: 'API URL',
      apiBasePlaceholder: 'https://ifsapi.boki.one',
      apiBaseDefault: 'Default: https://ifsapi.boki.one',
      checkinLabel: 'Form Link',
      qrHint: 'Shows QR icon in nav bar if set'
    },
    autorefresh: {
      title: 'Auto Refresh',
      hint: 'Update data periodically',
      off: 'Off',
      slow: 'Slow (1m)',
      medium: 'Medium (10s)',
      fast: 'Fast (3s)',
      refreshing: 'Refreshing...'
    },
    search: { placeholder: 'Search Agent...' },
    stats: {
      total: 'Total',
      checkedIn: 'Checked In',
      resistance: 'Resistance',
      enlightened: 'Enlightened',
      secondsAgo: 'Updated {n}s ago',
      minutesAgo: 'Updated {n}m ago',
      clock: 'Updated {time}'
    },
    sort: { name: 'Name', faction: 'Faction', ap: 'AP', status: 'Status' },
    loading: 'Loading...',
    refreshing: 'Refreshing...',
    refreshData: 'Refresh',
    loadingData: 'Loading...',
    empty: { title: 'No Data', hint: 'Load data or clear search' },
    status: { checkedIn: 'Checked In', notCheckedIn: 'Not Checked In' },
    actions: { check: 'Check In', uncheck: 'Undo' },
    csv: {
      noData: 'No data to export',
      exported: 'Exported {n} records',
      col: { name: 'Agent', faction: 'Faction', ap: 'ΔAP', status: 'Status', modifiedAt: 'Modified At' }
    },
    data: { title: 'Data', export: 'Export Raw Data', hint: 'Export the current roster (with sorting and filtering applied) as a CSV file' },
    formCheck: {
      checking: 'Checking form status…',
      ok: 'Form reachable and accepting responses',
      closed: 'Heads up: this form is no longer accepting responses',
      notfound: 'Form not found — please double-check the link',
      notlinked: 'No "Form Responses" tab found in the sheet — the form may not be linked to this spreadsheet',
      invalid: 'This is not a valid Google Forms link',
      failed: 'Form status check unavailable right now'
    },
    list: { countPrefix: 'Total', countSuffix: '' },
    saving: 'Saving...',
    saveSettings: 'Save',
    qr: { title: 'Check-in QR', linkLabel: 'Link:', closeHint: 'Click outside to close', hint: 'Scan or click link' }
  },
  'zh-TW': {
    nav: { settings: '設定', operations: '簽到', install: '安裝' },
    theme: { label: '外觀', auto: '自動', light: '淺色', dark: '深色' },
    offline: { banner: '目前離線，顯示最近一次快取資料' },
    settings: {
      title: '系統設定',
      language: '語言',
      sheetIdLabel: '表格 ID',
      sheetIdPlaceholder: '輸入表格 ID',
      examplePrefix: '例如',
      apiBaseLabel: 'API 地址',
      apiBasePlaceholder: 'https://ifsapi.boki.one',
      apiBaseDefault: '預設: https://ifsapi.boki.one',
      checkinLabel: '表單連結',
      qrHint: '設定後導航欄將顯示二維碼'
    },
    autorefresh: {
      title: '自動重新整理',
      hint: '定時更新數據',
      off: '關閉',
      slow: '慢速 (1分鐘)',
      medium: '中速 (10秒)',
      fast: '快速 (3秒)',
      refreshing: '重新整理中...'
    },
    search: { placeholder: '搜尋 Agent...' },
    stats: {
      total: '總人數',
      checkedIn: '已簽到',
      resistance: '抵抗軍',
      enlightened: '啟蒙軍',
      secondsAgo: '更新於 {n} 秒前',
      minutesAgo: '更新於 {n} 分鐘前',
      clock: '更新於 {time}'
    },
    sort: { name: '名稱', faction: '陣營', ap: 'AP', status: '狀態' },
    loading: '載入中...',
    refreshing: '重新整理中...',
    refreshData: '重新整理',
    loadingData: '數據載入中...',
    empty: { title: '暫無數據', hint: '請載入數據或清除搜尋' },
    status: { checkedIn: '已簽到', notCheckedIn: '未簽到' },
    actions: { check: '簽到', uncheck: '撤銷' },
    csv: {
      noData: '暫無資料可匯出',
      exported: '已匯出 {n} 筆資料',
      col: { name: 'Agent', faction: '陣營', ap: 'ΔAP', status: '簽到狀態', modifiedAt: '修改時間' }
    },
    data: { title: '資料', export: '匯出原始資料', hint: '將目前名單（含排序與篩選結果）匯出為 CSV 檔案' },
    formCheck: {
      checking: '正在檢查表單狀態…',
      ok: '表單可存取，正在收集回覆',
      closed: '注意：該表單已停止收集回覆',
      notfound: '找不到該表單，請檢查連結是否正確',
      notlinked: '未在表格中找到「表單回應」工作表，表單可能未關聯此表格',
      invalid: '這不是有效的 Google 表單連結',
      failed: '暫時無法檢查表單狀態'
    },
    list: { countPrefix: '共', countSuffix: '人' },
    saving: '儲存中...',
    saveSettings: '儲存',
    qr: { title: '簽到二維碼', linkLabel: '連結：', closeHint: '點擊外部關閉', hint: '掃碼或點擊連結簽到' }
  }
}
