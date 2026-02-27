// Electron Main Process
import { join } from 'path'
import { app, BrowserWindow, shell } from 'electron'

// These must be set AFTER app module is available but they reference
// `__dirname` which is available at module load
const DIST = join(__dirname, '../dist')

let win: BrowserWindow | null
const preload = join(__dirname, './preload.js')
const url = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  const PUBLIC = app.isPackaged ? DIST : join(DIST, '../public')

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: join(PUBLIC, 'logo.svg'),
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
}

// Register IPC handlers AFTER app is ready, using dynamic import
// to avoid premature access to app.getPath() in imported modules
app.whenReady().then(async () => {
  const { registerIpcHandlers } = await import('./ipc-handlers')
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
