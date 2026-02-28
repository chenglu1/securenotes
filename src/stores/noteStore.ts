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
  
  // ── Auth State ──
  isAuthenticated: boolean
  userId: string | null
  token: string | null
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'

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
  
  // ── Auth Actions ──
  initAuth: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  pullFromCloud: () => Promise<void>
  syncToCloud: () => Promise<void>
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  searchQuery: '',
  tags: [],
  isLoading: false,
  
  // Auth state
  isAuthenticated: !!localStorage.getItem('auth_token'),
  userId: localStorage.getItem('user_id'),
  token: localStorage.getItem('auth_token'),
  syncStatus: 'idle',

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

  // ── Auth Methods ──
  initAuth: async () => {
    const token = localStorage.getItem('auth_token')
    const userId = localStorage.getItem('user_id')
    
    if (token && userId) {
      console.log('🔐 Found saved auth, restoring session...')
      set({ isAuthenticated: true, userId, token })
      
      // 登录后自动拉取云端数据
      try {
        await get().pullFromCloud()
        await get().loadNotes()
        console.log('✅ Session restored and synced')
      } catch (err) {
        console.error('❌ Failed to sync on init:', err)
      }
    }
  },

  login: async (email, password) => {
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '登录失败')
      }
      
      const { token, userId } = await response.json()
      
      // Save to localStorage
      localStorage.setItem('auth_token', token)
      localStorage.setItem('user_id', userId)
      
      set({ isAuthenticated: true, userId, token })
      
      // Sync after login
      await get().syncToCloud()
    } catch (err) {
      console.error('Login failed:', err)
      throw err
    }
  },

  register: async (email, password) => {
    try {
      const response = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '注册失败')
      }
      
      const { token, userId } = await response.json()
      
      // Save to localStorage
      localStorage.setItem('auth_token', token)
      localStorage.setItem('user_id', userId)
      
      set({ isAuthenticated: true, userId, token })
      
      // Sync after register
      await get().syncToCloud()
    } catch (err) {
      console.error('Register failed:', err)
      throw err
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_id')
    set({ isAuthenticated: false, userId: null, token: null })
  },

  pullFromCloud: async () => {
    const { token } = get()
    if (!token) return

    try {
      console.log('⬇️ Pulling notes from cloud...')
      
      // 获取云端所有笔记
      const response = await fetch('http://localhost:3000/api/sync/notes', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch cloud notes')
      }

      const cloudNotes = await response.json()
      console.log(`📥 Received ${cloudNotes.length} notes from cloud`)

      // 将云端笔记同步到本地
      for (const cloudNote of cloudNotes) {
        await window.api.upsertNoteFromCloud({
          id: cloudNote.id,
          title: cloudNote.encryptedTitle, // TODO: decrypt
          content: cloudNote.encryptedContent, // TODO: decrypt
          syncVersion: cloudNote.syncVersion,
          createdAt: cloudNote.createdAt,
          updatedAt: cloudNote.updatedAt,
          deletedAt: cloudNote.deletedAt,
        })
      }

      console.log('✅ Pull completed')
    } catch (err) {
      console.error('❌ Pull failed:', err)
      throw err
    }
  },

  syncToCloud: async () => {
    const { token } = get()
    if (!token) return

    set({ syncStatus: 'syncing' })
    
    try {
      // 第一步：从云端拉取最新数据
      await get().pullFromCloud()

      // 第二步：推送本地脏笔记到云端
      const dirtyNotes = await window.api.getDirtyNotes()
      
      console.log(`⬆️ Pushing ${dirtyNotes.length} dirty notes to cloud...`)
      
      let successCount = 0
      let errorCount = 0
      
      for (const note of dirtyNotes) {
        try {
          const response = await fetch('http://localhost:3000/api/sync/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: note.id,
              encryptedTitle: note.title, // TODO: encrypt
              encryptedContent: note.content, // TODO: encrypt
              syncVersion: note.sync_version,
              deletedAt: note.deleted_at,
            }),
          })
          
          if (!response.ok) {
            const error = await response.json()
            console.error(`❌ Failed to sync note ${note.id}:`, error)
            errorCount++
          } else {
            const result = await response.json()
            console.log(`✅ Pushed note: ${note.title || '(untitled)'}`)
            
            // 使用专用的 markSynced 方法更新同步状态
            await window.api.markNoteSynced(note.id, result.note.syncVersion)
            successCount++
          }
        } catch (err) {
          console.error(`❌ Error syncing note ${note.id}:`, err)
          errorCount++
        }
      }
      
      set({ syncStatus: 'success' })
      console.log(`🎉 Sync completed: ${successCount} pushed, ${errorCount} failed`)
      
      // 重新加载笔记列表
      await get().loadNotes()
    } catch (err) {
      console.error('❌ Sync failed:', err)
      set({ syncStatus: 'error' })
    }
  },
}))
