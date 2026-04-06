# Neon PostgreSQL 配置指南

## 目标

这份文档用于指导你完成两件事：

1. 在 Neon 控制台创建一个新的 PostgreSQL 项目
2. 让当前项目的 NestJS 后端连接这个数据库

---

## 第一步：在 Neon 创建数据库

1. 打开 Neon 控制台并进入 Create project 弹窗。
2. 在 Project name 填一个项目名，例如 `secure-notes`。
3. Postgres version 保持默认即可。
4. Cloud service provider 任选一个离你更近的区域。你截图里当前选的是 AWS，也可以切到 Azure。
5. Region 选择离应用更近的区域，例如 `AWS US East 1`。
6. Enable Neon Auth 先保持关闭。
7. 点击 Create。

项目创建完成后，进入数据库项目详情页，找到 Connection Details 或 Connection String。

推荐复制 pooled connection string，格式通常类似：

```env
DATABASE_URL=postgresql://<user>:<password>@<pooled-host>/<database>?sslmode=require
```

---

## 第二步：把连接串写入本地环境变量

在 `server` 目录下创建 `.env` 文件，或复制 `.env.example` 为 `.env`，填写你刚才从 Neon 复制的连接串：

```env
DATABASE_URL=postgresql://<user>:<password>@<pooled-host>/<database>?sslmode=require
JWT_SECRET=change-this-to-a-random-secret
PORT=3000
NODE_ENV=development
```

如果你更喜欢拆开配置，也可以使用下面这些变量：

```env
DB_HOST=<pooled-host>
DB_PORT=5432
DB_USER=<user>
DB_PASSWORD=<password>
DB_NAME=<database>
JWT_SECRET=change-this-to-a-random-secret
PORT=3000
NODE_ENV=development
```

说明：

- 当前项目现在优先读取 `DATABASE_URL`
- 如果没有 `DATABASE_URL`，会自动回退到 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`
- `.env` 已被 `.gitignore` 忽略，不会提交到 Git

---

## 第三步：安装依赖并测试连接

在 `server` 目录执行：

```bash
npm install
npm run test:db
```

如果连接成功，你会看到类似输出：

```text
✅ 数据库连接成功!
📊 数据库信息:
   版本: PostgreSQL 17
   数据库: <database>
   用户: <user>
```

---

## 第四步：启动后端并自动建表

继续在 `server` 目录执行：

```bash
npm run dev
```

后端默认启动在 `http://localhost:3000`。

开发环境下，TypeORM 会自动创建数据表，包括：

- `users`
- `notes`
- `images`

---

## 当前项目里的实现方式

数据库连接配置位于以下文件：

1. `server/src/app.module.ts`：后端数据库初始化
2. `server/test-db.ts`：数据库连接测试脚本
3. `server/.env.example`：环境变量示例

当前实现已经包含：

- `DATABASE_URL` 优先支持
- Neon 所需的 SSL 配置
- 本地拆分变量兜底支持
- 开发环境自动建表

---

## 常见问题

### 1. 连接失败

优先检查：

- `.env` 是否放在 `server/.env`
- `DATABASE_URL` 是否来自 Neon 的 pooled connection string
- 连接串里是否包含 `sslmode=require`

### 2. SSL 错误

Neon 需要 SSL。连接串里请保留：

```text
?sslmode=require
```

### 3. 表没有创建

确认 `NODE_ENV` 不是 `production`，因为开发环境下才会自动 `synchronize`。

---

## 安全建议

1. 不要把真实连接串提交到仓库
2. 不要把密码写进文档或截图
3. 生产环境请替换 `JWT_SECRET`
4. 优先使用 Neon 提供的 pooled 连接串，连接更稳定
