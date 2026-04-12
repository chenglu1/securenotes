// Mock API for browser-based development (when window.api is not available)
// In production, the real IPC API is injected via Electron's preload script

import { v4 as uuid } from 'uuid'

interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_version: number
  is_dirty: number
  last_synced_title?: string | null
  last_synced_content?: string | null
  last_synced_deleted_at?: string | null
  last_synced_version?: number
}

interface NoteSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_version: number
  is_dirty: number
}

type StoredNote = Note & { owner_user_id: string }

interface Tag {
  id: string
  name: string
  color: string
}

let notes: StoredNote[] = []
let tags: Tag[] = []
const noteTags: Map<string, string[]> = new Map()
const noop = () => {}
let authSession: { token: string; userId: string; email?: string } | null = null
const encryptionKeys = new Map<string, string>()
const noteSyncCursors = new Map<string, number>()
const LOCAL_NOTE_SCOPE = '__local__'

function isPristineLocalDraft(note: Pick<StoredNote, 'title' | 'content' | 'created_at' | 'updated_at' | 'deleted_at' | 'sync_version' | 'last_synced_version'>) {
  return (
    !note.deleted_at &&
    (note.sync_version ?? 0) === 0 &&
    (note.last_synced_version ?? 0) === 0 &&
    note.created_at === note.updated_at &&
    note.title.trim().length === 0 &&
    note.content.trim().length === 0
  )
}

function getCurrentScope() {
  return authSession?.userId ?? LOCAL_NOTE_SCOPE
}

export const mockApi = {
  getNoteSummaries: async (query?: string): Promise<NoteSummary[]> => {
    const normalizedQuery = query?.trim().toLowerCase()
    return notes
      .filter((note) => {
        if (note.owner_user_id !== getCurrentScope() || note.deleted_at) {
          return false
        }

        if (!normalizedQuery) {
          return true
        }

        return note.title.toLowerCase().includes(normalizedQuery)
      })
      .map((note) => ({
        id: note.id,
        title: note.title,
        created_at: note.created_at,
        updated_at: note.updated_at,
        deleted_at: note.deleted_at,
        sync_version: note.sync_version,
        is_dirty: note.is_dirty,
      }))
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  },
  getNote: async (id: string) => notes.find((n) => n.id === id && n.owner_user_id === getCurrentScope() && !n.deleted_at),
  createNote: async (data: { title?: string; content?: string }) => {
    const now = new Date().toISOString()
    const note: StoredNote = {
      id: uuid(),
      owner_user_id: getCurrentScope(),
      title: data.title ?? '',
      content: data.content ?? '',
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_version: 0,
      is_dirty: 0,
      last_synced_title: null,
      last_synced_content: null,
      last_synced_deleted_at: null,
      last_synced_version: 0,
    }
    notes.unshift(note)
    return note
  },
  updateNote: async (id: string, data: { title?: string; content?: string }) => {
    const note = notes.find((n) => n.id === id && n.owner_user_id === getCurrentScope())
    if (!note) return undefined

    const nextTitle = data.title ?? note.title
    const nextContent = data.content ?? note.content
    if (nextTitle === note.title && nextContent === note.content) {
      return note
    }

    note.title = nextTitle
    note.content = nextContent
    note.updated_at = new Date().toISOString()
    note.is_dirty = 1
    return note
  },
  deleteNote: async (id: string) => {
    const noteIndex = notes.findIndex((n) => n.id === id && n.owner_user_id === getCurrentScope())
    const note = noteIndex >= 0 ? notes[noteIndex] : undefined
    if (note) {
      if (isPristineLocalDraft(note) || ((note.sync_version ?? 0) === 0 && (note.last_synced_version ?? 0) === 0)) {
        notes.splice(noteIndex, 1)
        return true
      }

      note.deleted_at = new Date().toISOString()
      note.is_dirty = 1
    }
    return !!note
  },
  getDirtyNotes: async () => notes.filter((n) => n.owner_user_id === getCurrentScope() && n.is_dirty === 1 && !isPristineLocalDraft(n)),
  markNoteSynced: async (id: string, syncVersion: number) => {
    const note = notes.find((n) => n.id === id && n.owner_user_id === getCurrentScope())
    if (!note) return
    note.is_dirty = 0
    note.sync_version = syncVersion
    note.last_synced_version = syncVersion
    note.last_synced_title = note.title
    note.last_synced_content = note.content
    note.last_synced_deleted_at = note.deleted_at
  },
  claimLocalNotes: async (userId: string) => {
    let count = 0
    for (const note of notes) {
      if (note.owner_user_id === LOCAL_NOTE_SCOPE) {
        note.owner_user_id = userId
        count++
      }
    }
    return count
  },
  upsertNoteFromCloud: async (cloudNote: {
    id: string
    title: string
    content: string
    syncVersion: number
    createdAt: string
    updatedAt: string
    deletedAt?: string | null
  }, options?: { force?: boolean }) => {
    const force = options?.force === true
    const existing = notes.find(
      (note) => note.id === cloudNote.id && note.owner_user_id === getCurrentScope()
    )
    if (!existing) {
      const insertedNote: StoredNote = {
        id: cloudNote.id,
        owner_user_id: getCurrentScope(),
        title: cloudNote.title,
        content: cloudNote.content,
        created_at: cloudNote.createdAt,
        updated_at: cloudNote.updatedAt,
        deleted_at: cloudNote.deletedAt ?? null,
        sync_version: cloudNote.syncVersion,
        is_dirty: 0,
        last_synced_title: cloudNote.title,
        last_synced_content: cloudNote.content,
        last_synced_deleted_at: cloudNote.deletedAt ?? null,
        last_synced_version: cloudNote.syncVersion,
      }
      notes.unshift(insertedNote)
      return insertedNote
    }

    if (!force && (existing.is_dirty === 1 || existing.sync_version >= cloudNote.syncVersion)) {
      return existing
    }

    existing.title = cloudNote.title
    existing.content = cloudNote.content
    existing.updated_at = cloudNote.updatedAt
    existing.deleted_at = cloudNote.deletedAt ?? null
    existing.sync_version = cloudNote.syncVersion
    existing.is_dirty = 0
    existing.last_synced_title = cloudNote.title
    existing.last_synced_content = cloudNote.content
    existing.last_synced_deleted_at = cloudNote.deletedAt ?? null
    existing.last_synced_version = cloudNote.syncVersion
    return existing
  },
  getTags: async () => tags,
  createTag: async (data: { name: string; color?: string }) => {
    const tag: Tag = { id: uuid(), name: data.name, color: data.color ?? '#6366f1' }
    tags.push(tag)
    return tag
  },
  deleteTag: async (id: string) => {
    tags = tags.filter((t) => t.id !== id)
    return true
  },
  addTagToNote: async (noteId: string, tagId: string) => {
    const current = noteTags.get(noteId) ?? []
    if (!current.includes(tagId)) current.push(tagId)
    noteTags.set(noteId, current)
  },
  removeTagFromNote: async (noteId: string, tagId: string) => {
    const current = noteTags.get(noteId) ?? []
    noteTags.set(noteId, current.filter((t) => t !== tagId))
  },
  getNoteTags: async (noteId: string) => {
    const tagIds = noteTags.get(noteId) ?? []
    return tags.filter((t) => tagIds.includes(t.id))
  },
  addAttachment: async () => null,
  getAttachments: async () => [],
  deleteAttachment: async () => false,
  openAttachment: async () => false,
  minimizeWindow: async () => undefined,
  maximizeWindow: async () => undefined,
  closeWindow: async () => undefined,
  hideWindow: async () => undefined,
  showWindow: async () => undefined,
  quitApp: async () => undefined,
  getAuthSession: async () => authSession,
  saveAuthSession: async (session: { token: string; userId: string; email?: string }) => {
    authSession = session
  },
  clearAuthSession: async () => {
    authSession = null
  },
  startGoogleLogin: async () => {
    throw new Error('浏览器模式下不支持 Google OAuth 桌面登录，请使用 Electron 客户端。')
  },
  getEncryptionKey: async (userId: string) => encryptionKeys.get(userId) ?? null,
  saveEncryptionKey: async (userId: string, key: string) => {
    encryptionKeys.set(userId, key)
  },
  clearEncryptionKey: async (userId: string) => {
    encryptionKeys.delete(userId)
  },
  getNoteSyncCursor: async (userId: string) => noteSyncCursors.get(userId) ?? 0,
  saveNoteSyncCursor: async (userId: string, cursor: number) => {
    noteSyncCursors.set(userId, cursor)
  },
  clearNoteSyncCursor: async (userId: string) => {
    noteSyncCursors.delete(userId)
  },
  onMainProcessMessage: () => noop,
  onCreateNewNote: () => noop,
}

// Install mock API if running in browser (not in Electron)
export function installMockApi() {
  if (typeof window !== 'undefined' && !(window as any).api) {
    ;(window as any).api = mockApi
    console.log('[SecureNotes] Running in browser mode with mock API')
  }
}
