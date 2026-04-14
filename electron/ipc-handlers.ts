import { ipcMain, BrowserWindow, app } from 'electron'
import { initDatabase } from './database/connection'
import { NotesRepository } from './database/repositories/notes'
import { TagsRepository } from './database/repositories/tags'
import { AttachmentsRepository } from './database/repositories/attachments'
import type { NewsDigestService } from './news/service'
import {
  clearAuthSession,
  clearEncryptionKey,
  clearNoteSyncCursor,
  getAuthSession,
  getEncryptionKey,
  getNoteSyncCursor,
  saveAuthSession,
  saveEncryptionKey,
  saveNoteSyncCursor,
} from './secure-store'
import { startGoogleAuth } from './google-auth'

// 仓库实例延迟到 initDatabase() 完成后创建，避免模块加载时 DB 未初始化的时序问题
let notes: NotesRepository
let tags: TagsRepository
let attachments: AttachmentsRepository

export async function registerIpcHandlers(win: BrowserWindow | null, newsService?: NewsDigestService) {
  // Initialize database first (async for sql.js WASM loading)
  await initDatabase()

  // 在 DB 初始化完成后再实例化仓库，确保时序正确
  notes = new NotesRepository()
  tags = new TagsRepository()
  attachments = new AttachmentsRepository()

  // ── Window Control ─────────────────────────────────────
  ipcMain.handle('window:minimize', () => {
    win?.minimize()
  })
  
  ipcMain.handle('window:maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  
  ipcMain.handle('window:close', () => {
    win?.close()
  })
  
  ipcMain.handle('window:hide', () => {
    win?.hide()
  })
  
  ipcMain.handle('window:show', () => {
    win?.show()
    win?.focus()
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
  })

  // ── Secure Auth Storage ───────────────────────────────
  ipcMain.handle('auth:getSession', () => getAuthSession())
  ipcMain.handle('auth:saveSession', (_e, session: { token: string; userId: string; email?: string }) => {
    saveAuthSession(session)
  })
  ipcMain.handle('auth:clearSession', () => {
    clearAuthSession()
  })
  ipcMain.handle('auth:startGoogleLogin', (_e, startUrl: string) => startGoogleAuth(startUrl))
  ipcMain.handle('auth:getEncryptionKey', (_e, userId: string) => getEncryptionKey(userId))
  ipcMain.handle('auth:saveEncryptionKey', (_e, userId: string, key: string) => {
    saveEncryptionKey(userId, key)
  })
  ipcMain.handle('auth:clearEncryptionKey', (_e, userId: string) => {
    clearEncryptionKey(userId)
  })
  ipcMain.handle('auth:getNoteSyncCursor', (_e, userId: string) => getNoteSyncCursor(userId))
  ipcMain.handle('auth:saveNoteSyncCursor', (_e, userId: string, cursor: number) => {
    saveNoteSyncCursor(userId, cursor)
  })
  ipcMain.handle('auth:clearNoteSyncCursor', (_e, userId: string) => {
    clearNoteSyncCursor(userId)
  })

  // ── News Digest ───────────────────────────────────────
  ipcMain.handle('news:getSettings', () => newsService?.getSettings() ?? null)
  ipcMain.handle('news:saveSettings', (_e, input) => {
    if (!newsService) {
      throw new Error('News digest service is not available.')
    }

    return newsService.saveSettings(input)
  })
  ipcMain.handle('news:getLatestDigest', () => newsService?.getLatestDigest() ?? null)
  ipcMain.handle('news:runNow', () => {
    if (!newsService) {
      throw new Error('News digest service is not available.')
    }

    return newsService.runNow('manual')
  })
  ipcMain.handle('news:openLogFile', () => {
    if (!newsService) {
      throw new Error('News digest service is not available.')
    }

    return newsService.openLogFile()
  })

  // ── Notes ──────────────────────────────────────────────
  ipcMain.handle('notes:listSummaries', (_e, query?: string) => notes.getSummaries(query))
  ipcMain.handle('notes:getById', (_e, id: string) => notes.getById(id))
  ipcMain.handle('notes:create', (_e, data: { title?: string; content?: string }) => notes.create(data))
  ipcMain.handle('notes:update', (_e, id: string, data: { title?: string; content?: string }) => notes.update(id, data))
  ipcMain.handle('notes:delete', (_e, id: string) => notes.delete(id))
  ipcMain.handle('notes:getDirty', () => notes.getDirty())
  ipcMain.handle('notes:markSynced', (_e, id: string, syncVersion: number) => notes.markSynced(id, syncVersion))
  ipcMain.handle('notes:upsertFromCloud', (_e, cloudNote: any, options?: { force?: boolean }) => notes.upsertFromCloud(cloudNote, options))
  ipcMain.handle('notes:claimLocalNotes', (_e, userId: string) => notes.claimLocalNotes(userId))

  // ── Tags ───────────────────────────────────────────────
  ipcMain.handle('tags:getAll', () => tags.getAll())
  ipcMain.handle('tags:create', (_e, data: { name: string; color?: string }) => tags.create(data))
  ipcMain.handle('tags:delete', (_e, id: string) => tags.delete(id))
  ipcMain.handle('tags:addToNote', (_e, noteId: string, tagId: string) => tags.addToNote(noteId, tagId))
  ipcMain.handle('tags:removeFromNote', (_e, noteId: string, tagId: string) => tags.removeFromNote(noteId, tagId))
  ipcMain.handle('tags:getForNote', (_e, noteId: string) => tags.getForNote(noteId))

  // ── Attachments ────────────────────────────────────────
  ipcMain.handle('attachments:add', (_e, noteId: string, filePath: string) => attachments.add(noteId, filePath))
  ipcMain.handle('attachments:getForNote', (_e, noteId: string) => attachments.getForNote(noteId))
  ipcMain.handle('attachments:delete', (_e, id: string) => attachments.delete(id))
  ipcMain.handle('attachments:open', (_e, id: string) => attachments.open(id))
}
