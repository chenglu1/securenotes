import { contextBridge, ipcRenderer } from 'electron'
import type { NewsDigest, NewsSettingsInput, NewsSettingsView } from './news/types'

export interface GoogleAuthResult {
  token: string
  userId: string
  keySalt: string
  email?: string
  isNewUser?: boolean
}

// Type-safe API exposed to the renderer process
const api = {
  // ── Notes ──────────────────────────────────────────────
  getNoteSummaries: (query?: string) => ipcRenderer.invoke('notes:listSummaries', query),
  getNote: (id: string) => ipcRenderer.invoke('notes:getById', id),
  createNote: (data: { title?: string; content?: string }) =>
    ipcRenderer.invoke('notes:create', data),
  updateNote: (id: string, data: { title?: string; content?: string }) =>
    ipcRenderer.invoke('notes:update', id, data),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),
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
  startGoogleLogin: (startUrl: string): Promise<GoogleAuthResult> =>
    ipcRenderer.invoke('auth:startGoogleLogin', startUrl),
  getEncryptionKey: (userId: string) => ipcRenderer.invoke('auth:getEncryptionKey', userId),
  saveEncryptionKey: (userId: string, key: string) =>
    ipcRenderer.invoke('auth:saveEncryptionKey', userId, key),
  clearEncryptionKey: (userId: string) => ipcRenderer.invoke('auth:clearEncryptionKey', userId),
  getNoteSyncCursor: (userId: string) => ipcRenderer.invoke('auth:getNoteSyncCursor', userId),
  saveNoteSyncCursor: (userId: string, cursor: number) =>
    ipcRenderer.invoke('auth:saveNoteSyncCursor', userId, cursor),
  clearNoteSyncCursor: (userId: string) => ipcRenderer.invoke('auth:clearNoteSyncCursor', userId),

  // ── News Digest ───────────────────────────────────────
  getNewsSettings: (): Promise<NewsSettingsView | null> => ipcRenderer.invoke('news:getSettings'),
  saveNewsSettings: (input: NewsSettingsInput): Promise<NewsSettingsView> =>
    ipcRenderer.invoke('news:saveSettings', input),
  getLatestNewsDigest: (): Promise<NewsDigest | null> => ipcRenderer.invoke('news:getLatestDigest'),
  runNewsDigestNow: (): Promise<NewsDigest> => ipcRenderer.invoke('news:runNow'),
  openNewsLogFile: (): Promise<void> => ipcRenderer.invoke('news:openLogFile'),

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
  onNewsDigestReady: (callback: (payload: { digestDate: string; trigger: 'manual' | 'scheduled' }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { digestDate: string; trigger: 'manual' | 'scheduled' }) => callback(payload)
    ipcRenderer.on('news:digest-ready', listener)
    return () => {
      ipcRenderer.removeListener('news:digest-ready', listener)
    }
  },
  onOpenNewsDigest: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('news:open-digest', listener)
    return () => {
      ipcRenderer.removeListener('news:open-digest', listener)
    }
  },
  onOpenNewsSettings: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('news:open-settings', listener)
    return () => {
      ipcRenderer.removeListener('news:open-settings', listener)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
