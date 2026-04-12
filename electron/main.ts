// Electron Main Process
import { cpSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { app, BrowserWindow, shell } from 'electron'
import { APP_PROTOCOL, handleGoogleAuthCallback } from './google-auth'
import { createTray, destroyTray } from './tray'

const CANONICAL_USER_DATA_DIR = 'securenotes'
const LEGACY_USER_DATA_DIRS = ['electron-vite-boilerplate']

function initializeUserDataPath() {
  const appDataDir = app.getPath('appData')
  const canonicalUserDataPath = join(appDataDir, CANONICAL_USER_DATA_DIR)

  if (!existsSync(canonicalUserDataPath)) {
    mkdirSync(canonicalUserDataPath, { recursive: true })
  }

  for (const legacyDirName of LEGACY_USER_DATA_DIRS) {
    const legacyUserDataPath = join(appDataDir, legacyDirName)
    if (!existsSync(legacyUserDataPath)) {
      continue
    }

    for (const entry of ['securenotes.db', 'secure-store.bin', 'secure-store.json', 'attachments']) {
      const sourcePath = join(legacyUserDataPath, entry)
      const targetPath = join(canonicalUserDataPath, entry)
      if (existsSync(sourcePath) && !existsSync(targetPath)) {
        cpSync(sourcePath, targetPath, { recursive: true })
      }
    }
  }

  app.setPath('userData', canonicalUserDataPath)
}

initializeUserDataPath()

// These must be set AFTER app module is available but they reference
// `__dirname` which is available at module load
const DIST = join(__dirname, '../dist')

let win: BrowserWindow | null
let isQuitting = false
const preload = join(__dirname, './preload.js')
const url = process.env['VITE_DEV_SERVER_URL']
const initialDeepLink = process.argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`)) ?? null

registerProtocolClient()

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

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
    // 开发模式自动打开 DevTools
    win.webContents.openDevTools()
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

function registerProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [resolve(process.argv[1])])
    return
  }

  app.setAsDefaultProtocolClient(APP_PROTOCOL)
}

function focusMainWindow() {
  if (!win) {
    return
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.show()
  win.focus()
}

if (gotTheLock) {
  app.on('second-instance', (_event, commandLine) => {
    const deepLink = commandLine.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`))
    if (deepLink) {
      handleGoogleAuthCallback(deepLink)
    }

    focusMainWindow()
  })
}

app.on('open-url', (event, rawUrl) => {
  event.preventDefault()
  handleGoogleAuthCallback(rawUrl)
  focusMainWindow()
})

// Register IPC handlers AFTER app is ready, using dynamic import
// to avoid premature access to app.getPath() in imported modules
if (gotTheLock) {
  app.whenReady().then(async () => {
    createWindow()

    const { registerIpcHandlers } = await import('./ipc-handlers')
    await registerIpcHandlers(win)

    if (initialDeepLink) {
      handleGoogleAuthCallback(initialDeepLink)
    }

    // 创建系统托盘
    createTray(win)
  })
}

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
