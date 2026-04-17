# SecureNotes Copilot Instructions

在本仓库中协作开发时，默认遵循 [DEVELOPMENT_GUIDELINES.md](../DEVELOPMENT_GUIDELINES.md)。

执行时优先遵守以下规则：

1. 先明确目标、边界和验收标准，再动手修改代码。
2. 优先最小改动，不做与当前任务无关的重构或清理。
3. 保持 Electron 的 main / preload / renderer 分层，不让渲染层直接依赖 Electron 或 Node 能力。
4. 渲染层访问本地能力时，优先通过 `window.api` 和 IPC。
5. 保持笔记列表 summary 与详情读取分离，不把完整正文重新塞回侧栏列表数据。
6. 后端沿用 NestJS + TypeORM 方案；未经明确决策，不引入 Prisma、Drizzle 或新的状态管理框架。
7. 认证路由保持在 `/api/auth`，笔记资源保持在 `/api/notes`，避免无收益的接口漂移。
8. 涉及同步、事务、锁、版本推进、冲突处理的改动属于高风险区域，先给方案，再实现，并重点验证。
9. UI 修改优先延续现有产品风格；不要为了单点问题重写全局样式。
10. 改动完成后，运行与任务相关的类型检查、构建、测试或人工验证，并在说明中写清验证结果。