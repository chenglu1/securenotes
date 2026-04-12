import { create } from 'zustand'
import { ApiResponse, apiUrl, getErrorMessage, isFetchError, readJson, unwrapApiResponse } from '../services/api'
import { PLAINTEXT_SYNC_KEY, createKeyVerifier, decryptText, deriveEncryptionKey, encryptText } from '../services/crypto'

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

export interface NoteSummary {
  id: string
  title: string
  preview: string
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

interface AuthResponse {
  token: string
  userId: string
  keySalt: string
  email?: string
  isNewUser?: boolean
}

interface SyncKeyResponse {
  status: 'created' | 'verified'
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

interface NoteMutationResponse {
  action: 'created' | 'updated'
  note: CloudNote
}

interface NoteConflictResponse {
  action: 'conflict'
  note?: CloudNote
}

interface CloudNoteListResponse {
  items: CloudNote[]
  total: number
}

type EditorFlushHandler = () => Promise<void>
type SyncStatus = 'idle' | 'reauth-required'
type SyncActionStatus = 'idle' | 'syncing' | 'success' | 'error'

let noteSelectionRequestVersion = 0

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

function getPayloadNote(
  payload: ApiResponse<NoteMutationResponse | NoteConflictResponse> | null,
): CloudNote | undefined {
  const data = unwrapApiResponse(payload)
  if (!data || typeof data !== 'object' || !('note' in data)) {
    return undefined
  }

  return data.note
}

function buildConflictCopyTitle(title: string): string {
  const baseTitle = title.trim() || '无标题笔记'
  return baseTitle.endsWith('（冲突副本）') ? baseTitle : `${baseTitle}（冲突副本）`
}

async function fetchCloudNotesResponse(token: string): Promise<Response> {
  return fetch(apiUrl('/notes'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

async function pushCloudNoteResponse(
  note: Note,
  token: string,
  encryptedTitle: string,
  encryptedContent: string,
): Promise<Response> {
  return fetch(apiUrl(`/notes/${note.id}`), {
    method: 'PUT',
    headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      encryptedTitle,
      encryptedContent,
      syncVersion: note.sync_version,
      deletedAt: note.deleted_at,
    }),
  })
}

function decodeJwtEmail(token: string): string | null {
  const payload = decodeJwtPayload(token)
  const email = payload?.email
  return typeof email === 'string' && email.trim() ? email : null
}

function decodeJwtAuthMethod(token: string): 'password' | 'google' | null {
  const payload = decodeJwtPayload(token)
  return payload?.authMethod === 'google' || payload?.authMethod === 'password'
    ? payload.authMethod
    : null
}

function decodeJwtPayload(token: string): { email?: unknown; authMethod?: unknown } | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    return JSON.parse(decoded) as { email?: unknown; authMethod?: unknown }
  } catch {
    return null
  }
}

async function ensureRemoteSyncKey(token: string, encryptionKey: string): Promise<void> {
  const keyVerifier = await createKeyVerifier(encryptionKey)
  const response = await fetch(apiUrl('/auth/sync-key'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ keyVerifier }),
  })

  const payload = await readJson<ApiResponse<SyncKeyResponse>>(response)
  const data = unwrapApiResponse(payload)
  if (!response.ok || !data) {
    throw new Error(getErrorMessage(payload, '同步口令校验失败'))
  }
}

async function persistAuthenticatedSession(
  payload: AuthResponse,
  encryptionKey: string,
): Promise<{ userEmail: string | null }> {
  const userEmail = payload.email ?? decodeJwtEmail(payload.token)

  await window.api.saveAuthSession({
    token: payload.token,
    userId: payload.userId,
    email: userEmail ?? undefined,
  })
  await window.api.saveEncryptionKey(payload.userId, encryptionKey)
  await window.api.claimLocalNotes(payload.userId)
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user_id')

  return { userEmail }
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

function buildNotePreview(content: string): string {
  return content.slice(0, 240)
}

function toNoteSummary(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    preview: buildNotePreview(note.content),
    created_at: note.created_at,
    updated_at: note.updated_at,
    deleted_at: note.deleted_at,
    sync_version: note.sync_version,
    is_dirty: note.is_dirty,
  }
}

function upsertNoteSummary(noteSummaries: NoteSummary[], note: Note): NoteSummary[] {
  const nextSummary = toNoteSummary(note)
  const existingIndex = noteSummaries.findIndex((item) => item.id === note.id)
  const nextSummaries = existingIndex >= 0
    ? noteSummaries.map((item) => item.id === note.id ? nextSummary : item)
    : [nextSummary, ...noteSummaries]

  return nextSummaries.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
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

  const response = await pushCloudNoteResponse(
    note,
    token,
    encryptedTitle,
    encryptedContent,
  )

  const payload = await readJson<ApiResponse<NoteMutationResponse | NoteConflictResponse>>(response)

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
  notes: NoteSummary[]
  selectedNoteId: string | null
  selectedNote: Note | null
  activeEditorNoteId: string | null
  activeEditorFlush: EditorFlushHandler | null
  searchQuery: string
  tags: Tag[]
  isLoading: boolean
  
  // ── Auth State ──
  isAuthenticated: boolean
  userId: string | null
  userEmail: string | null
  token: string | null
  encryptionKey: string | null
  pendingGoogleAuth: AuthResponse | null
  syncStatus: SyncStatus
  syncAllStatus: SyncActionStatus
  syncCurrentStatus: SyncActionStatus

  // ── Actions ──
  loadNotes: () => Promise<void>
  loadSelectedNote: (id: string | null) => Promise<void>
  flushActiveEditor: () => Promise<void>
  registerActiveEditorFlush: (noteId: string, flushHandler: EditorFlushHandler) => void
  unregisterActiveEditorFlush: (noteId: string) => void
  selectNote: (id: string | null) => Promise<void>
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
  loginWithGoogle: () => Promise<void>
  completeGoogleLogin: (passphrase: string) => Promise<void>
  clearPendingGoogleAuth: () => void
  logout: () => Promise<void>
  pullFromCloud: () => Promise<void>
  syncNoteToCloud: (noteId: string) => Promise<void>
  syncToCloud: () => Promise<void>
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  selectedNote: null,
  activeEditorNoteId: null,
  activeEditorFlush: null,
  searchQuery: '',
  tags: [],
  isLoading: false,
  
  // Auth state
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  token: null,
  encryptionKey: null,
  pendingGoogleAuth: null,
  syncStatus: 'idle',
  syncAllStatus: 'idle',
  syncCurrentStatus: 'idle',

  loadNotes: async () => {
    set({ isLoading: true })
    try {
      const searchQuery = get().searchQuery.trim()
      const notes = await window.api.getNoteSummaries(searchQuery || undefined)
      const { selectedNoteId } = get()

      if (!selectedNoteId) {
        set({ notes, selectedNote: null, isLoading: false })
        return
      }

      const selectedNote = await window.api.getNote(selectedNoteId)
      set({
        notes,
        selectedNote: selectedNote ?? null,
        selectedNoteId: selectedNote ? selectedNoteId : null,
        isLoading: false,
      })
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ isLoading: false })
    }
  },

  loadSelectedNote: async (id) => {
    if (!id) {
      set({ selectedNote: null })
      return
    }

    try {
      const note = await window.api.getNote(id)
      set({
        selectedNote: note ?? null,
        selectedNoteId: note ? id : null,
      })
    } catch (err) {
      console.error(`Failed to load note detail (${id}):`, err)
      set({ selectedNote: null, selectedNoteId: null })
    }
  },

  flushActiveEditor: async () => {
    const flushHandler = get().activeEditorFlush
    if (!flushHandler) {
      return
    }

    try {
      await flushHandler()
    } catch (err) {
      console.error('Failed to flush active editor:', err)
    }
  },

  registerActiveEditorFlush: (noteId, flushHandler) => {
    set({ activeEditorNoteId: noteId, activeEditorFlush: flushHandler })
  },

  unregisterActiveEditorFlush: (noteId) => {
    set((state) =>
      state.activeEditorNoteId === noteId
        ? { activeEditorNoteId: null, activeEditorFlush: null }
        : {},
    )
  },

  selectNote: async (id) => {
    const currentId = get().selectedNoteId
    if (id === currentId) {
      return
    }

    const requestVersion = ++noteSelectionRequestVersion
    await get().flushActiveEditor()
    if (requestVersion !== noteSelectionRequestVersion) {
      return
    }

    set({ selectedNoteId: id, selectedNote: null, syncCurrentStatus: 'idle' })
    await get().loadSelectedNote(id)
  },

  createNote: async () => {
    try {
      await get().flushActiveEditor()
      const note = await window.api.createNote({
        title: '',
        content: '',
      })
      set({ selectedNoteId: note.id, selectedNote: note, syncStatus: 'idle', syncCurrentStatus: 'idle' })
      await get().loadNotes()
      return note
    } catch (err) {
      console.error('Failed to create note:', err)
      return null
    }
  },

  updateNote: async (id, data) => {
    try {
      const currentNote = get().selectedNote?.id === id
        ? get().selectedNote
        : await window.api.getNote(id)
      if (!currentNote) {
        return
      }

      const nextTitle = data.title ?? currentNote.title
      const nextContent = data.content ?? currentNote.content
      if (nextTitle === currentNote.title && nextContent === currentNote.content) {
        return
      }

      await window.api.updateNote(id, { title: nextTitle, content: nextContent })
      const updatedAt = new Date().toISOString()
      const updatedNote: Note = {
        ...currentNote,
        title: nextTitle,
        content: nextContent,
        updated_at: updatedAt,
        is_dirty: 1,
      }

      set((state) => ({
        notes: upsertNoteSummary(state.notes, updatedNote),
        selectedNote: state.selectedNoteId === id ? updatedNote : state.selectedNote,
        syncCurrentStatus: state.selectedNoteId === id ? 'idle' : state.syncCurrentStatus,
      }))
    } catch (err) {
      console.error('Failed to update note:', err)
    }
  },

  deleteNote: async (id) => {
    try {
      await window.api.deleteNote(id)
      const { selectedNoteId } = get()
      set({
        selectedNoteId: selectedNoteId === id ? null : selectedNoteId,
        selectedNote: selectedNoteId === id ? null : get().selectedNote,
        syncCurrentStatus: selectedNoteId === id ? 'idle' : get().syncCurrentStatus,
      })
      await get().loadNotes()
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
      let encryptionKey = await window.api.getEncryptionKey(session.userId)
      const userEmail = session.email ?? decodeJwtEmail(session.token)
      const authMethod = decodeJwtAuthMethod(session.token)

      if (!encryptionKey && authMethod === 'google') {
        encryptionKey = PLAINTEXT_SYNC_KEY
        await window.api.saveEncryptionKey(session.userId, encryptionKey)
      }

      if (!encryptionKey) {
        console.warn('⚠️ Missing encryption key for saved session, re-login is required.')
        await window.api.clearAuthSession()
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_id')
        set({
          notes: [],
          selectedNoteId: null,
          selectedNote: null,
          activeEditorNoteId: null,
          activeEditorFlush: null,
          isAuthenticated: false,
          userId: null,
          userEmail: null,
          token: null,
          encryptionKey: null,
          pendingGoogleAuth: null,
          syncStatus: 'reauth-required',
          syncAllStatus: 'idle',
          syncCurrentStatus: 'idle',
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
        pendingGoogleAuth: null,
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
      const payload = await readJson<ApiResponse<AuthResponse>>(response)
      const data = unwrapApiResponse(payload)
      
      if (!response.ok || !data?.token || !data.userId) {
        throw new Error(getErrorMessage(payload, '登录失败'))
      }
      
      const { token, userId, keySalt } = data
      const encryptionKey = await deriveEncryptionKey(password, keySalt)
      await ensureRemoteSyncKey(token, encryptionKey)
      const { userEmail } = await persistAuthenticatedSession(data, encryptionKey)
      
      set({ isAuthenticated: true, userId, userEmail, token, encryptionKey, pendingGoogleAuth: null, syncStatus: 'idle', syncAllStatus: 'idle', syncCurrentStatus: 'idle' })
      
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
      const payload = await readJson<ApiResponse<AuthResponse>>(response)
      const data = unwrapApiResponse(payload)
      
      if (!response.ok || !data?.token || !data.userId) {
        throw new Error(getErrorMessage(payload, '注册失败'))
      }
      
      const { token, userId, keySalt } = data
      const encryptionKey = await deriveEncryptionKey(password, keySalt)
      await ensureRemoteSyncKey(token, encryptionKey)
      const { userEmail } = await persistAuthenticatedSession(data, encryptionKey)
      
      set({ isAuthenticated: true, userId, userEmail, token, encryptionKey, pendingGoogleAuth: null, syncStatus: 'idle', syncAllStatus: 'idle', syncCurrentStatus: 'idle' })
      
      // Sync after register
      await get().syncToCloud()
    } catch (err) {
      console.error('Register failed:', err)
      throw err
    }
  },

  loginWithGoogle: async () => {
    try {
      const payload = await window.api.startGoogleLogin(apiUrl('/auth/google/start'))
      const cachedKey = await window.api.getEncryptionKey(payload.userId)
      const encryptionKey = cachedKey ?? PLAINTEXT_SYNC_KEY

      if (cachedKey && cachedKey !== PLAINTEXT_SYNC_KEY) {
        await ensureRemoteSyncKey(payload.token, cachedKey)
      }

      const { userEmail } = await persistAuthenticatedSession(payload, encryptionKey)

      set({
        isAuthenticated: true,
        userId: payload.userId,
        userEmail,
        token: payload.token,
        encryptionKey,
        pendingGoogleAuth: null,
        syncStatus: 'idle',
        syncAllStatus: 'idle',
        syncCurrentStatus: 'idle',
      })

      await get().syncToCloud()
    } catch (err) {
      console.error('Google login failed:', err)
      throw err
    }
  },

  completeGoogleLogin: async (passphrase) => {
    const payload = get().pendingGoogleAuth
    if (!payload) {
      throw new Error('没有待完成的 Google 登录。')
    }

    try {
      const encryptionKey = await deriveEncryptionKey(passphrase, payload.keySalt)
      await ensureRemoteSyncKey(payload.token, encryptionKey)
      const { userEmail } = await persistAuthenticatedSession(payload, encryptionKey)

      set({
        isAuthenticated: true,
        userId: payload.userId,
        userEmail,
        token: payload.token,
        encryptionKey,
        pendingGoogleAuth: null,
        syncStatus: 'idle',
        syncAllStatus: 'idle',
        syncCurrentStatus: 'idle',
      })

      await get().syncToCloud()
    } catch (err) {
      console.error('Failed to finish Google login:', err)
      throw err
    }
  },

  clearPendingGoogleAuth: () => {
    set({ pendingGoogleAuth: null })
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
      selectedNote: null,
      activeEditorNoteId: null,
      activeEditorFlush: null,
      isAuthenticated: false,
      userId: null,
      userEmail: null,
      token: null,
      encryptionKey: null,
      pendingGoogleAuth: null,
      syncStatus: 'idle',
      syncAllStatus: 'idle',
      syncCurrentStatus: 'idle',
    })
    await get().loadNotes()
  },

  pullFromCloud: async () => {
    const { token, encryptionKey, userId } = get()
    if (!token || !encryptionKey) {
      await clearAuthForReauth(userId)
      set({
        notes: [],
        selectedNoteId: null,
        selectedNote: null,
        activeEditorNoteId: null,
        activeEditorFlush: null,
        isAuthenticated: false,
        userId: null,
        userEmail: null,
        token: null,
        encryptionKey: null,
        pendingGoogleAuth: null,
        syncStatus: 'reauth-required',
        syncAllStatus: 'idle',
        syncCurrentStatus: 'idle',
      })
      throw new Error('请重新登录以恢复同步')
    }

    try {
      console.log('⬇️ Pulling notes from cloud...')
      
      // 获取云端所有笔记
      const response = await fetchCloudNotesResponse(token)

      if (response.status === 401 || response.status === 403) {
        await clearAuthForReauth(userId)
        set({
          notes: [],
          selectedNoteId: null,
          selectedNote: null,
          activeEditorNoteId: null,
          activeEditorFlush: null,
          isAuthenticated: false,
          userId: null,
          userEmail: null,
          token: null,
          encryptionKey: null,
          pendingGoogleAuth: null,
          syncStatus: 'reauth-required',
          syncAllStatus: 'idle',
          syncCurrentStatus: 'idle',
        })
        throw new Error('当前登录态属于其他后端环境，请重新登录。')
      }

      const payload = await readJson<ApiResponse<CloudNoteListResponse>>(response)
      const cloudNotes = unwrapApiResponse(payload)?.items ?? null

      if (!response.ok || !Array.isArray(cloudNotes)) {
        throw new Error(getErrorMessage(payload, 'Failed to fetch cloud notes'))
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

  syncNoteToCloud: async (noteId) => {
    const { token, encryptionKey, userId } = get()
    if (!token || !encryptionKey) {
      await clearAuthForReauth(userId)
      set({
        notes: [],
        selectedNoteId: null,
        selectedNote: null,
        activeEditorNoteId: null,
        activeEditorFlush: null,
        isAuthenticated: false,
        userId: null,
        userEmail: null,
        token: null,
        encryptionKey: null,
        pendingGoogleAuth: null,
        syncStatus: 'reauth-required',
        syncAllStatus: 'idle',
        syncCurrentStatus: 'idle',
      })
      return
    }

    if (get().activeEditorNoteId === noteId) {
      await get().flushActiveEditor()
    }

    const note = get().selectedNote?.id === noteId
      ? get().selectedNote
      : await window.api.getNote(noteId)
    if (!note) {
      return
    }

    if (!note.is_dirty) {
      set({ syncCurrentStatus: note.sync_version > 0 ? 'success' : 'idle' })
      return
    }

    set({ syncCurrentStatus: 'syncing' })

    try {
      const pushResult = await pushNoteToCloud(note, token, encryptionKey)

      if (pushResult.status === 'conflict') {
        if (!pushResult.note) {
          set({ syncCurrentStatus: 'error' })
          return
        }

        const resolution = await resolveSyncConflict(note, pushResult.note, token, encryptionKey)
        set({ syncCurrentStatus: resolution === 'failed' ? 'error' : 'success' })
      } else if (pushResult.status === 'error') {
        set({ syncCurrentStatus: 'error' })
      } else {
        await window.api.markNoteSynced(note.id, pushResult.note.syncVersion)
        set({ syncCurrentStatus: 'success' })
      }

      await get().loadNotes()
    } catch (err) {
      console.error(`❌ Sync current note failed (${noteId}):`, err)
      set({ syncCurrentStatus: 'error' })
    }
  },

  syncToCloud: async () => {
    const { token, encryptionKey, userId } = get()
    if (!token || !encryptionKey) {
      await clearAuthForReauth(userId)
      set({
        notes: [],
        selectedNoteId: null,
        selectedNote: null,
        activeEditorNoteId: null,
        activeEditorFlush: null,
        isAuthenticated: false,
        userId: null,
        userEmail: null,
        token: null,
        encryptionKey: null,
        pendingGoogleAuth: null,
        syncStatus: 'reauth-required',
        syncAllStatus: 'idle',
        syncCurrentStatus: 'idle',
      })
      return
    }

    await get().flushActiveEditor()

    set({ syncAllStatus: 'syncing' })
    
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
      set({ syncAllStatus: hasFailures ? 'error' : 'success' })
      console.log(`🎉 Sync completed: ${successCount} pushed, ${conflictCount} conflicts, ${errorCount} failed`)
      
      // 重新加载笔记列表
      await get().loadNotes()
    } catch (err) {
      console.error('❌ Sync failed:', err)
      set({ syncAllStatus: 'error' })
    }
  },
}))
