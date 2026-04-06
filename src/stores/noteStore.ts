import { create } from 'zustand'
import { apiUrl, getErrorMessage, isFetchError, readJson } from '../services/api'
import { decryptText, deriveEncryptionKey, encryptText } from '../services/crypto'

export interface Note {
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

export interface Tag {
  id: string
  name: string
  color: string
}

interface AuthResponse {
  token: string
  userId: string
  keySalt: string
  email?: string
  message?: string | string[]
  error?: string
}

interface CloudNote {
  id: string
  encryptedTitle: string
  encryptedContent: string
  syncVersion: number
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

interface SyncPushResponse {
  success: true
  status: 'created' | 'updated'
  note: CloudNote
  message?: string | string[]
  error?: string
}

interface SyncConflictResponse {
  status?: 'conflict'
  note?: CloudNote
  message?: string | string[]
  error?: string
}

type PushNoteResult =
  | { status: 'success'; note: CloudNote }
  | { status: 'conflict'; note?: CloudNote; message: string }
  | { status: 'error'; message: string }

async function clearAuthForReauth(userId: string | null) {
  await window.api.clearAuthSession()
  if (userId) {
    await window.api.clearEncryptionKey(userId)
  }
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user_id')
}

function toLocalCloudNote(cloudNote: CloudNote) {
  return {
    id: cloudNote.id,
    title: cloudNote.encryptedTitle,
    content: cloudNote.encryptedContent,
    syncVersion: cloudNote.syncVersion,
    createdAt: cloudNote.createdAt,
    updatedAt: cloudNote.updatedAt,
    deletedAt: cloudNote.deletedAt ?? null,
  }
}

function getPayloadNote(payload: SyncPushResponse | SyncConflictResponse | null): CloudNote | undefined {
  if (!payload || typeof payload !== 'object' || !('note' in payload)) {
    return undefined
  }

  return payload.note
}

function buildConflictCopyTitle(title: string): string {
  const baseTitle = title.trim() || '无标题笔记'
  return baseTitle.endsWith('（冲突副本）') ? baseTitle : `${baseTitle}（冲突副本）`
}

function decodeJwtEmail(token: string): string | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const parsed = JSON.parse(decoded) as { email?: unknown }
    return typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email : null
  } catch {
    return null
  }
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function hasSyncedSnapshot(note: Note): boolean {
  return (note.last_synced_version ?? 0) > 0
}

function isCloudSnapshotEqualToLocalSnapshot(
  note: Note,
  cloudSnapshot: { title: string; content: string; deletedAt: string | null; syncVersion: number },
): boolean {
  return (
    (note.last_synced_version ?? 0) === cloudSnapshot.syncVersion &&
    (note.last_synced_title ?? null) === cloudSnapshot.title &&
    (note.last_synced_content ?? null) === cloudSnapshot.content &&
    (note.last_synced_deleted_at ?? null) === cloudSnapshot.deletedAt
  )
}

function hasMeaningfulLocalContent(note: Note): boolean {
  return note.title.trim().length > 0 || note.content.trim().length > 0
}

async function applyCloudNoteToLocal(cloudNote: CloudNote, encryptionKey: string, force = false) {
  const decryptedTitle = await decryptText(cloudNote.encryptedTitle, encryptionKey)
  const decryptedContent = await decryptText(cloudNote.encryptedContent, encryptionKey)

  await window.api.upsertNoteFromCloud(
    toLocalCloudNote({
      ...cloudNote,
      encryptedTitle: decryptedTitle,
      encryptedContent: decryptedContent,
    }),
    { force },
  )

  return {
    title: decryptedTitle,
    content: decryptedContent,
    deletedAt: cloudNote.deletedAt ?? null,
  }
}

async function reconcileDirtyNotesWithCloud(cloudNotes: CloudNote[], encryptionKey: string): Promise<{ alignedCount: number; restoredCount: number }> {
  const cloudNotesById = new Map(cloudNotes.map((cloudNote) => [cloudNote.id, cloudNote]))
  const dirtyNotes = await window.api.getDirtyNotes()
  let alignedCount = 0
  let restoredCount = 0

  for (const localNote of dirtyNotes) {
    const cloudNote = cloudNotesById.get(localNote.id)
    if (!cloudNote) {
      continue
    }

    const decryptedTitle = await decryptText(cloudNote.encryptedTitle, encryptionKey)
    const decryptedContent = await decryptText(cloudNote.encryptedContent, encryptionKey)
    const cloudDeletedAt = cloudNote.deletedAt ?? null
    const cloudSnapshot = {
      title: decryptedTitle,
      content: decryptedContent,
      deletedAt: cloudDeletedAt,
      syncVersion: cloudNote.syncVersion,
    }

    if (
      localNote.title === decryptedTitle &&
      localNote.content === decryptedContent &&
      (localNote.deleted_at ?? null) === cloudDeletedAt
    ) {
      await applyCloudNoteToLocal(cloudNote, encryptionKey, true)
      alignedCount += 1
      continue
    }

    if (hasSyncedSnapshot(localNote) && isCloudSnapshotEqualToLocalSnapshot(localNote, cloudSnapshot)) {
      continue
    }

    if (!hasSyncedSnapshot(localNote) && localNote.sync_version === cloudNote.syncVersion) {
      const shouldRestoreCloudDirectly =
        (localNote.deleted_at && !cloudDeletedAt) ||
        (localNote.content.trim().length === 0 && decryptedContent.trim().length > 0)

      if (shouldRestoreCloudDirectly) {
        await applyCloudNoteToLocal(cloudNote, encryptionKey, true)
        restoredCount += 1
        continue
      }

      if (hasMeaningfulLocalContent(localNote)) {
        await window.api.createNote({
          title: buildConflictCopyTitle(localNote.title),
          content: localNote.content,
        })
      }

      await applyCloudNoteToLocal(cloudNote, encryptionKey, true)
      restoredCount += 1
      continue
    }

    if (localNote.deleted_at && !cloudDeletedAt) {
      const localUpdatedAt = parseTimestamp(localNote.updated_at)
      const cloudUpdatedAt = parseTimestamp(cloudNote.updatedAt)

      if (localUpdatedAt !== null && cloudUpdatedAt !== null && localUpdatedAt > cloudUpdatedAt) {
        continue
      }

      try {
        await applyCloudNoteToLocal(cloudNote, encryptionKey, true)
        restoredCount += 1
        console.warn(`ℹ️ Restored cloud note ${cloudNote.id} because a hidden local deletion would have overwritten it.`)
      } catch (restoreError) {
        console.error(`❌ Failed to restore cloud note ${cloudNote.id}:`, restoreError)
      }
    }
  }

  return { alignedCount, restoredCount }
}

async function pushNoteToCloud(note: Note, token: string, encryptionKey: string): Promise<PushNoteResult> {
  const encryptedTitle = await encryptText(note.title, encryptionKey)
  const encryptedContent = await encryptText(note.content, encryptionKey)

  const response = await fetch(apiUrl('/sync/push'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: note.id,
      encryptedTitle,
      encryptedContent,
      syncVersion: note.sync_version,
      deletedAt: note.deleted_at,
    }),
  })

  const payload = await readJson<SyncPushResponse | SyncConflictResponse>(response)

  if (response.status === 409) {
    return {
      status: 'conflict',
      note: getPayloadNote(payload),
      message: getErrorMessage(payload, '版本冲突'),
    }
  }

  const cloudNote = getPayloadNote(payload)
  if (!response.ok || !cloudNote) {
    return {
      status: 'error',
      message: getErrorMessage(payload, '同步失败'),
    }
  }

  return {
    status: 'success',
    note: cloudNote,
  }
}

async function resolveSyncConflict(note: Note, cloudNote: CloudNote, token: string, encryptionKey: string): Promise<'aligned' | 'preserved-copy' | 'failed'> {
  const cloudSnapshot = await applyCloudNoteToLocal(cloudNote, encryptionKey, false)

  const localDeletedAt = note.deleted_at ?? null
  if (
    note.title === cloudSnapshot.title &&
    note.content === cloudSnapshot.content &&
    localDeletedAt === cloudSnapshot.deletedAt
  ) {
    await applyCloudNoteToLocal(cloudNote, encryptionKey, true)
    return 'aligned'
  }

  const conflictCopy = await window.api.createNote({
    title: buildConflictCopyTitle(note.title),
    content: note.content,
  })

  if (!conflictCopy) {
    return 'failed'
  }

  await applyCloudNoteToLocal(cloudNote, encryptionKey, true)

  const copySyncResult = await pushNoteToCloud(conflictCopy, token, encryptionKey)
  if (copySyncResult.status === 'success') {
    await window.api.markNoteSynced(conflictCopy.id, copySyncResult.note.syncVersion)
  } else if (copySyncResult.status === 'conflict') {
    console.warn(`⚠️ Conflict copy ${conflictCopy.id} still conflicted: ${copySyncResult.message}`)
  } else {
    console.warn(`⚠️ Conflict copy ${conflictCopy.id} will stay local until next sync: ${copySyncResult.message}`)
  }

  return 'preserved-copy'
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
  userEmail: string | null
  token: string | null
  encryptionKey: string | null
  syncStatus: 'idle' | 'syncing' | 'success' | 'error' | 'reauth-required'

  // ── Actions ──
  loadNotes: () => Promise<void>
  selectNote: (id: string | null) => void
  createNote: () => Promise<Note | null>
  updateNote: (id: string, data: { title?: string; content?: string }) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  loadTags: () => Promise<void>
  createTag: (name: string, color?: string) => Promise<Tag | null>
  deleteTag: (id: string) => Promise<void>
  
  // ── Auth Actions ──
  initAuth: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
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
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  token: null,
  encryptionKey: null,
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
      set({ notes, selectedNoteId: note.id, syncStatus: 'idle' })
      return note
    } catch (err) {
      console.error('Failed to create note:', err)
      return null
    }
  },

  updateNote: async (id, data) => {
    try {
      const currentNote = get().notes.find((note) => note.id === id)
      if (!currentNote) {
        return
      }

      const nextTitle = data.title ?? currentNote.title
      const nextContent = data.content ?? currentNote.content
      if (nextTitle === currentNote.title && nextContent === currentNote.content) {
        return
      }

      await window.api.updateNote(id, { title: nextTitle, content: nextContent })

      // Update local state without full reload for snappiness
      set((state) => ({
        notes: state.notes.map((n) =>
          n.id === id
            ? { ...n, title: nextTitle, content: nextContent, updated_at: new Date().toISOString(), is_dirty: 1 }
            : n
        ),
        syncStatus: 'idle',
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
        syncStatus: 'idle',
      })
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
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
    let session = await window.api.getAuthSession()

    if (!session) {
      const legacyToken = localStorage.getItem('auth_token')
      const legacyUserId = localStorage.getItem('user_id')
      if (legacyToken && legacyUserId) {
        session = { token: legacyToken, userId: legacyUserId, email: decodeJwtEmail(legacyToken) ?? undefined }
        await window.api.saveAuthSession(session)
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_id')
      }
    }
    
    if (session?.token && session.userId) {
      const encryptionKey = await window.api.getEncryptionKey(session.userId)
      const userEmail = session.email ?? decodeJwtEmail(session.token)

      if (!encryptionKey) {
        console.warn('⚠️ Missing encryption key for saved session, re-login is required.')
        await window.api.clearAuthSession()
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_id')
        set({
          isAuthenticated: false,
          userId: null,
          userEmail: null,
          token: null,
          encryptionKey: null,
          syncStatus: 'reauth-required',
        })
        return
      }

      console.log('🔐 Found saved auth, restoring session...')
      await window.api.claimLocalNotes(session.userId)
      set({
        isAuthenticated: true,
        userId: session.userId,
        userEmail,
        token: session.token,
        encryptionKey,
      })
      
      // 登录后自动拉取云端数据
      try {
        if (encryptionKey) {
          await get().pullFromCloud()
        }
        await get().loadNotes()
        console.log('✅ Session restored and synced')
      } catch (err) {
        console.error('❌ Failed to sync on init:', err)
      }
    }
  },

  login: async (email, password) => {
    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const payload = await readJson<AuthResponse>(response)
      
      if (!response.ok || !payload?.token || !payload.userId) {
        throw new Error(getErrorMessage(payload, '登录失败'))
      }
      
      const { token, userId, keySalt } = payload
      const userEmail = payload.email ?? decodeJwtEmail(token)
      const encryptionKey = await deriveEncryptionKey(password, keySalt)
      
      await window.api.saveAuthSession({ token, userId, email: userEmail ?? undefined })
      await window.api.saveEncryptionKey(userId, encryptionKey)
      await window.api.claimLocalNotes(userId)
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_id')
      
      set({ isAuthenticated: true, userId, userEmail, token, encryptionKey, syncStatus: 'idle' })
      
      // Sync after login
      await get().syncToCloud()
    } catch (err) {
      console.error('Login failed:', err)
      throw err
    }
  },

  register: async (email, password) => {
    try {
      const response = await fetch(apiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const payload = await readJson<AuthResponse>(response)
      
      if (!response.ok || !payload?.token || !payload.userId) {
        throw new Error(getErrorMessage(payload, '注册失败'))
      }
      
      const { token, userId, keySalt } = payload
      const userEmail = payload.email ?? decodeJwtEmail(token)
      const encryptionKey = await deriveEncryptionKey(password, keySalt)
      
      await window.api.saveAuthSession({ token, userId, email: userEmail ?? undefined })
      await window.api.saveEncryptionKey(userId, encryptionKey)
      await window.api.claimLocalNotes(userId)
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_id')
      
      set({ isAuthenticated: true, userId, userEmail, token, encryptionKey, syncStatus: 'idle' })
      
      // Sync after register
      await get().syncToCloud()
    } catch (err) {
      console.error('Register failed:', err)
      throw err
    }
  },

  logout: async () => {
    const { userId } = get()
    await window.api.clearAuthSession()
    if (userId) {
      await window.api.clearEncryptionKey(userId)
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_id')
    set({
      notes: [],
      selectedNoteId: null,
      isAuthenticated: false,
      userId: null,
      userEmail: null,
      token: null,
      encryptionKey: null,
      syncStatus: 'idle',
    })
    await get().loadNotes()
  },

  pullFromCloud: async () => {
    const { token, encryptionKey, userId } = get()
    if (!token || !encryptionKey) {
      await clearAuthForReauth(userId)
      set({
        isAuthenticated: false,
        userId: null,
        userEmail: null,
        token: null,
        encryptionKey: null,
        syncStatus: 'reauth-required',
      })
      throw new Error('请重新登录以恢复加密同步')
    }

    try {
      console.log('⬇️ Pulling notes from cloud...')
      
      // 获取云端所有笔记
      const response = await fetch(apiUrl('/sync/notes'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.status === 401 || response.status === 403) {
        await clearAuthForReauth(userId)
        set({
          notes: [],
          selectedNoteId: null,
          isAuthenticated: false,
          userId: null,
          userEmail: null,
          token: null,
          encryptionKey: null,
          syncStatus: 'reauth-required',
        })
        throw new Error('当前登录态属于其他后端环境，请重新登录。')
      }

      const cloudNotes = await readJson<CloudNote[]>(response)

      if (!response.ok || !Array.isArray(cloudNotes)) {
        throw new Error('Failed to fetch cloud notes')
      }

      console.log(`📥 Received ${cloudNotes.length} notes from cloud`)

      // 将云端笔记同步到本地
      for (const cloudNote of cloudNotes) {
        try {
          await applyCloudNoteToLocal(cloudNote, encryptionKey)
        } catch (decryptError) {
          console.error(`❌ Failed to decrypt note ${cloudNote.id}:`, decryptError)
        }
      }

      const { alignedCount, restoredCount } = await reconcileDirtyNotesWithCloud(cloudNotes, encryptionKey)
      if (alignedCount > 0) {
        console.warn(`ℹ️ Cleared ${alignedCount} false local dirty marks that already matched the cloud snapshot.`)
      }

      if (restoredCount > 0) {
        console.warn(`⚠️ Prevented ${restoredCount} hidden local deletions from overwriting cloud notes.`)
      }

      console.log('✅ Pull completed')
    } catch (err) {
      // 网络不可达（未启动同步服务器）时静默忽略，不影响本地功能
      if (isFetchError(err)) {
        console.warn('⚠️ Sync server not reachable, skipping pull.')
        return
      }
      console.error('❌ Pull failed:', err)
      throw err
    }
  },

  syncToCloud: async () => {
    const { token, encryptionKey, userId } = get()
    if (!token || !encryptionKey) {
      await clearAuthForReauth(userId)
      set({
        isAuthenticated: false,
        userId: null,
        userEmail: null,
        token: null,
        encryptionKey: null,
        syncStatus: 'reauth-required',
      })
      return
    }

    set({ syncStatus: 'syncing' })
    
    try {
      // 第一步：从云端拉取最新数据
      await get().pullFromCloud()

      // 第二步：推送本地脏笔记到云端
      const dirtyNotes = await window.api.getDirtyNotes()
      
      console.log(`⬆️ Pushing ${dirtyNotes.length} dirty notes to cloud...`)
      
      let successCount = 0
      let conflictCount = 0
      let errorCount = 0
      
      for (const note of dirtyNotes) {
        try {
          const pushResult = await pushNoteToCloud(note, token, encryptionKey)

          if (pushResult.status === 'conflict') {
            if (!pushResult.note) {
              console.warn(`⚠️ Sync conflict for note ${note.id}: ${pushResult.message}`)
              conflictCount++
              continue
            }

            const resolution = await resolveSyncConflict(note, pushResult.note, token, encryptionKey)
            if (resolution === 'failed') {
              console.warn(`⚠️ Failed to resolve sync conflict for note ${note.id}`)
              conflictCount++
              continue
            }

            console.warn(
              resolution === 'aligned'
                ? `ℹ️ Resolved version drift for note ${note.id}`
                : `ℹ️ Preserved a conflict copy for note ${note.id} and restored the cloud version locally`,
            )
            successCount++
            continue
          }

          if (pushResult.status === 'error') {
            console.error(`❌ Failed to sync note ${note.id}: ${pushResult.message}`)
            errorCount++
          } else {
            console.log(`✅ Pushed note: ${note.title || '(untitled)'}`)
            
            // 使用专用的 markSynced 方法更新同步状态
            await window.api.markNoteSynced(note.id, pushResult.note.syncVersion)
            successCount++
          }
        } catch (err) {
          console.error(`❌ Error syncing note ${note.id}:`, err)
          errorCount++
        }
      }
      
      const hasFailures = conflictCount > 0 || errorCount > 0
      set({ syncStatus: hasFailures ? 'error' : 'success' })
      console.log(`🎉 Sync completed: ${successCount} pushed, ${conflictCount} conflicts, ${errorCount} failed`)
      
      // 重新加载笔记列表
      await get().loadNotes()
    } catch (err) {
      console.error('❌ Sync failed:', err)
      set({ syncStatus: 'error' })
    }
  },
}))
