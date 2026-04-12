# SecureNotes Google 登录接入指南

这份文档用于一步步完成 SecureNotes 的 Google 登录配置、环境变量填写、本地联调和常见问题排查。

适用场景：

- 本地开发环境接入 Google 登录
- Render 或其他线上环境接入 Google 登录
- 首次测试新 Google 账号登录
- 旧邮箱密码账号切换到 Google 登录

## 0. 先确认费用

只做 Google 账号登录时，通常不需要付费。

- 创建 Google Cloud 项目免费。
- 创建 OAuth Client 免费。
- 使用 openid、email、profile 这三个基础身份范围通常不收费。
- 一般不需要先绑定 Billing。

如果你当前看到的是“$300 免费赠金”“添加支付方式”“税务信息”“免费开始使用吧”这类页面，要区分清楚：

- 那是 Google Cloud 免费试用或结算账户开通流程。
- 它不是创建 OAuth Client 的必经步骤。
- 对本项目这种只做 Google 登录的场景，通常不需要填写卡信息，也不需要先开通付费账户。

需要额外收费的通常是别的 Google Cloud 服务，例如 Gmail API、Drive API、Maps、Vertex AI 等，不是单纯的 Google 登录本身。

## 1. 明确当前项目怎么接 Google 登录

这个项目不是把 Google 直接回调到 Electron，而是三段式流程：

1. Electron 客户端调用后端登录入口。
2. 后端把浏览器重定向到 Google OAuth。
3. Google 授权完成后回调后端地址。
4. 后端再跳回桌面协议 `securenotes://auth/callback`。
5. Electron 接住这个协议并完成登录。

因此，Google Cloud Console 里配置的回调地址必须是后端地址，不是 `securenotes://auth/callback`。

当前实现里，Google 登录成功后会直接进入明文同步模式，不再要求用户额外输入同步口令。

当前服务端实际入口为：

- 启动授权：`GET /api/auth/google/start`
- Google 回调：`GET /api/auth/google/callback`

## 2. 在 Google Cloud Console 创建项目

1. 打开 Google Cloud Console。
   地址：https://console.cloud.google.com/
2. 使用你要测试的 Google 账号登录。
3. 点击顶部项目选择器。
4. 点击“新建项目”。
5. 项目名称可填写：SecureNotes Local。
6. 点击“创建”。
7. 等待项目创建完成后切换到这个新项目。

如果控制台把你带到了“免费试用 / 添加支付方式”页面：

1. 不要急着填卡。
2. 先确认自己是不是点进了 Google Cloud 免费试用开通流程。
3. 返回控制台项目页，再从项目创建或 Credentials 入口进入。
4. 只做 OAuth 登录时，优先走“不启用 Billing”的路径。

可直接尝试这些地址：

- https://console.cloud.google.com/projectcreate
- https://console.cloud.google.com/apis/credentials
- https://console.cloud.google.com/auth/overview

如果你的账号、地区或组织策略仍然强制要求先开通 Billing，那通常不是 OAuth 本身的要求，而是当前控制台入口或账号策略导致的。

## 3. 配置 OAuth Consent Screen

Google 控制台有时显示为 Google Auth Platform，有时仍在 APIs and Services 下，入口名称可能略有不同，但步骤基本一致。

1. 打开“OAuth consent screen”或“Branding / Audience”。
2. User Type 选择 External。
3. 填写应用名称，例如 SecureNotes Dev。
4. 填写用户支持邮箱。
5. 填写开发者联系邮箱。
6. 保存。

建议先保持最小权限范围，不要额外申请敏感权限。

本项目只需要：

- openid
- email
- profile

如果你的项目处于 Testing 状态，需要把你的测试账号加入 Test Users。

## 4. 创建 OAuth Client

1. 打开“Credentials”。
2. 点击“Create Credentials”。
3. 选择“OAuth client ID”。
4. Application type 选择 Web application。
5. 名称可填写：SecureNotes Local Web Callback。

### 本地开发回调地址

在 Authorized redirect URIs 中添加：

http://localhost:3000/api/auth/google/callback

如果你把本地后端换成了别的端口，就把 3000 换成对应端口。

### 线上回调地址

如果后面要测试线上环境，再额外加：

https://你的服务域名/api/auth/google/callback

例如：

https://your-server.onrender.com/api/auth/google/callback

### 不要填写的地址

不要把下面这个写到 Google 的 redirect URI：

securenotes://auth/callback

这个地址是后端回跳桌面客户端用的，不是 Google 直接回调的地址。

6. 点击“Create”。
7. 记录生成的 Client ID 和 Client Secret。

## 5. 填写本地环境变量

编辑 [server/.env](server/.env)，新增下面三项：

```env
GOOGLE_CLIENT_ID=你的 Google Client ID
GOOGLE_CLIENT_SECRET=你的 Google Client Secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

你当前的 [server/.env](server/.env) 里还需要注意两件事：

1. `JWT_SECRET` 目前还是占位值，建议改成随机字符串。
2. `.env` 不要提交到仓库。

如果你要上线到 Render，也要在 Render 的环境变量面板里补同样三项。

## 6. 执行数据库迁移

Google 登录接入后，用户表新增了以下字段：

- googleSub
- emailVerified
- keyVerifier

因此需要执行迁移。

在项目中打开终端，执行：

```powershell
cd server
npm run build
npm run migration:run
```

如果迁移正常完成，就可以继续下一步。

## 7. 启动本地服务

先启动后端：

```powershell
cd server
npm run dev
```

再启动桌面客户端：

```powershell
cd ..
npm run dev
```

如果 Electron 是开发模式，系统浏览器授权完成后会回到桌面客户端。

## 8. 首次联调建议顺序

建议按下面顺序测，能最快定位问题。

### 场景 A：全新 Google 账号

1. 打开登录弹窗。
2. 点击“使用 Google 登录”。
3. 浏览器选择 Google 账号。
4. 授权成功后返回 Electron。
4. 应用会直接完成登录，不再额外要求输入同步口令。
5. 登录成功后检查是否进入已登录状态。
6. 新建笔记并点击同步，确认云端是否有记录。

### 场景 B：旧邮箱密码账号切 Google 登录

如果这个账号历史上已经同步过旧版密文笔记，而你当前设备又没有旧密钥缓存，那么 Google 登录后只能访问新产生的明文同步数据，旧密文内容无法在当前设备直接解密。

最稳妥的迁移方式：

1. 在原来还能正常看到旧笔记的设备上登录一次。
2. 保持应用完成一次云同步。
3. 后续新增或重新同步的内容会逐步转成当前的明文模式。

## 9. 本地自检清单

做真实联调前，逐项确认：

- Google Cloud 项目已创建
- OAuth consent screen 已保存
- 测试账号已加入 Test Users
- OAuth Client 类型是 Web application
- Authorized redirect URI 已配置为 `http://localhost:3000/api/auth/google/callback`
- [server/.env](server/.env) 已填写三项 Google 变量
- [server/.env](server/.env) 中的 `JWT_SECRET` 已替换掉占位值
- 已执行 `npm run migration:run`
- 本地后端运行在 3000 端口
- Electron 客户端已启动

## 10. 常见问题排查

### 10.1 redirect_uri_mismatch

现象：Google 页面报 redirect_uri_mismatch。

处理方法：

1. 检查 [server/.env](server/.env) 中的 `GOOGLE_OAUTH_REDIRECT_URI`。
2. 检查 Google Cloud Console 中 Authorized redirect URIs。
3. 两边必须完全一致，包括：
   - 协议
   - 域名
   - 端口
   - 路径

### 10.2 浏览器登录成功，但没有回到桌面应用

可能原因：

1. Electron 开发实例没有正常运行。
2. 自定义协议没有被系统注册。
3. 浏览器拦截了协议跳转。

处理方法：

1. 先确认 Electron 客户端已启动。
2. 再次点击回调页上的“返回 SecureNotes”按钮。
3. 如果是打包版，确认安装包支持 `securenotes` 协议。

### 10.3 Google 登录成功，但旧笔记没有显示

这通常说明该账号历史上同步过旧版密文内容，而当前设备没有旧密钥缓存。

处理方法：

1. 回到原来还能正常查看这些笔记的设备。
2. 用旧版本可用的密钥完成一次同步。
3. 再回当前设备重新拉取。

### 10.5 Google 页面提示应用未验证

本地测试阶段常见，只要你的测试账号已经加入 Test Users，一般仍可继续测试。

如果未来对外公开使用，再考虑品牌信息和应用验证。

### 10.6 浏览器能打开 Google，但本地回调返回 500 / token exchange failed

这通常不是 OAuth 配置本身错误，而是本地后端访问不到 Google 的 token 接口。

典型现象：

- 浏览器可以正常打开 Google 登录页
- 回调能回到 `http://localhost:3000/api/auth/google/callback`
- 但服务端日志里出现 `fetch failed`、`connect timeout`、`Google token request failed`

常见原因：

- 浏览器走了本地代理
- Node 后端没有走代理

如果你本机使用 Clash、V2Ray、Surge 或类似工具，并且代理监听地址是 `127.0.0.1:7897`，可以在 [server/.env](server/.env) 加：

```env
HTTPS_PROXY=http://127.0.0.1:7897
```

保存后重启后端再试。

如果你的本地代理端口不是 `7897`，把它改成你自己的端口。

## 11. 线上部署补充

如果你把后端部署到 Render：

1. 把线上域名回调地址加入 Google Cloud Console。
2. 在 Render 环境变量中填写：
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - GOOGLE_OAUTH_REDIRECT_URI
3. 线上环境的回调地址要写成实际公网地址。

例如：

```env
GOOGLE_OAUTH_REDIRECT_URI=https://your-server.onrender.com/api/auth/google/callback
```

## 12. 安全建议

1. 不要把 [server/.env](server/.env) 提交到 Git。
2. 不要把 Client Secret 发到聊天群或工单系统。
3. `JWT_SECRET` 使用随机高强度字符串。
4. 如果数据库密码或 Client Secret 泄露，立即旋转。

## 13. 推荐的实际操作顺序

如果你现在就要开始做，按下面执行最快：

1. 在 Google Cloud Console 创建 OAuth Client。
2. 把本地回调地址配成 `http://localhost:3000/api/auth/google/callback`。
3. 把三个 Google 变量写进 [server/.env](server/.env)。
4. 把 `JWT_SECRET` 改掉。
5. 运行 `npm run build` 和 `npm run migration:run`。
6. 启动后端。
7. 启动 Electron。
8. 先测全新 Google 账号。
9. 再测旧邮箱密码账号迁移。

如果你完成到第 3 步，可以直接回来让我继续帮你做联调验证。