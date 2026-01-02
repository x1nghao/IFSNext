export const messages = {
  'zh-CN': {
    nav: { settings: '设置', operations: '签到', install: '安装' },
    settings: {
      title: '系统设置',
      language: '语言',
      sheetIdLabel: 'Google 表格 ID',
      sheetIdPlaceholder: '输入Google Sheets表格ID',
      examplePrefix: '例如',
      apiBaseLabel: '后端API地址',
      apiBasePlaceholder: 'https://ifsapi.boki.one',
      apiBaseDefault: '默认使用测试后端: https://ifsapi.boki.one',
      checkinLabel: '签到表单链接',
      qrHint: '设置后将在导航栏显示二维码图标，方便用户扫描签到'
    },
    autorefresh: {
      title: '自动刷新设置',
      hint: '设置自动刷新可以定期更新数据',
      off: '关闭自动刷新',
      slow: '慢速(1分钟)',
      medium: '中速(10秒)',
      fast: '快速(3秒)',
      refreshing: '刷新中...'
    },
    search: { placeholder: '搜索 Agent 名称...' },
    sort: { name: '名称', faction: '阵营', ap: 'AP', status: '状态' },
    loading: '加载中...',
    refreshing: '刷新中...',
    refreshData: '刷新数据',
    loadingData: '数据加载中...',
    empty: { title: '暂无数据，请先加载数据或调整筛选条件', hint: '也可以尝试刷新或修改搜索条件' },
    status: { checkedIn: '已签到', notCheckedIn: '未签到' },
    actions: { check: '签到', uncheck: '取消签到' },
    list: { countPrefix: '共', countSuffix: '条记录' },
    saving: '保存中...',
    saveSettings: '保存设置',
    qr: { title: '签到表单二维码', linkLabel: '签到表单链接：', closeHint: '点击外部区域关闭', hint: '扫描二维码或点击链接访问签到表单' }
  },
  'en-US': {
    nav: { settings: 'Settings', operations: 'Check-in', install: 'Install' },
    settings: {
      title: 'System Settings',
      language: 'Language',
      sheetIdLabel: 'Google Sheets ID',
      sheetIdPlaceholder: 'Enter Google Sheets ID',
      examplePrefix: 'e.g.',
      apiBaseLabel: 'Backend API Base URL',
      apiBasePlaceholder: 'https://ifsapi.boki.one',
      apiBaseDefault: 'Default test backend: https://ifsapi.boki.one',
      checkinLabel: 'Check-in Form Link',
      qrHint: 'After set, a QR icon appears for scanning the check-in form'
    },
    autorefresh: {
      title: 'Auto Refresh',
      hint: 'Refresh data periodically',
      off: 'Off',
      slow: 'Slow (1 min)',
      medium: 'Medium (10 s)',
      fast: 'Fast (3 s)',
      refreshing: 'Refreshing...'
    },
    search: { placeholder: 'Search agent name...' },
    sort: { name: 'Name', faction: 'Faction', ap: 'AP', status: 'Status' },
    loading: 'Loading...',
    refreshing: 'Refreshing...',
    refreshData: 'Refresh Data',
    loadingData: 'Loading data...',
    empty: { title: 'No data. Load or change filters.', hint: 'Try refreshing or changing search.' },
    status: { checkedIn: 'Checked In', notCheckedIn: 'Not Checked In' },
    actions: { check: 'Check In', uncheck: 'Undo Check-in' },
    list: { countPrefix: 'Total', countSuffix: 'records' },
    saving: 'Saving...',
    saveSettings: 'Save Settings',
    qr: { title: 'Check-in Form QR', linkLabel: 'Form link:', closeHint: 'Click outside to close', hint: 'Scan the QR or click the link to open the form' }
  }
}
