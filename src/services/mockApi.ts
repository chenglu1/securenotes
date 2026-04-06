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
}

interface Tag {
  id: string
  name: string
  color: string
}

let notes: Note[] = []
let tags: Tag[] = []
const noteTags: Map<string, string[]> = new Map()
const noop = () => {}
let authSession: { token: string; userId: string } | null = null
const encryptionKeys = new Map<string, string>()

export const mockApi = {
  getNotes: async () => notes.filter((n) => !n.deleted_at),
  getNote: async (id: string) => notes.find((n) => n.id === id && !n.deleted_at),
  createNote: async (data: { title?: string; content?: string }) => {
    const now = new Date().toISOString()
    const note: Note = {
      id: uuid(),
      title: data.title ?? '',
      content: data.content ?? '',
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_version: 0,
      is_dirty: 1,
    }
    notes.unshift(note)
    return note
  },
  updateNote: async (id: string, data: { title?: string; content?: string }) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return undefined
    if (data.title !== undefined) note.title = data.title
    if (data.content !== undefined) note.content = data.content
    note.updated_at = new Date().toISOString()
    note.is_dirty = 1
    return note
  },
  deleteNote: async (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (note) {
      note.deleted_at = new Date().toISOString()
      note.is_dirty = 1
    }
    return !!note
  },
  searchNotes: async (query: string) => {
    const q = query.toLowerCase()
    return notes.filter(
      (n) =>
        !n.deleted_at &&
        (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    )
  },
  getDirtyNotes: async () => notes.filter((n) => n.is_dirty === 1),
  markNoteSynced: async (id: string, syncVersion: number) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    note.is_dirty = 0
    note.sync_version = syncVersion
  },
  upsertNoteFromCloud: async (cloudNote: {
    id: string
    title: string
    content: string
    syncVersion: number
    createdAt: string
    updatedAt: string
    deletedAt?: string | null
  }) => {
    const existing = notes.find((note) => note.id === cloudNote.id)
    if (!existing) {
      const insertedNote: Note = {
        id: cloudNote.id,
        title: cloudNote.title,
        content: cloudNote.content,
        created_at: cloudNote.createdAt,
        updated_at: cloudNote.updatedAt,
        deleted_at: cloudNote.deletedAt ?? null,
        sync_version: cloudNote.syncVersion,
        is_dirty: 0,
      }
      notes.unshift(insertedNote)
      return insertedNote
    }

    if (existing.is_dirty === 1 || existing.sync_version >= cloudNote.syncVersion) {
      return existing
    }

    existing.title = cloudNote.title
    existing.content = cloudNote.content
    existing.updated_at = cloudNote.updatedAt
    existing.deleted_at = cloudNote.deletedAt ?? null
    existing.sync_version = cloudNote.syncVersion
    existing.is_dirty = 0
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
  saveAuthSession: async (session: { token: string; userId: string }) => {
    authSession = session
  },
  clearAuthSession: async () => {
    authSession = null
  },
  getEncryptionKey: async (userId: string) => encryptionKeys.get(userId) ?? null,
  saveEncryptionKey: async (userId: string, key: string) => {
    encryptionKeys.set(userId, key)
  },
  clearEncryptionKey: async (userId: string) => {
    encryptionKeys.delete(userId)
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
