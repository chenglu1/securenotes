import { ipcMain } from 'electron'
import { initDatabase } from './database/connection'
import { NotesRepository } from './database/repositories/notes'
import { TagsRepository } from './database/repositories/tags'
import { AttachmentsRepository } from './database/repositories/attachments'

const notes = new NotesRepository()
const tags = new TagsRepository()
const attachments = new AttachmentsRepository()

export async function registerIpcHandlers() {
  // Initialize database first (async for sql.js WASM loading)
  await initDatabase()

  // ── Notes ──────────────────────────────────────────────
  ipcMain.handle('notes:getAll', () => notes.getAll())
  ipcMain.handle('notes:getById', (_e, id: string) => notes.getById(id))
  ipcMain.handle('notes:create', (_e, data: { title?: string; content?: string }) => notes.create(data))
  ipcMain.handle('notes:update', (_e, id: string, data: { title?: string; content?: string }) => notes.update(id, data))
  ipcMain.handle('notes:delete', (_e, id: string) => notes.delete(id))
  ipcMain.handle('notes:search', (_e, query: string) => notes.search(query))

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
