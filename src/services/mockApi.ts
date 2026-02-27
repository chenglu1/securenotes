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
    return note
  },
  deleteNote: async (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (note) note.deleted_at = new Date().toISOString()
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
  onMainProcessMessage: () => {},
}

// Install mock API if running in browser (not in Electron)
export function installMockApi() {
  if (typeof window !== 'undefined' && !(window as any).api) {
    ;(window as any).api = mockApi
    console.log('[SecureNotes] Running in browser mode with mock API')
  }
}
