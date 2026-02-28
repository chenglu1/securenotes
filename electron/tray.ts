import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

/**
 * 创建系统托盘
 * @param win - 主窗口实例
 */
export function createTray(win: BrowserWindow | null) {
  if (!win) return

  // 获取托盘图标路径
  const DIST = join(__dirname, '../dist')
  const PUBLIC = app.isPackaged ? DIST : join(DIST, '../public')
  const iconPath = join(PUBLIC, 'icon.png')

  // 创建托盘图标（可选：调整图标大小以适配系统托盘）
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  // 设置托盘提示文本
  tray.setToolTip('SecureNotes - 离线优先笔记应用')

  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        showWindow(win)
      },
    },
    {
      type: 'separator',
    },
    {
      label: '新建笔记',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        showWindow(win)
        // 可以通过 IPC 通知渲染进程创建笔记
        win?.webContents.send('create-new-note')
      },
    },
    {
      type: 'separator',
    },
    {
      label: '关于',
      click: () => {
        showWindow(win)
        // 可以触发关于对话框
      },
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        // 完全退出应用
        app.quit()
      },
    },
  ])

  // 设置右键菜单
  tray.setContextMenu(contextMenu)

  // 左键点击托盘图标 - 显示/隐藏窗口
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      showWindow(win)
    }
  })

  // Windows 系统：双击托盘图标
  tray.on('double-click', () => {
    showWindow(win)
  })
}

/**
 * 显示窗口并聚焦
 */
function showWindow(win: BrowserWindow | null) {
  if (!win) return

  if (!win.isVisible()) {
    win.show()
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.focus()
}

/**
 * 更新托盘菜单（例如根据应用状态动态更新）
 */
export function updateTrayMenu(win: BrowserWindow | null, options?: { noteCount?: number }) {
  if (!tray || !win) return

  const noteCountLabel = options?.noteCount !== undefined ? ` (${options.noteCount} 篇笔记)` : ''

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `显示主窗口${noteCountLabel}`,
      click: () => showWindow(win),
    },
    {
      type: 'separator',
    },
    {
      label: '新建笔记',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        showWindow(win)
        win?.webContents.send('create-new-note')
      },
    },
    {
      type: 'separator',
    },
    {
      label: '关于 SecureNotes',
      click: () => {
        showWindow(win)
      },
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

/**
 * 销毁托盘（应用退出时调用）
 */
export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
