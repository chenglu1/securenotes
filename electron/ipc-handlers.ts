import { ipcMain, BrowserWindow, app } from 'electron'
import { initDatabase } from './database/connection'
import { NotesRepository } from './database/repositories/notes'
import { TagsRepository } from './database/repositories/tags'
import { AttachmentsRepository } from './database/repositories/attachments'

const notes = new NotesRepository()
const tags = new TagsRepository()
const attachments = new AttachmentsRepository()

export async function registerIpcHandlers(win: BrowserWindow | null) {
  // Initialize database first (async for sql.js WASM loading)
  await initDatabase()

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

  // ── Notes ──────────────────────────────────────────────
  ipcMain.handle('notes:getAll', () => notes.getAll())
  ipcMain.handle('notes:getById', (_e, id: string) => notes.getById(id))
  ipcMain.handle('notes:create', (_e, data: { title?: string; content?: string }) => notes.create(data))
  ipcMain.handle('notes:update', (_e, id: string, data: { title?: string; content?: string }) => notes.update(id, data))
  ipcMain.handle('notes:delete', (_e, id: string) => notes.delete(id))
  ipcMain.handle('notes:search', (_e, query: string) => notes.search(query))
  ipcMain.handle('notes:getDirty', () => notes.getDirty())
  ipcMain.handle('notes:markSynced', (_e, id: string, syncVersion: number) => notes.markSynced(id, syncVersion))
  ipcMain.handle('notes:upsertFromCloud', (_e, cloudNote: any) => notes.upsertFromCloud(cloudNote))

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
