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

  // ── App Events ─────────────────────────────────────────
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (_event, message) => callback(message))
  },
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
