import { contextBridge, ipcRenderer } from 'electron'

// Type-safe API exposed to the renderer process
const api = {
  // ── Notes ──────────────────────────────────────────────
  getNotes: () => ipcRenderer.invoke('notes:getAll'),
  getNote: (id: string) => ipcRenderer.invoke('notes:getById', id),
  createNote: (data: { title?: string; content?: string }) =>
    ipcRenderer.invoke('notes:create', data),
  updateNote: (id: string, data: { title?: string; content?: string }) =>
    ipcRenderer.invoke('notes:update', id, data),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),
  searchNotes: (query: string) => ipcRenderer.invoke('notes:search', query),
  getDirtyNotes: () => ipcRenderer.invoke('notes:getDirty'),
  markNoteSynced: (id: string, syncVersion: number) =>
    ipcRenderer.invoke('notes:markSynced', id, syncVersion),
  upsertNoteFromCloud: (cloudNote: any, options?: { force?: boolean }) =>
    ipcRenderer.invoke('notes:upsertFromCloud', cloudNote, options),
  claimLocalNotes: (userId: string) =>
    ipcRenderer.invoke('notes:claimLocalNotes', userId),

  // ── Tags ───────────────────────────────────────────────
  getTags: () => ipcRenderer.invoke('tags:getAll'),
  createTag: (data: { name: string; color?: string }) =>
    ipcRenderer.invoke('tags:create', data),
  deleteTag: (id: string) => ipcRenderer.invoke('tags:delete', id),
  addTagToNote: (noteId: string, tagId: string) =>
    ipcRenderer.invoke('tags:addToNote', noteId, tagId),
  removeTagFromNote: (noteId: string, tagId: string) =>
    ipcRenderer.invoke('tags:removeFromNote', noteId, tagId),
  getNoteTags: (noteId: string) => ipcRenderer.invoke('tags:getForNote', noteId),

  // ── Attachments ────────────────────────────────────────
  addAttachment: (noteId: string, filePath: string) =>
    ipcRenderer.invoke('attachments:add', noteId, filePath),
  getAttachments: (noteId: string) =>
    ipcRenderer.invoke('attachments:getForNote', noteId),
  deleteAttachment: (id: string) =>
    ipcRenderer.invoke('attachments:delete', id),
  openAttachment: (id: string) =>
    ipcRenderer.invoke('attachments:open', id),

  // ── Window Control ─────────────────────────────────────
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // ── Secure Auth Storage ───────────────────────────────
  getAuthSession: () => ipcRenderer.invoke('auth:getSession'),
  saveAuthSession: (session: { token: string; userId: string; email?: string }) =>
    ipcRenderer.invoke('auth:saveSession', session),
  clearAuthSession: () => ipcRenderer.invoke('auth:clearSession'),
  getEncryptionKey: (userId: string) => ipcRenderer.invoke('auth:getEncryptionKey', userId),
  saveEncryptionKey: (userId: string, key: string) =>
    ipcRenderer.invoke('auth:saveEncryptionKey', userId, key),
  clearEncryptionKey: (userId: string) => ipcRenderer.invoke('auth:clearEncryptionKey', userId),

  // ── App Events ─────────────────────────────────────────
  onMainProcessMessage: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('main-process-message', listener)
    return () => {
      ipcRenderer.removeListener('main-process-message', listener)
    }
  },
  onCreateNewNote: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('create-new-note', listener)
    return () => {
      ipcRenderer.removeListener('create-new-note', listener)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
