import { create } from 'zustand'

export interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_version: number
  is_dirty: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

interface NoteStore {
  // ── State ──
  notes: Note[]
  selectedNoteId: string | null
  searchQuery: string
  tags: Tag[]
  isLoading: boolean

  // ── Actions ──
  loadNotes: () => Promise<void>
  selectNote: (id: string | null) => void
  createNote: () => Promise<Note | null>
  updateNote: (id: string, data: { title?: string; content?: string }) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  searchNotes: (query: string) => Promise<void>
  loadTags: () => Promise<void>
  createTag: (name: string, color?: string) => Promise<Tag | null>
  deleteTag: (id: string) => Promise<void>
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  searchQuery: '',
  tags: [],
  isLoading: false,

  loadNotes: async () => {
    set({ isLoading: true })
    try {
      const notes = await window.api.getNotes()
      set({ notes, isLoading: false })
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ isLoading: false })
    }
  },

  selectNote: (id) => {
    set({ selectedNoteId: id })
  },

  createNote: async () => {
    try {
      const note = await window.api.createNote({
        title: '',
        content: '',
      })
      const notes = await window.api.getNotes()
      set({ notes, selectedNoteId: note.id })
      return note
    } catch (err) {
      console.error('Failed to create note:', err)
      return null
    }
  },

  updateNote: async (id, data) => {
    try {
      await window.api.updateNote(id, data)
      // Update local state without full reload for snappiness
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === id
            ? { ...n, ...data, updated_at: new Date().toISOString() }
            : n
        ),
      }))
    } catch (err) {
      console.error('Failed to update note:', err)
    }
  },

  deleteNote: async (id) => {
    try {
      await window.api.deleteNote(id)
      const { selectedNoteId } = get()
      const notes = await window.api.getNotes()
      set({
        notes,
        selectedNoteId: selectedNoteId === id ? null : selectedNoteId,
      })
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    if (query.trim()) {
      get().searchNotes(query)
    } else {
      get().loadNotes()
    }
  },

  searchNotes: async (query) => {
    try {
      const notes = await window.api.searchNotes(query)
      set({ notes })
    } catch (err) {
      console.error('Failed to search notes:', err)
    }
  },

  loadTags: async () => {
    try {
      const tags = await window.api.getTags()
      set({ tags })
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  },

  createTag: async (name, color) => {
    try {
      const tag = await window.api.createTag({ name, color })
      await get().loadTags()
      return tag
    } catch (err) {
      console.error('Failed to create tag:', err)
      return null
    }
  },

  deleteTag: async (id) => {
    try {
      await window.api.deleteTag(id)
      await get().loadTags()
    } catch (err) {
      console.error('Failed to delete tag:', err)
    }
  },
}))
