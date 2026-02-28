// Electron Main Process
import { join } from 'path'
import { app, BrowserWindow, shell } from 'electron'
import { createTray, destroyTray } from './tray'

// These must be set AFTER app module is available but they reference
// `__dirname` which is available at module load
const DIST = join(__dirname, '../dist')

let win: BrowserWindow | null
let isQuitting = false
const preload = join(__dirname, './preload.js')
const url = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  const PUBLIC = app.isPackaged ? DIST : join(DIST, '../public')

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: join(PUBLIC, 'icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f13',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
    },
  })

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (url) {
    win.loadURL(url)
  } else {
    win.loadFile(join(DIST, 'index.html'))
  }

  // 关闭窗口时隐藏到托盘，而不是直接退出
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win?.hide()
    }
  })
}

// Register IPC handlers AFTER app is ready, using dynamic import
// to avoid premature access to app.getPath() in imported modules
app.whenReady().then(async () => {
  createWindow()
  
  const { registerIpcHandlers } = await import('./ipc-handlers')
  await registerIpcHandlers(win)
  
  // 创建系统托盘
  createTray(win)
})

app.on('window-all-closed', () => {
  // 不自动退出，保持托盘运行
  win = null
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 应用退出前清理托盘
app.on('before-quit', () => {
  isQuitting = true
  destroyTray()
})
