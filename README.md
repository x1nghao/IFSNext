# IFSNext

IFSNext 是一个旨在辅助 Ingress 游戏中的 Ingress First Saturday (IFS) 活动进行签到管理的现代化 Web 应用。

本项目包含两个主要部分：
1. **Frontend**: 基于 Vue 3 + Vite 的现代化前端应用，部署于 Cloudflare Pages。
2. **Backend**: 基于 Cloudflare Workers 的后端服务，负责与 Google Sheets API 交互。

## ✨ 核心亮点

- 🚀 **无服务器架构**: 基于 Cloudflare Workers，全球边缘节点低延迟响应
- 📱 **PWA 支持**: 支持离线访问与「添加到桌面」安装，弱网环境仍可正常使用
- 🌍 **国际化**: 支持简体中文、繁體中文和 English，基于 Vue I18n 动态切换
- 🔥 **高并发支持**: 成功支撑 200 人规模的线下活动高并发签到验证
- 📊 **响应式设计**: 基于 Tailwind CSS 实现移动端/桌面端完美适配

## 🏗️ 技术栈

### 前端 (Frontend)
位于 `frontend/` 目录。

*   **框架**: [Vue 3](https://vuejs.org/) (Composition API + `<script setup>`)
*   **构建工具**: [Vite](https://vitejs.dev/) v5+ (rolldown-vite)
*   **语言**: [TypeScript](https://www.typescriptlang.org/) v5+
*   **样式**: [Tailwind CSS v4](https://tailwindcss.com/)
*   **PWA**: [Vite Plugin PWA](https://vite-pwa-org.netlify.app/) (支持离线访问与安装)
*   **国际化**: [Vue I18n](https://vue-i18n.intlify.dev/) v9+

### 后端 (Backend)
位于 `backend/` 目录。

*   **平台**: [Cloudflare Workers](https://workers.cloudflare.com/)
*   **功能**: 代理并优化 Google Sheets API 请求，提供数据查询与签到验证接口
*   **优势**: 全球边缘节点部署，低延迟响应，支持高并发场景

## 🚀 快速开始 (前端)

### 环境要求
*   Node.js 26（本地与 CI 验证版本；测试使用 Node 原生 type-stripping 运行 TypeScript）
*   npm

### 安装依赖

```bash
cd frontend
npm install
```

### 开发环境运行

```bash
npm run dev
```

### 生产环境构建

```bash
npm run build
```

构建产物位于 `frontend/dist` 目录。

## 🧪 测试

仓库根目录运行（无需额外依赖，使用 Node 原生 `node --test`）：

```bash
npm test
```

覆盖内容：
*   `backend/worker.test.mjs` — Worker 路由与守卫逻辑（白名单 403、缺参 400、CORS 预检等，离线运行）
*   `frontend/src/utils/*.test.ts` — 前端纯逻辑（排序/筛选、表格 ID 提取、修改时间存储迁移、语言检测、URL 安全校验）

## 🛠️ 后端部署 (Cloudflare Workers)

后端是单文件 Worker（`backend/worker.js`），仓库已含部署配置 `backend/wrangler.toml`（指向线上 Worker `ifsbackend`，`keep_vars = true` 保留 Dashboard 配置的变量）。部署：

```bash
cd backend
npx wrangler deploy
```

也可以粘贴到 Cloudflare Dashboard 在线编辑器部署。

### 环境变量（Worker Settings → Variables）

| 变量 | 必填 | 说明 |
|------|------|------|
| `GOOGLE_PRIVATE_KEY` | ✅ | Google 服务账号私钥（PKCS8 PEM，`\n` 转义换行） |
| `GOOGLE_CLIENT_EMAIL` | ✅ | 服务账号邮箱 |
| `ALLOWED_SPREADSHEET_IDS` | ❌ | 逗号分隔的表格 ID 白名单。**生产环境强烈建议设置**：设置后仅允许访问列表内的表格，防止 Worker 被当作开放代理读取/写入服务账号可见的任意表格；留空则不限制（向后兼容） |

服务账号需要对目标表格拥有编辑权限（通过表格「共享」添加服务账号邮箱）。

### API

*   `GET /data?spreadsheet_id=<id>&sheet_name=<tab>` — 返回名单（默认 tab 为 `Data`；读取 A1:L2000 范围，服务端边缘缓存 10 秒）
*   `POST /verify?spreadsheet_id=<id>&agent_name=<name>&sheet_name=<tab>` — 切换该 Agent 的签到状态（A 列 TRUE/FALSE），成功后主动失效 `/data` 缓存

## 📂 项目结构

```
IFSNext/
├── frontend/                 # 新版前端应用
│   ├── src/
│   │   ├── components/       # UI 组件 (AppButton, AppInput 等)
│   │   ├── locales/          # 国际化语言包 (zh-CN / zh-TW / en-US)
│   │   ├── types/            # 共享类型定义 (Agent, Log)
│   │   ├── utils/            # 纯逻辑模块与单元测试
│   │   └── App.vue           # 主应用组件
│   └── vite.config.ts        # Vite 配置
├── backend/                  # Cloudflare Worker 后端代码与路由测试
├── .github/workflows/ci.yml  # CI（测试 + 构建）
└── README.md                 # 项目文档
```

## ✨ 主要功能

*   **Agent 查询**: 支持按名称搜索、按阵营/AP/状态排序。
*   **签到管理**: 验证 Agent 是否完成签到 (Passcode Verification)。
*   **自动刷新**: 可配置自动刷新数据的时间间隔。
*   **扫码签到**: 生成签到表单的二维码。
*   **PWA 支持**: 支持安装到桌面/手机，提供原生应用般的体验。
*   **多语言**: 支持 简体中文、繁體中文 和 English。
