# SecureNotes

离线优先、支持云同步的 Electron 笔记应用。当前已经验证通过以下链路：

- 本地 Electron 编辑与保存
- Render 上的 NestJS 后端部署
- Neon PostgreSQL 云端同步
- 打包生产构建默认连接 Render

## 当前状态

- 本地数据库：sql.js SQLite，保存在用户目录
- 云端后端：Render
- 云端数据库：Neon PostgreSQL
- 认证：JWT + bcrypt，可选 Google OAuth 桌面登录
- 同步：已验证 Electron -> Render -> Neon 成功
- 图片上传：已接入服务端接口
- 实时协作与端到端加密：尚未实现

## 快速开始

### 本地开发

1. 安装根目录依赖

```bash
npm install
```

2. 配置后端数据库

参见 [server/NEON_SETUP.md](./server/NEON_SETUP.md)。

如果要接入 Google 登录，参见 [server/GOOGLE_LOGIN_SETUP.md](./server/GOOGLE_LOGIN_SETUP.md)。

3. 启动后端

```bash
cd server
npm install
npm run dev
```

如果要启用 Google 登录，还需要在 `server/.env` 中补齐以下变量：

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

同时在 Google Cloud Console 的 OAuth Client 中把回调地址配置为同一个值。

4. 启动 Electron 客户端

```bash
cd ..
npm run dev
```

### 验证云同步

1. 在客户端注册或登录账号
2. 新建一条笔记
3. 点击左下角“云同步”
4. 在 Neon 控制台检查 `notes` 表是否出现新记录

## 生产打包

根目录的 [.env.production](./.env.production) 用于打包时注入线上 API 地址。

当前默认配置为：

```env
VITE_API_BASE_URL=https://securenotes-server.onrender.com/api
```

执行下面命令会生成生产构建，并让打包后的客户端默认连接 Render：

```bash
npm run build
```

说明：当前已经验证 `vite build` 和 Electron 生产资源构建通过；如果 `electron-builder` 在 Windows 上失败，需要单独处理打包层问题。

## Render 部署

仓库根目录的 [render.yaml](./render.yaml) 可直接用于 Render Blueprint 部署。

Render 运行时需要的关键环境变量：

- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI=https://<your-server-domain>/api/auth/google/callback`
- `NODE_ENV=production`
- `DB_SYNCHRONIZE=true`

后端健康检查地址：

```text
/api/health
```

## Google 登录说明

- Electron 客户端会通过系统浏览器发起 Google OAuth，浏览器完成授权后通过 `securenotes://auth/callback` 返回桌面应用。
- 当前 Google 登录默认走明文同步模式，不再额外要求输入同步口令。
- 这意味着服务端数据库中可以直接看到标题与正文内容，不再提供原先的客户端加密保护。
- 如果某个旧账号的历史云端笔记仍是旧版密文格式，需要在原设备保留旧密钥的情况下同步一次，才能逐步迁移为明文。

## 项目结构

```text
electron-vite-boilerplate/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc-handlers.ts
│   ├── tray.ts
│   └── database/
│       ├── connection.ts
│       └── repositories/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── auth/
│   │   ├── editor/
│   │   └── layout/
│   ├── services/
│   │   ├── api.ts
│   │   └── mockApi.ts
│   ├── stores/
│   │   └── noteStore.ts
│   └── styles/
├── server/
│   ├── .env.example
│   ├── NEON_SETUP.md
│   ├── test-db.ts
│   └── src/
│       ├── app.module.ts
│       ├── main.ts
│       ├── auth/
│       ├── sync/
│       ├── upload/
│       ├── health/
│       ├── collaboration/
│       └── entities/
├── .env.production
├── render.yaml
├── electron-builder.json5
└── package.json
```

## 保留文档

- [server/NEON_SETUP.md](./server/NEON_SETUP.md)：Neon 数据库接入说明
- [server/GOOGLE_LOGIN_SETUP.md](./server/GOOGLE_LOGIN_SETUP.md)：Google 登录接入步骤

README 保留为唯一的项目入口说明，避免多份文档重复维护。
