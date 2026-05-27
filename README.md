# IFSNext

IFSNext 是一个旨在辅助 Ingress 游戏中的 Ingress First Saturday (IFS) 活动进行签到管理的现代化 Web 应用。

本项目包含两个主要部分：
1. **Frontend**: 基于 Vue 3 + Vite 的现代化前端应用，部署于 Cloudflare Pages。
2. **Backend**: 基于 Cloudflare Workers 的后端服务，负责与 Google Sheets API 交互。

## ✨ 核心亮点

- 🚀 **无服务器架构**: 基于 Cloudflare Workers，全球边缘节点低延迟响应
- 📱 **PWA 支持**: 支持离线访问与「添加到桌面」安装，弱网环境仍可正常使用
- 🌍 **国际化**: 支持简体中文和 English，基于 Vue I18n 动态切换
- 🔥 **高并发支持**: 成功支撑 200 人规模的线下活动高并发签到验证
- 📊 **响应式设计**: 基于 Tailwind CSS 实现移动端/桌面端完美适配

## 🏗️ 技术栈

### 前端 (Frontend)
位于 `frontend/` 目录。

*   **框架**: [Vue 3](https://vuejs.org/) (Composition API + `<script setup>`)
*   **构建工具**: [Vite](https://vitejs.dev/) v5+
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
*   Node.js 18+
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

## 📂 项目结构

```
IFSNext/
├── frontend/             # 新版前端应用
│   ├── src/
│   │   ├── components/   # UI 组件 (AppButton, AppInput 等)
│   │   ├── locales/      # 国际化语言包
│   │   └── App.vue       # 主应用组件
│   └── vite.config.ts    # Vite 配置
├── backend/              # Cloudflare Worker 后端代码
└── README.md             # 项目文档
```

## ✨ 主要功能

*   **Agent 查询**: 支持按名称搜索、按阵营/AP/状态排序。
*   **签到管理**: 验证 Agent 是否完成签到 (Passcode Verification)。
*   **自动刷新**: 可配置自动刷新数据的时间间隔。
*   **扫码签到**: 生成签到表单的二维码。
*   **PWA 支持**: 支持安装到桌面/手机，提供原生应用般的体验。
*   **多语言**: 支持 简体中文 和 English。
