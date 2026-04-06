# Render 学习版部署步骤

这份文档适用于当前仓库的学习型部署方案：

- 数据库：Neon 免费版
- 后端：Render 免费 Web Service
- 客户端：本地 Electron

目标是先把整条链路跑通，不追求生产级稳定性。

---

## 方案说明

当前项目已经具备以下条件：

- 后端支持直接读取 `DATABASE_URL`
- Neon 需要的 SSL 已内置支持
- 可以通过 `DB_SYNCHRONIZE=true` 控制自动建表
- 现在新增了健康检查接口 `GET /api/health`

健康检查成功时会返回：

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-04-06T00:00:00.000Z"
}
```

---

## 第一步：准备 Neon 数据库

1. 打开 Neon 控制台。
2. 创建一个新项目，比如 `secure-notes`。
3. 复制 pooled connection string。
4. 保证连接串中带有 `sslmode=require`。

示例：

```env
DATABASE_URL=postgresql://<user>:<password>@<pooled-host>/<database>?sslmode=require
```

更详细的数据库接入说明见 `server/NEON_SETUP.md`。

---

## 第二步：本地验证后端

先在本地确认 Neon 能连通，再去 Render，避免把问题带到云端。

在仓库根目录执行：

```bash
npm --prefix server install
npm --prefix server run test:db
npm --prefix server run dev
```

如果本地启动成功，可以访问：

```text
http://localhost:3000/api/health
```

你应该看到 `status: ok` 和 `database: up`。

---

## 第三步：推送代码到 GitHub

Render 需要从 GitHub 拉代码部署。

1. 创建一个 GitHub 仓库。
2. 把当前项目推上去。
3. 确保 `server/.env` 没有提交。

注意：

- `server/.env` 不应提交
- `render.yaml` 可以提交，它只是部署模板，不含敏感信息

---

## 第四步：在 Render 创建服务

你有两种方式。

### 方式 A：使用 render.yaml

仓库根目录已经生成了 `render.yaml`。

在 Render 中：

1. 选择 New Blueprint Instance。
2. 连接你的 GitHub 仓库。
3. Render 会识别根目录下的 `render.yaml`。
4. 点击创建服务。

然后手动填写环境变量：

- `DATABASE_URL`：Neon 连接串
- `JWT_SECRET`：自定义随机字符串

### 方式 B：手动创建 Web Service

如果你不用 Blueprint，就按下面填写：

- Service Type: Web Service
- Root Directory: `server`
- Runtime: `Node`
- Build Command: `npm install --include=dev && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/api/health`
- Plan: `Free`

环境变量填写：

```text
DATABASE_URL=你的Neon连接串
JWT_SECRET=你自己生成的随机字符串
NODE_ENV=production
DB_SYNCHRONIZE=true
```

这里使用 `NODE_ENV=production`，并单独通过 `DB_SYNCHRONIZE=true` 开启自动建表。这样 Render 上的运行方式更接近真实部署，同时仍然适合你的学习场景。

之所以 build command 要显式加 `--include=dev`，是因为后端构建依赖 `typescript` 等开发依赖；在 `NODE_ENV=production` 的情况下，默认 `npm install` 可能不会安装它们，进而导致 Render 构建失败。

---

## 第五步：验证 Render 后端

部署完成后，Render 会给你一个域名，例如：

```text
https://securenotes-server.onrender.com
```

先访问健康检查：

```text
https://你的服务域名/api/health
```

如果返回：

```json
{
  "status": "ok",
  "database": "up"
}
```

说明 Render 已经成功连上 Neon。

然后再测试注册接口：

```bash
curl -X POST https://你的服务域名/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'
```

如果返回 token 和 userId，说明认证链路正常。

---

## 第六步：让 Electron 客户端连接 Render

当前前端支持通过 `VITE_API_BASE_URL` 切换后端地址。

在仓库根目录创建 `.env.local`：

```env
VITE_API_BASE_URL=https://你的服务域名/api
```

然后在仓库根目录执行：

```bash
npm install
npm run dev
```

这样桌面客户端就会请求 Render 上的后端，而不是本地 `localhost:3000`。

---

## 第七步：完成一次完整验证

建议你按这个顺序检查：

1. Electron 客户端启动成功。
2. 可以注册账号。
3. 可以登录。
4. 可以创建笔记。
5. 可以执行同步。
6. Render 日志里能看到请求。
7. Neon 控制台里能看到 `users`、`notes`、`images` 表和数据。

---

## 你现在要记住的两个限制

### 1. 免费 Render 会冷启动

这对你当前学习用途不是问题，但第一次请求会慢一点。

### 2. 现在先不要关闭 `DB_SYNCHRONIZE`

因为当前项目还没有 migration。你现在的学习方案依赖自动建表，等后面你想认真长期用，再补 migration，然后再把 `DB_SYNCHRONIZE` 改成 `false`。

---

## 下一步建议

当你完成这套学习部署后，再做下面两件事会比较合理：

1. 给后端补一个 migration 方案
2. 再把 Render 环境里的 `DB_SYNCHRONIZE` 改成 `false`