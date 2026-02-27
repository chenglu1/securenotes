# SecureNotes 项目详解 — Electron 开发学习指南

本文档以 SecureNotes 项目为例，**从零开始**讲解 Electron 桌面应用的核心概念、架构设计和开发模式。

---

## 目录

1. [Electron 是什么](#1-electron-是什么)
2. [核心概念：两个进程](#2-核心概念两个进程)
3. [项目启动流程](#3-项目启动流程)
4. [主进程详解 (electron/main.ts)](#4-主进程详解)
5. [预加载脚本详解 (electron/preload.ts)](#5-预加载脚本详解)
6. [渲染进程详解 (src/)](#6-渲染进程详解)
7. [IPC 通信完整链路](#7-ipc-通信完整链路)
8. [数据库层 (sql.js)](#8-数据库层)
9. [Vite + Electron 构建机制](#9-vite--electron-构建机制)
10. [如何添加新功能：完整示例](#10-如何添加新功能完整示例)

---

## 1. Electron 是什么

Electron = **Chromium** (浏览器内核) + **Node.js** (服务端运行时)

```
┌─────────────────────────────────────────┐
│             你的 Electron 应用           │
│                                         │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  Chromium    │    │   Node.js      │  │
│  │  渲染 HTML   │    │  访问文件系统   │  │
│  │  CSS / JS    │    │  调用原生 API   │  │
│  │  React 应用  │    │  操作数据库     │  │
│  └─────────────┘    └────────────────┘  │
└─────────────────────────────────────────┘
```

**一句话理解**: Electron 让你用写网页的方式写桌面应用，同时能访问操作系统底层能力。

---

## 2. 核心概念：两个进程

这是理解 Electron 最重要的概念。

```
┌──────────────────────────────────────────────────────────┐
│                     Electron 应用                         │
│                                                          │
│  ┌─────────────────────┐    ┌──────────────────────────┐ │
│  │    Main Process      │    │   Renderer Process       │ │
│  │    主进程 (1个)       │    │   渲染进程 (每窗口1个)    │ │
│  │                     │    │                          │ │
│  │  • 创建/管理窗口     │    │  • 就是一个网页           │ │
│  │  • 访问文件系统      │◄──►│  • 运行 React/Vue        │ │
│  │  • 操作数据库        │IPC │  • 显示 UI               │ │
│  │  • 系统托盘/菜单     │    │  • 用户交互              │ │
│  │  • 原生对话框        │    │  • 不能直接访问 Node.js   │ │
│  └─────────────────────┘    └──────────────────────────┘ │
│              ▲                         ▲                  │
│              │                         │                  │
│     electron/main.ts          src/ (React 应用)           │
│     electron/preload.ts       index.html                  │
└──────────────────────────────────────────────────────────┘
```

### 为什么分两个进程？

**安全性**。如果网页能直接访问文件系统，那任何恶意脚本都可以删除你的文件。Electron 通过进程隔离让渲染进程（网页）默认无法访问系统资源，必须通过受控的 IPC 通道请求主进程代为操作。

---

## 3. 项目启动流程

当你运行 `npm run dev` 时，发生了什么？

```
npm run dev
    │
    ▼
  vite (启动 Vite 开发服务器)
    │
    ├── 1. 启动 HMR 开发服务器 → http://localhost:5173
    │      (提供 React 热更新)
    │
    ├── 2. vite-plugin-electron 编译主进程
    │      electron/main.ts → dist-electron/main.js
    │      electron/preload.ts → dist-electron/preload.js
    │
    └── 3. 启动 Electron 进程
           electron.exe dist-electron/main.js
               │
               ▼
           创建 BrowserWindow
               │
               ▼
           加载 http://localhost:5173 (开发) 
           或 dist/index.html (生产)
               │
               ▼
           React 应用渲染到页面
```

---

## 4. 主进程详解

文件: [electron/main.ts](file:///c:/Users/chenglu/Desktop/todo/electron/electron-vite-boilerplate/electron/main.ts)

```typescript
// ① 导入 Electron 核心模块
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

// ② 定义窗口变量和路径
const DIST = join(__dirname, '../dist')
let win: BrowserWindow | null
const preload = join(__dirname, './preload.js')
const url = process.env['VITE_DEV_SERVER_URL']  // 开发时有值，生产时为空

// ③ 创建窗口函数
function createWindow() {
  win = new BrowserWindow({
    width: 1280,                    // 窗口宽度
    height: 800,                    // 窗口高度
    titleBarStyle: 'hiddenInset',   // macOS 隐藏标题栏
    backgroundColor: '#0f0f13',     // 背景色 (避免白闪)
    webPreferences: {
      contextIsolation: true,       // ⚡ 安全：隔离预加载脚本
      nodeIntegration: false,       // ⚡ 安全：渲染进程不能用 Node
      preload,                      // 指定预加载脚本路径
    },
  })

  // ④ 开发模式加载 Vite HMR 服务器，生产模式加载本地文件
  if (url) {
    win.loadURL(url)                // 开发: http://localhost:5173
  } else {
    win.loadFile(join(DIST, 'index.html'))  // 生产: 打包后的 HTML
  }
}

// ⑤ 应用生命周期
app.whenReady().then(async () => {
  // 关键：动态导入 IPC 处理器 (必须在 app.ready 之后)
  const { registerIpcHandlers } = await import('./ipc-handlers')
  registerIpcHandlers()  // 注册所有 IPC 方法
  createWindow()         // 创建窗口
})

// ⑥ 所有窗口关闭时退出 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

### 关键知识点

| 概念 | 说明 |
|------|------|
| `app` | 控制应用生命周期 (启动、退出、激活) |
| `BrowserWindow` | 创建和管理窗口 |
| `contextIsolation: true` | 预加载脚本和网页脚本运行在不同的 JS 上下文，防止网页篡改 Node API |
| `nodeIntegration: false` | 网页内不能使用 `require()`、`fs` 等 Node 模块 |
| `preload` | 预加载脚本：在网页加载前执行，是安全的桥梁 |
| 动态 `import()` | 因为 `app.getPath()` 等 API 在 `app.ready` 之前不可用，所以数据库相关模块必须延迟加载 |

---

## 5. 预加载脚本详解

文件: [electron/preload.ts](file:///c:/Users/chenglu/Desktop/todo/electron/electron-vite-boilerplate/electron/preload.ts)

**预加载脚本是连接主进程和渲染进程的安全桥梁。**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 安全地向渲染进程暴露 API
contextBridge.exposeInMainWorld('api', {
  // ── 笔记操作 ──
  getNotes:    ()              => ipcRenderer.invoke('notes:getAll'),
  createNote:  (data)          => ipcRenderer.invoke('notes:create', data),
  updateNote:  (id, data)      => ipcRenderer.invoke('notes:update', id, data),
  deleteNote:  (id)            => ipcRenderer.invoke('notes:delete', id),
  searchNotes: (query)         => ipcRenderer.invoke('notes:search', query),

  // ── 标签操作 ──
  getTags:    ()               => ipcRenderer.invoke('tags:getAll'),
  createTag:  (data)           => ipcRenderer.invoke('tags:create', data),

  // ── 监听主进程消息 ──
  onMainProcessMessage: (cb)   => ipcRenderer.on('main-process-message', cb),
})
```

### 工作原理

```
渲染进程 (React)                预加载脚本               主进程
──────────────                ──────────               ──────
window.api.createNote({       contextBridge             ipcMain.handle(
  title: '笔记'               将函数暴露到               'notes:create',
})                            window.api 对象上          (event, data) => {
  │                               │                      return repo.create(data)
  │     ipcRenderer.invoke()      │                    })
  └──────────────────────────────►└───────────────────►│
                                                        │
  ◄─────────────────── 返回结果 ◄───────────────────────┘
```

### 为什么用 `contextBridge` 而不是直接 `ipcRenderer`？

```typescript
// ❌ 不安全的做法：直接暴露 ipcRenderer
window.ipcRenderer = ipcRenderer
// 问题：网页中任何脚本都能调用任意 IPC 方法

// ✅ 安全的做法：通过 contextBridge 只暴露受控的方法
contextBridge.exposeInMainWorld('api', {
  getNotes: () => ipcRenderer.invoke('notes:getAll'),
  // 网页只能调用你明确暴露的方法
})
```

---

## 6. 渲染进程详解

渲染进程 = 一个标准的 React 应用，只是运行在 Electron 的窗口中。

### 入口文件

文件: [src/main.tsx](file:///c:/Users/chenglu/Desktop/todo/electron/electron-vite-boilerplate/src/main.tsx)

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { installMockApi } from './services/mockApi'
import { App } from './App'
import './styles/index.css'

// 在浏览器开发模式下安装 Mock API
// (当不在 Electron 中运行时，window.api 不存在)
installMockApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 状态管理 (Zustand)

文件: [src/stores/noteStore.ts](file:///c:/Users/chenglu/Desktop/todo/electron/electron-vite-boilerplate/src/stores/noteStore.ts)

Zustand 是一个轻量级状态管理库。相比 Redux，它更简洁：

```typescript
import { create } from 'zustand'

// 定义 Store
const useNoteStore = create((set, get) => ({
  // ── 状态 ──
  notes: [],
  selectedNoteId: null,
  searchQuery: '',

  // ── 动作 ──
  loadNotes: async () => {
    const notes = await window.api.getNotes()  // 调用 IPC
    set({ notes })                              // 更新状态
  },

  createNote: async () => {
    const note = await window.api.createNote({ title: '', content: '' })
    set((state) => ({
      notes: [note, ...state.notes],           // 乐观更新：先更新 UI
      selectedNoteId: note.id,                  // 选中新笔记
    }))
  },

  // 更多动作...
}))

// 在任何组件中使用
function MyComponent() {
  const notes = useNoteStore((state) => state.notes)
  const createNote = useNoteStore((state) => state.createNote)
  // ...
}
```

### 组件结构

```
App.tsx                          # 根组件，加载初始数据
└── AppShell.tsx                 # 布局：标题栏 + 侧栏 + 编辑器
    ├── Sidebar.tsx              # 侧栏
    │   ├── 品牌标识 + 新建按钮
    │   ├── 搜索栏               # 实时过滤笔记
    │   ├── 笔记列表             # 每个笔记显示标题/预览/时间
    │   └── 同步状态指示器
    │
    └── EditorPane.tsx           # 编辑器主区域
        ├── 标题输入框
        ├── EditorToolbar.tsx    # 工具栏 (加粗/斜体/标题/列表...)
        └── TipTap 编辑器         # 实际的富文本编辑区域
```

---

## 7. IPC 通信完整链路

以**创建笔记**为例，跟踪一次完整的 IPC 调用链路：

```
第 1 步：用户点击 "+" 按钮
  ↓
Sidebar.tsx:
  onClick={() => createNote()}
  ↓
第 2 步：Zustand Store 调用 IPC
  ↓
noteStore.ts:
  createNote: async () => {
    const note = await window.api.createNote({ title: '' })
    //                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                  这调用的是预加载脚本暴露的方法
    set(state => ({ notes: [note, ...state.notes] }))
  }
  ↓
第 3 步：预加载脚本转发到主进程
  ↓
preload.ts:
  createNote: (data) => ipcRenderer.invoke('notes:create', data)
  //                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                     通过 IPC 通道发送到主进程
  ↓
第 4 步：主进程处理请求
  ↓
ipc-handlers.ts:
  ipcMain.handle('notes:create', (_e, data) => notes.create(data))
  //                                           ^^^^^^^^^^^^^^^^^^
  //                                           调用数据库仓库
  ↓
第 5 步：数据库操作
  ↓
repositories/notes.ts:
  create(data) {
    const db = getDatabase()       // 获取 sql.js 数据库实例
    db.run('INSERT INTO notes ...')  // 执行 SQL
    saveDatabase()                  // 持久化到磁盘
    return this.getById(id)         // 返回新创建的笔记
  }
  ↓
第 6 步：结果原路返回
  ↓
  notes.create(data) → ipcMain.handle 返回值
    → ipcRenderer.invoke() 的 Promise 解析
      → window.api.createNote() 返回
        → Zustand set() 更新状态
          → React 重新渲染 UI ✅
```

---

## 8. 数据库层

文件: [electron/database/connection.ts](file:///c:/Users/chenglu/Desktop/todo/electron/electron-vite-boilerplate/electron/database/connection.ts)

### 为什么用 sql.js 而不是 better-sqlite3？

| 对比 | better-sqlite3 | sql.js |
|------|---------------|--------|
| 实现方式 | C++ 原生模块 | WASM (WebAssembly) |
| 安装 | 需要 C++ 编译器 | 纯 JavaScript，无需编译 |
| 性能 | 更快 | 稍慢但足够 |
| Electron 兼容 | 需要 `electron-rebuild` | 开箱即用 ✅ |

### 数据库初始化流程

```typescript
import initSqlJs from 'sql.js'

async function initDatabase() {
  // 1. 加载 WASM 二进制
  const SQL = await initSqlJs()

  // 2. 数据库文件路径
  const dbPath = join(app.getPath('userData'), 'securenotes.db')
  //                  ^^^^^^^^^^^^^^^^^^^^^^
  //                  Windows: %APPDATA%/securenotes/
  //                  macOS:  ~/Library/Application Support/securenotes/

  // 3. 加载已有数据 或 创建新数据库
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)    // 从文件加载
  } else {
    db = new SQL.Database()          // 创建空数据库
  }

  // 4. 创建表结构
  runMigrations(db)

  // 5. 持久化 (sql.js 在内存中运行，需要手动保存)
  saveDatabase()
}

function saveDatabase() {
  const data = db.export()           // 导出为 Uint8Array
  writeFileSync(dbPath, Buffer.from(data))  // 写入磁盘
}
```

> **重要**: sql.js 完全在内存中运行，每次写操作后必须调用 `saveDatabase()` 才会持久化到磁盘。

### Repository 模式

每种数据实体都有独立的 Repository 类：

```typescript
// repositories/notes.ts
class NotesRepository {
  // sql.js 的查询模式：prepare → bind → step → getAsObject
  getAll(): Note[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL')
    const results: Note[] = []
    while (stmt.step()) {                    // 逐行读取
      results.push(stmt.getAsObject() as Note)
    }
    stmt.free()                              // 释放语句资源
    return results
  }

  create(data): Note {
    db.run('INSERT INTO notes (...) VALUES (...)', [params])
    saveDatabase()   // 每次写入后持久化
    return this.getById(id)
  }
}
```

---

## 9. Vite + Electron 构建机制

文件: [vite.config.ts](file:///c:/Users/chenglu/Desktop/todo/electron/electron-vite-boilerplate/vite.config.ts)

```typescript
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    // ① React 支持 (JSX 转换、Fast Refresh)
    react(),

    // ② Electron 主进程构建
    electron([
      {
        entry: 'electron/main.ts',      // 主进程入口
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js'],      // 不打包 sql.js (外部依赖)
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',   // 预加载脚本入口
        onstart(args) {
          args.reload()                 // 文件变化时重启 Electron
        },
      },
    ]),

    // ③ 让渲染进程能使用 Node.js 模块 (如果需要)
    renderer(),
  ],
})
```

### 构建产物

```
开发模式 (npm run dev):
  dist-electron/main.js      ← electron/main.ts 编译结果
  dist-electron/preload.js   ← electron/preload.ts 编译结果
  http://localhost:5173       ← Vite 开发服务器 (React HMR)

生产模式 (npm run build):
  dist-electron/main.js      ← 同上
  dist-electron/preload.js   ← 同上
  dist/index.html             ← React 应用打包结果
  dist/assets/...             ← React 静态资源
  release/                    ← Electron 安装包 (.exe/.dmg)
```

---

## 10. 如何添加新功能：完整示例

以添加一个**"收藏笔记"**功能为例，完整展示从数据库到 UI 的全流程：

### 第 1 步：修改数据库 Schema

```typescript
// electron/database/connection.ts - runMigrations() 中添加：
db.run(`ALTER TABLE notes ADD COLUMN is_favorite INTEGER DEFAULT 0`)
```

### 第 2 步：添加 Repository 方法

```typescript
// electron/database/repositories/notes.ts
toggleFavorite(id: string): Note | undefined {
  const db = getDatabase()
  db.run(
    `UPDATE notes SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END
     WHERE id = ?`, [id]
  )
  saveDatabase()
  return this.getById(id)
}

getFavorites(): Note[] {
  const db = getDatabase()
  const stmt = db.prepare(
    `SELECT * FROM notes WHERE is_favorite = 1 AND deleted_at IS NULL`
  )
  // ... 同 getAll 的查询模式
}
```

### 第 3 步：注册 IPC Handler

```typescript
// electron/ipc-handlers.ts
ipcMain.handle('notes:toggleFavorite', (_e, id: string) =>
  notes.toggleFavorite(id)
)
ipcMain.handle('notes:getFavorites', () =>
  notes.getFavorites()
)
```

### 第 4 步：暴露到预加载脚本

```typescript
// electron/preload.ts - 在 contextBridge.exposeInMainWorld 中添加：
toggleFavorite: (id: string) =>
  ipcRenderer.invoke('notes:toggleFavorite', id),
getFavorites: () =>
  ipcRenderer.invoke('notes:getFavorites'),
```

### 第 5 步：更新类型声明

```typescript
// src/vite-env.d.ts - 在 Window['api'] 类型中添加：
toggleFavorite: (id: string) => Promise<Note>
getFavorites: () => Promise<Note[]>
```

### 第 6 步：添加 Mock API (可选，用于浏览器调试)

```typescript
// src/services/mockApi.ts
toggleFavorite: async (id: string) => {
  const note = notes.find(n => n.id === id)
  if (note) note.is_favorite = note.is_favorite ? 0 : 1
  return note
},
```

### 第 7 步：添加 Store 动作

```typescript
// src/stores/noteStore.ts
toggleFavorite: async (id: string) => {
  const updatedNote = await window.api.toggleFavorite(id)
  set(state => ({
    notes: state.notes.map(n => n.id === id ? updatedNote : n)
  }))
},
```

### 第 8 步：添加 UI 按钮

```tsx
// src/components/editor/EditorPane.tsx - 在标题旁添加：
import { Star } from 'lucide-react'

<button onClick={() => toggleFavorite(note.id)}>
  <Star fill={note.is_favorite ? 'gold' : 'none'} />
</button>
```

### 完整数据流

```
用户点击 ⭐ → Store.toggleFavorite()
                → window.api.toggleFavorite()
                  → ipcRenderer.invoke('notes:toggleFavorite')
                    → ipcMain.handle → NotesRepository.toggleFavorite()
                      → SQL UPDATE → saveDatabase()
                        → 返回 Note 对象
                      → set() 更新 Zustand 状态
                        → React 重新渲染 ⭐ 变为金色
```

---

## 常见问题

### Q: 为什么 `app.getPath()` 要延迟调用？

Electron 的 `app` 模块在 `app.whenReady()` 之前，部分 API (如 `getPath`) 尚未初始化。如果在模块顶层调用会导致 `Cannot read properties of undefined`。

**解决方案**: 使用动态 `import()` 或懒加载函数：

```typescript
// ❌ 错误：模块加载时就执行
const DB_PATH = app.getPath('userData')

// ✅ 正确：函数调用时才执行
function getDbPath() {
  return app.getPath('userData')
}
```

### Q: 为什么用 `ipcRenderer.invoke` 而不是 `ipcRenderer.send`？

| 方法 | 模式 | 适用场景 |
|------|------|---------|
| `invoke` / `handle` | 请求-响应 (有返回值) | 数据库查询、文件操作 |
| `send` / `on` | 单向消息 (无返回值) | 通知、事件广播 |

### Q: 如何调试主进程？

在 `package.json` 的 `debug` 配置中有 VSCode 调试设置。也可以在主进程代码中使用 `console.log()`，输出会显示在启动 `npm run dev` 的终端中。

### Q: 如何调试渲染进程？

在 Electron 窗口中按 `Ctrl+Shift+I` 打开 DevTools（和 Chrome 一模一样）。

---

## 推荐学习顺序

1. **先读 `electron/main.ts`** — 理解应用启动和窗口创建
2. **再读 `electron/preload.ts`** — 理解进程间通信桥梁
3. **然后读 `src/main.tsx` → `App.tsx` → `Sidebar.tsx`** — 理解 React 渲染
4. **最后读 `noteStore.ts` → `ipc-handlers.ts` → `repositories/notes.ts`** — 理解数据流
5. **动手试试**: 按照第 10 节的示例添加一个"收藏"功能
