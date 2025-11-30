# IFSNext 项目

这是一个旨在辅助 Ingress 游戏中的 Ingress First Saturday (IFS) 活动进行签到的项目。它包含一个前端应用和一个后端服务，分别部署在 Cloudflare Pages 和 Cloudflare Workers 上.

## 前端 (Frontend)

- **目的**: 提供用户界面，用于 IFS 活动的签到、信息展示等功能。
- **部署**: 部署在 Cloudflare Pages
- **技术栈**: Vue + Tailwind CSS

## 后端 (Backend)

- **目的**: 与 Google Sheets API 交互
- **部署**: 部署在 Cloudflare Workers