# Finance News Digest Design

## 1. Goal

在当前 SecureNotes Electron 应用中新增一套"每日财经热点提醒"能力，满足以下需求：

- 每天定时抓取财经热点新闻，默认产出 10 条。
- 对多语言新闻做统一分析与中文自然语言转写。
- 使用大模型对候选新闻进行聚合、排序、翻译、摘要和提醒文案生成。
- 通过桌面通知和应用内摘要提醒用户。
- 将结果持久化，便于查看当日摘要和后续扩展历史回顾。

本设计优先面向当前仓库的 Electron 客户端实现 MVP，不依赖现有 NestJS 服务端新增调度能力。

## 2. Why Local First

当前项目已经具备以下基础：

- Electron 主进程长期驻留，关闭主窗口后应用仍在托盘中运行。
- 主进程已经管理本地 SQLite 数据库、托盘菜单和 IPC。
- 渲染进程已有 React + Zustand + Ant Design 页面结构。
- 本地 secure store 已可用于安全保存认证信息和密钥。

因此，第一阶段最合适的落点是：

- 在 Electron 主进程实现新闻抓取和定时任务。
- 在本地数据库存储新闻候选项、分析结果和每日摘要。
- 使用本地通知能力推送提醒。

这样可以先解决"应用运行时每天提醒我"的场景，复杂度最低，落地最快。

## 3. Scope

### 3.1 MVP Scope

- 支持 3 到 5 个财经新闻源。
- 每日固定时间抓取最近新闻候选。
- 对候选新闻做去重和规则预筛。
- 调用一个大模型完成热点精排、中文翻译、中文摘要和提醒文案生成。
- 产出当日 10 条热点摘要。
- 发出桌面提醒。
- 在应用内查看"今日财经热点"结果。

### 3.2 Out of Scope

- 不抓取新闻全文正文。
- 不实现服务器端统一推送。
- 不实现手机推送。
- 不实现复杂的个性化推荐算法。
- 不实现跨设备同步新闻摘要。

## 4. Functional Requirements

### 4.1 Inputs

- 新闻源配置。
- 每日抓取时间。
- 热点条数，默认 10。
- 大模型提供商配置。
- 大模型 API Key。

### 4.2 Outputs

- 每日 10 条财经热点。
- 每条新闻的中文标题、中文摘要、来源、时间、原文链接。
- 桌面提醒文案。
- 应用内可查看的当日热点摘要。

### 4.3 User Actions

- 手动立即抓取。
- 查看今日摘要。
- 启用或关闭每日提醒。
- 设置抓取时间。
- 配置大模型 API Key。

## 5. Non-Functional Requirements

- 本地优先，不依赖服务端常驻调度。
- 单次抓取在 30 秒内完成，网络异常时不阻塞应用主流程。
- 同一天默认只发送一次正式提醒。
- 对同一条新闻避免重复通知。
- 对大模型结果做 JSON 校验，避免污染存储层。

## 6. High-Level Architecture

```text
RSS / News API sources
        |
        v
Electron news scheduler
        |
        v
Candidate fetch + normalize + dedupe
        |
        v
LLM analysis service
        |
        +--> Chinese title / summary / alert copy
        +--> heat score / category / market impact
        |
        v
Digest persistence (SQLite)
        |
        +--> desktop notification
        +--> tray actions
        +--> renderer digest panel / modal
```

## 7. Data Sources

### 7.1 Recommended Source Strategy

优先使用合法、稳定、结构化的数据源：

- RSS feed
- 官方公开新闻 API
- 聚合接口返回的标题和摘要

不建议在 MVP 阶段直接抓取新闻网页正文，原因：

- HTML 结构不稳定。
- 成本高且容易被封。
- 版权和使用边界更复杂。
- 当前需求只需要标题、摘要、链接和时间。

### 7.2 Candidate Sources

英文：

- Reuters Business / Markets
- CNBC Markets
- MarketWatch Top Stories
- Yahoo Finance News

中文：

- 第一财经
- 华尔街见闻
- 新浪财经快讯
- 证券时报

说明：最终接入哪些源，需要以是否存在可稳定获取的 RSS 或结构化接口为准。

## 8. Processing Pipeline

### 8.1 Step 1: Fetch Candidates

每个源抓取最近 20 到 30 条候选新闻，抽取以下字段：

- source
- sourceType
- title
- summary
- url
- publishedAt
- languageGuess

### 8.2 Step 2: Normalize

归一化规则：

- 标题去除多余空格。
- 链接去追踪参数。
- 发布时间统一为 ISO string。
- 语言做轻量初判。

### 8.3 Step 3: Rule-Based Dedupe

先做非模型去重，降低大模型输入成本：

- 相同 URL 去重。
- 归一化标题完全相同去重。
- 标题相似度高于阈值时聚类。

### 8.4 Step 4: Rule-Based Pre-Ranking

为每条候选新闻计算基础分：

- recencyScore
- sourceWeight
- clusterSizeWeight

保留前 20 到 30 条交给大模型精排，避免把全部原始新闻都送给模型。

### 8.5 Step 5: LLM Analysis

由大模型完成：

- 识别同一事件是否值得进入今日前 10。
- 判断新闻类别，如宏观、监管、股市、公司、外汇、商品。
- 判断市场影响方向和重要性。
- 将非中文内容翻译为自然中文。
- 生成简明中文标题和中文摘要。
- 生成通知提醒文案。

### 8.6 Step 6: Final Selection

最终排序建议采用混合评分：

```text
finalScore = 0.35 * ruleScore + 0.65 * llmHeatScore
```

再加两条约束：

- 来源多样性约束，避免 10 条都来自同一媒体。
- 类别平衡约束，避免全是单一公司快讯。

### 8.7 Step 7: Persist + Notify

保存：

- 当日 digest
- digest items
- 原始候选分析结果

提醒：

- 桌面通知显示最重要的 1 到 3 条。
- 应用内显示完整 10 条摘要。

## 9. Role of the LLM

大模型不负责"抓新闻"，只负责"理解新闻"。

具体职责如下：

1. 翻译
将英文或其他语言标题、摘要翻译成自然中文。

2. 聚合
判断不同来源是否在报道同一事件。

3. 热点判断
判断某条新闻是否值得进入今日前 10。

4. 财经语境摘要
用简洁、自然的财经中文表达事件含义。

5. 通知文案生成
将重点新闻改写成适合系统通知的短句。

## 10. Model Provider Design

### 10.1 Provider Abstraction

定义统一接口：

```ts
interface NewsAnalysisProvider {
  analyzeCandidates(input: AnalyzeNewsCandidatesInput): Promise<AnalyzeNewsCandidatesResult>
}
```

### 10.2 Initial Providers

- Gemini Developer API
- OpenRouter

### 10.3 Recommended Defaults

如果强调稳定和结构化输出：

- Gemini 2.5 Flash

如果强调中文表达和低成本测试：

- OpenRouter + z-ai/glm-4.5-air:free

## 11. Prompt and Output Schema

### 11.1 Prompt Principles

- 只能基于输入新闻数据分析。
- 不允许补充外部事实。
- 信息不足时明确返回不确定。
- 输出必须是严格 JSON。
- 中文表达必须自然、简洁、财经语境准确。

### 11.2 Prompt Template

```text
你是一个财经新闻分析助手。你将收到一组新闻候选项。

任务：
1. 判断每条新闻是否值得进入今日前 10 热点。
2. 给出 0-100 的热度分数。
3. 如果原文不是中文，翻译成自然中文。
4. 输出简洁的中文标题和 1-2 句中文摘要。
5. 生成适合桌面提醒的中文通知文案。
6. 仅基于提供的数据，不得编造外部事实。
7. 输出严格 JSON，不要输出 JSON 之外的文字。
```

### 11.3 JSON Schema

```json
{
  "items": [
    {
      "candidateId": "string",
      "include": true,
      "heatScore": 88,
      "category": "macro|equity|forex|commodity|company|policy|other",
      "marketImpact": "high|medium|low",
      "marketBias": "positive|negative|mixed|neutral",
      "titleZh": "string",
      "summaryZh": "string",
      "alertTextZh": "string",
      "reasonZh": "string"
    }
  ]
}
```

### 11.4 Validation

模型返回后必须做校验：

- JSON 解析成功。
- 字段存在。
- `heatScore` 在 0 到 100 范围内。
- 中文文本非空。

不合法时走降级：

- 使用规则排序。
- 非中文文本直接做简化翻译或保留原标题。

## 12. Local Data Model

建议在 SQLite 中新增三张表。

### 12.1 `news_settings`

```text
id
enabled
fetch_time
top_n
sources_json
provider
model
created_at
updated_at
```

说明：

- API Key 不放数据库，放 secure store。
- 数据库只存非敏感配置。

### 12.2 `news_digest`

```text
id
digest_date
title
summary_markdown
top_count
notified_at
created_at
updated_at
```

### 12.3 `news_digest_items`

```text
id
digest_id
source
url
published_at
original_language
title
summary
title_zh
summary_zh
alert_text_zh
category
market_impact
market_bias
rule_score
llm_score
final_score
created_at
```

### 12.4 Optional `news_candidates`

如果希望保留调试信息，可增加候选表保存每次抓取原始候选项和聚类结果。

MVP 可先不落这张表，只保留最终入选项。

## 13. Scheduling Design

### 13.1 Scheduler Location

调度器放在 Electron 主进程。

原因：

- 主进程在托盘模式下常驻。
- 便于直接调用通知和数据库。
- 不依赖渲染进程页面是否打开。

### 13.2 Trigger Rules

- 默认每天早上 08:30 执行。
- 启动应用后立即计算下一次执行时间。
- 同一天已成功生成 digest 时，不再重复正式提醒。
- 用户可通过托盘菜单手动触发 `Run now`。

### 13.3 Failure Policy

- 抓取失败：记录日志，不弹失败通知。
- 大模型失败：使用规则排序和原文/基础翻译降级。
- 某个新闻源失败：不影响其他源继续处理。

## 14. Notification Design

### 14.1 Desktop Notification

通知内容建议为：

- 标题：`今日财经热点已更新`
- 正文：展示前 2 到 3 条重点摘要，末尾追加 `点击查看完整 10 条`。

### 14.2 In-App Presentation

建议提供一个"今日财经热点"弹层或面板：

- 展示 10 条中文摘要。
- 点击某条跳转原文链接。
- 展示来源和发布时间。

### 14.3 Tray Integration

托盘增加：

- 立即抓取今日热点
- 查看今日热点
- 新闻提醒设置

## 15. Settings Design

由于当前项目没有通用设置页，MVP 建议使用一个独立模态框。

配置项包括：

- 启用每日提醒
- 每日抓取时间
- 热点条数
- 启用桌面通知
- 模型提供商
- 模型名称
- API Key

敏感信息处理：

- provider/model 存 `news_settings`
- API Key 存 secure store

## 16. Security and Compliance

### 16.1 API Key Storage

API Key 必须存放在 secure store，不进入渲染层持久化状态，不写入普通数据库。

### 16.2 Copyright Boundary

不保存整篇新闻正文，只保存：

- 标题
- 短摘要
- 来源
- 原文链接
- 中文摘要结果

### 16.3 Model Guardrails

通过 prompt 限制模型：

- 不得扩写外部事实。
- 不得生成投资建议。
- 仅做新闻信息摘要与提醒。

## 17. Mapping to Current Repository

### 17.1 Electron Main Process

新增：

- `electron/news/`
  - `scheduler.ts`
  - `fetchers.ts`
  - `analyzer.ts`
  - `scoring.ts`
  - `notifications.ts`
  - `types.ts`

修改：

- `electron/main.ts`
  - 应用 ready 后启动 scheduler
- `electron/tray.ts`
  - 增加新闻相关菜单
- `electron/ipc-handlers.ts`
  - 暴露新闻查询、手动抓取、设置保存等 IPC
- `electron/preload.ts`
  - 暴露新闻 API 给渲染层
- `electron/secure-store.ts`
  - 增加新闻模型 API Key 的存取方法

### 17.2 Database

修改：

- `electron/database/connection.ts`
  - 增加新闻相关表 migration

新增：

- `electron/database/repositories/news.ts`

### 17.3 Renderer

新增：

- `src/components/news/NewsDigestModal.tsx`
- `src/components/news/NewsSettingsModal.tsx`
- `src/stores/newsStore.ts`

修改：

- `src/App.tsx`
  - 监听新闻摘要 ready 事件
- `src/components/layout/AppShell.tsx`
  - 接入查看热点或打开设置入口

## 18. Implementation Plan

### Phase 1: Infrastructure

- 新增新闻数据表。
- 新增 secure store 字段。
- 新增主进程新闻模块骨架。
- 新增 IPC 和 preload 接口。

### Phase 2: Fetch + Rule Engine

- 接入 3 个稳定新闻源。
- 实现抓取、归一化、去重和规则排序。
- 支持手动 `Run now`。

### Phase 3: LLM Analysis

- 接入 OpenRouter 或 Gemini。
- 完成 prompt、结构化输出、JSON 校验。
- 生成中文标题、中文摘要、提醒文案。

### Phase 4: Notify + UI

- 系统通知。
- 今日热点摘要模态框。
- 新闻提醒设置模态框。

### Phase 5: Hardening

- 加入失败重试和超时控制。
- 加入单日幂等和重复提醒保护。
- 加入日志与调试信息。

## 19. Example Runtime Flow

```text
08:30 scheduler wakes up
  -> fetch candidates from RSS feeds
  -> normalize and dedupe
  -> compute rule scores
  -> select top 25 candidates
  -> call LLM analyzer
  -> validate JSON output
  -> compute final top 10
  -> save digest and items
  -> send desktop notification
  -> emit IPC event to renderer
```

## 20. Failure and Degradation Strategy

### 20.1 Source Failure

- 单个源失败时跳过。
- 至少有一个源成功时继续生成摘要。

### 20.2 LLM Failure

降级为：

- 只使用规则排序选出 top 10。
- 中文新闻直接保留。
- 非中文新闻使用最简单翻译策略，或保留原文并标明来源。

### 20.3 Notification Failure

- 通知失败不影响 digest 入库。
- 用户仍可在应用内查看当日摘要。

## 21. Open Questions

以下问题在正式开发前需要确认：

1. 最终优先使用 Gemini 还是 OpenRouter。
2. 要接入哪些稳定可用的财经新闻源。
3. 通知时间是否固定为每天一次，还是允许工作时段多次提醒。
4. 新闻摘要是否需要写入普通笔记列表，还是独立面板展示。

## 22. Recommended MVP Decision

为了尽快落地，建议采用以下具体组合：

- 新闻源：3 个 RSS 源
- 模型：OpenRouter + `z-ai/glm-4.5-air:free` 作为首选测试模型
- 存储：独立新闻表，不写入普通 notes 表
- 呈现：桌面通知 + 今日热点模态框

这样可以在当前项目中以最低改动实现一个可运行、可验证、可扩展的版本。

## 23. Desktop Production Considerations

本设计在打包后的 Electron 生产环境中可以直接成立，但要明确它属于"本地常驻托盘版生产方案"。

### 23.1 What Works in Desktop Production

- 主进程定时抓取新闻源。
- 本地数据库持久化每日摘要。
- 调用第三方大模型做翻译、排序与文案生成。
- 系统托盘常驻和桌面通知提醒。
- 点击通知后打开应用并查看今日热点。

### 23.2 Production Preconditions

要想在桌面生产环境稳定运行，需要满足以下前提：

- 应用没有被彻底退出，而是持续在托盘中运行。
- 用户已经配置可用的模型 API Key。
- 新闻源在目标网络环境中稳定可访问。
- 主进程具备失败重试和重复提醒保护。

### 23.3 Production Hardening Items

桌面生产版必须补齐以下能力：

- 开机自启动。
- 记录最后成功抓取时间和最后提醒日期。
- 抓取和模型调用的超时与重试。
- 同一天重复触发时的幂等控制。
- 本地日志，便于排查模型或网络故障。

### 23.4 Security in Desktop Production

生产版不得将统一平台 API Key 直接打包到客户端中。

允许的实现方式只有两类：

- 用户自行配置自己的 Key，本地安全保存。
- 客户端只调用你自己的服务端，由服务端统一持有平台密钥。

当前 MVP 采用第一种方式。

## 24. Limits of Local Scheduling

本地调度方案的边界如下：

- 应用隐藏到托盘时，可以按时执行。
- 应用彻底退出后，不会再抓取和提醒。
- 用户电脑关机或休眠时，不会执行抓取任务。

因此，这套方案适合：

- 个人开发者自用。
- 单机桌面客户端提醒。
- 对"应用在运行时提醒我"有明确接受度的场景。

不适合：

- 统一给大量用户准时推送。
- 应用未运行时仍要求提醒到达。
- 多设备统一消费同一份摘要结果。

## 25. Service-Side Evolution Path

如果后续要扩展成真正的服务端生产方案，建议演进为：

```text
News sources
  -> server-side fetcher
  -> dedupe + ranking
  -> server-side LLM analysis
  -> persistent digest store
  -> client pull / websocket push / email / mobile push
```

### 25.1 Responsibilities After Evolution

服务端负责：

- 定时抓取新闻源。
- 统一做热点聚合和排序。
- 统一调用大模型生成摘要。
- 统一存储当日摘要。
- 对多个客户端分发结果。

客户端负责：

- 展示摘要。
- 本地缓存。
- 用户偏好设置。
- 接收通知和查看详情。

### 25.2 Why Evolve Later Instead of Now

当前仓库的主要产品形态仍然是 Electron 桌面应用，本地优先链路已经具备。先做桌面生产版有三个优势：

- 研发成本最低。
- 反馈闭环最快。
- 不需要立即引入新的服务端调度和密钥代理体系。

因此，建议先上线桌面 MVP，再根据实际使用频率和用户反馈决定是否迁移到服务端架构。
