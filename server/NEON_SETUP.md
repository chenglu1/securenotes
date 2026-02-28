# Neon PostgreSQL 配置指南

## ✅ 已完成配置

你的 Neon 数据库已经配置完成！以下是使用步骤：

---

## 📋 连接信息

你的数据库连接字符串已保存在 `server/.env` 文件中：

```
DATABASE_URL=postgresql://neondb_owner:npg_d7AUQNic3IWG@ep-snowy-haze-ai9kc8ud-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**重要提示**：
- ⚠️ `.env` 文件已添加到 `.gitignore`，不会被提交到 Git
- ⚠️ 请勿在公开场合分享你的数据库密码
- 📝 `.env.example` 是示例文件，可以安全提交

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 测试数据库连接

```bash
npm run test:db
```

或者直接运行测试脚本：

```bash
npx ts-node test-db.ts
```

**预期输出**：
```
✅ 数据库连接成功!
📊 数据库信息:
   版本: PostgreSQL 16
   数据库: neondb
   用户: neondb_owner
```

### 3. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

首次启动时，TypeORM 会自动创建数据表：
- `users` - 用户账户
- `notes` - 加密笔记

---

## 🔧 配置说明

### 已修改的文件

1. **server/.env** - 数据库连接配置（已创建）
2. **server/src/app.module.ts** - 添加了 SSL 支持和环境变量加载
3. **server/package.json** - 添加了 `@nestjs/config` 和 `dotenv`
4. **.gitignore** - 保护敏感信息不被提交

### SSL 配置

Neon 数据库需要 SSL 连接，已在 `app.module.ts` 中配置：

```typescript
ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
```

---

## 📊 数据库管理

### 使用 Neon 控制台

访问 [Neon Console](https://console.neon.tech) 可以：
- 查看数据库状态
- 执行 SQL 查询
- 查看连接统计
- 管理备份

### 使用 pgAdmin 或 DBeaver

你也可以使用桌面客户端连接：

**连接信息**：
- 主机: `ep-snowy-haze-ai9kc8ud-pooler.c-4.us-east-1.aws.neon.tech`
- 端口: `5432`
- 数据库: `neondb`
- 用户名: `neondb_owner`
- 密码: `npg_d7AUQNic3IWG`
- SSL 模式: `require`

---

## 🌐 API 端点

服务器启动后可使用以下端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/auth/register` | POST | 注册新用户 |
| `/auth/login` | POST | 用户登录 |
| `/sync/push` | POST | 推送笔记到云端 |
| `/sync/pull` | GET | 拉取云端更新 |

---

## 🔍 故障排查

### 连接失败

```bash
# 检查环境变量是否加载
cd server
cat .env

# 测试网络连接
ping ep-snowy-haze-ai9kc8ud-pooler.c-4.us-east-1.aws.neon.tech
```

### SSL 错误

确保连接字符串包含 `sslmode=require`：
```
?sslmode=require&channel_binding=require
```

### 表未创建

首次运行时设置 `synchronize: true`（开发环境默认开启）：
```typescript
synchronize: process.env.NODE_ENV !== 'production'
```

---

## 📚 更多资源

- [Neon 文档](https://neon.tech/docs)
- [TypeORM 文档](https://typeorm.io/)
- [NestJS 文档](https://docs.nestjs.com/)

---

## 🔐 安全建议

1. **生产环境**: 在 `.env` 中修改 `JWT_SECRET` 为随机字符串
2. **定期备份**: Neon 免费版有自动备份，付费版可配置保留时长
3. **IP 白名单**: 在 Neon 控制台配置允许访问的 IP（可选）
4. **监控**: 留意 Neon 控制台的连接数和存储使用情况

---

需要帮助？查看项目根目录的 `README.md` 或提交 Issue。
