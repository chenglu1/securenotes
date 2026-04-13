import { BrowserWindow, Notification } from 'electron'
import type { NewsDigest } from './types'

function focusWindow(win: BrowserWindow | null) {
  if (!win) {
    return
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.show()
  win.focus()
}

export function showNewsDigestNotification(digest: NewsDigest, win: BrowserWindow | null, onOpenDigest: () => void) {
  if (!Notification.isSupported()) {
    return
  }

  const body = digest.items
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.titleZh}`)
    .join('\n')

  const notification = new Notification({
    title: '今日财经热点已更新',
    body: body || '点击查看今日 10 条财经热点摘要。',
    silent: false,
  })

  notification.on('click', () => {
    focusWindow(win)
    onOpenDigest()
  })

  notification.show()
}
