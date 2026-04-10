import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudSyncOutlined,
  DeleteOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Alert, Button, Input, Tag, Tooltip, Typography } from 'antd'
import { ConfigurableTiptapEditor } from '@chenglu1/xeditor-editor'
import '@chenglu1/xeditor-editor/styles.css'
import { useNoteStore, type Note } from '../../stores/noteStore'
import { apiUrl, getErrorMessage, readJson, resolveApiUrl } from '../../services/api'

interface UploadResponse {
  url: string
  message?: string | string[]
  error?: string
}

type SyncActionStatus = 'idle' | 'syncing' | 'success' | 'error'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NoteImageUploadHandler = (_file: File, ..._args: any[]) => Promise<string>

interface SelectedNoteEditorProps {
  note: Note
  isAuthenticated: boolean
  isReauthRequired: boolean
  syncCurrentStatus: SyncActionStatus
  onSyncCurrentNote: (noteId: string) => Promise<void>
  onUpdate: (id: string, data: { title?: string; content?: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onImageUpload: NoteImageUploadHandler
}

function SelectedNoteEditor({
  note,
  isAuthenticated,
  isReauthRequired,
  syncCurrentStatus,
  onSyncCurrentNote,
  onUpdate,
  onDelete,
  onImageUpload,
}: SelectedNoteEditorProps) {
  const registerActiveEditorFlush = useNoteStore((s) => s.registerActiveEditorFlush)
  const unregisterActiveEditorFlush = useNoteStore((s) => s.unregisterActiveEditorFlush)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content || '')
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestTitleRef = useRef(note.title)
  const latestContentRef = useRef(note.content || '')

  const clearPendingTimers = useCallback(() => {
    if (titleDebounceRef.current) {
      clearTimeout(titleDebounceRef.current)
      titleDebounceRef.current = null
    }

    if (contentDebounceRef.current) {
      clearTimeout(contentDebounceRef.current)
      contentDebounceRef.current = null
    }
  }, [])

  const flushPendingEdits = useCallback(async () => {
    const nextTitle = latestTitleRef.current
    const nextContent = latestContentRef.current
    const hasPendingChanges = Boolean(titleDebounceRef.current || contentDebounceRef.current)

    clearPendingTimers()

    if (!hasPendingChanges) {
      return
    }

    if (note.title === nextTitle && (note.content || '') === nextContent) {
      return
    }

    await onUpdate(note.id, {
      title: nextTitle,
      content: nextContent,
    })
  }, [clearPendingTimers, note.content, note.id, note.title, onUpdate])

  useEffect(() => {
    registerActiveEditorFlush(note.id, flushPendingEdits)

    return () => {
      unregisterActiveEditorFlush(note.id)
      void flushPendingEdits()
    }
  }, [flushPendingEdits, note.id, registerActiveEditorFlush, unregisterActiveEditorFlush])

  useEffect(() => {
    if (titleDebounceRef.current || contentDebounceRef.current) {
      return
    }

    const nextTitle = note.title
    const nextContent = note.content || ''
    if (nextTitle === latestTitleRef.current && nextContent === latestContentRef.current) {
      return
    }

    latestTitleRef.current = nextTitle
    latestContentRef.current = nextContent
    setTitle(nextTitle)
    setContent(nextContent)
  }, [note.content, note.title])

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (newContent === latestContentRef.current) {
        return
      }

      setContent(newContent)
      latestContentRef.current = newContent

      if (contentDebounceRef.current) {
        clearTimeout(contentDebounceRef.current)
      }

      contentDebounceRef.current = setTimeout(() => {
        void onUpdate(note.id, { content: newContent })
        contentDebounceRef.current = null
      }, 500)
    },
    [note.id, onUpdate],
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value
      if (newTitle === latestTitleRef.current) {
        return
      }

      setTitle(newTitle)
      latestTitleRef.current = newTitle

      if (titleDebounceRef.current) {
        clearTimeout(titleDebounceRef.current)
      }

      titleDebounceRef.current = setTimeout(() => {
        void onUpdate(note.id, { title: newTitle })
        titleDebounceRef.current = null
      }, 500)
    },
    [note.id, onUpdate],
  )

  const handleDelete = useCallback(async () => {
    if (!confirm('确定要删除这篇笔记吗？')) {
      return
    }

    clearPendingTimers()
    await onDelete(note.id)
  }, [clearPendingTimers, note.id, onDelete])

  const handleSync = useCallback(async () => {
    await onSyncCurrentNote(note.id)
  }, [note.id, onSyncCurrentNote])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
      }
    },
    [],
  )

  const syncTagColor = note.is_dirty ? 'warning' : isAuthenticated ? 'success' : 'default'
  const syncTagLabel = note.is_dirty ? '未同步' : isAuthenticated ? '已同步' : '本地草稿'
  const syncStateLabel =
    syncCurrentStatus === 'syncing'
      ? '同步中'
      : syncCurrentStatus === 'error'
        ? '同步失败'
        : syncCurrentStatus === 'success' && isAuthenticated
          ? '已同步到云端'
          : null
  const updatedAtLabel = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(note.updated_at))
  const metaLine = updatedAtLabel ? `最近编辑 ${updatedAtLabel}` : '新建文档'

  return (
    <div className="editor-body">
      <div className="editor-content-wrap">
        <div className="editor-header editor-header--simple">
          <div className="editor-header-main app-region-drag">
            <Input
              bordered={false}
              className="editor-title-input app-region-no-drag"
              placeholder="无标题"
              value={title}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
            />

            <div className="editor-meta-line app-region-no-drag">
              <Tag color={syncTagColor} className="editor-sync-tag">{syncTagLabel}</Tag>
              <Typography.Text className="editor-meta-text">{metaLine}</Typography.Text>
              {syncStateLabel ? (
                <Typography.Text className="editor-meta-text">{syncStateLabel}</Typography.Text>
              ) : null}
            </div>
          </div>

          <div className="editor-actions editor-actions--simple app-region-no-drag">
            {isAuthenticated ? (
              <Tooltip title="只同步当前这篇笔记">
                <Button
                  icon={syncCurrentStatus === 'syncing' ? <SyncOutlined spin /> : <CloudSyncOutlined />}
                  loading={syncCurrentStatus === 'syncing'}
                  onClick={() => void handleSync()}
                >
                  同步当前
                </Button>
              </Tooltip>
            ) : null}

            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => void handleDelete()}>
              删除
            </Button>
          </div>
        </div>

        {isReauthRequired ? (
          <Alert
            showIcon
            type="warning"
            className="editor-alert"
            message="当前登录态缺少加密密钥，请重新登录后再继续云同步。"
          />
        ) : null}

        <div className="editor-surface editor-surface--simple">
          <ConfigurableTiptapEditor
            key={note.id}
            value={content}
            valueType="markdown"
            placeholder="开始写点什么..."
            onUpdate={(event) => {
              if (event.valueType === 'markdown' && event.source === 'user') {
                handleContentChange(event.value as string)
              }
            }}
            showToolbar={true}
            uploadHandler={onImageUpload}
            maxFileSize={5 * 1024 * 1024}
            minHeight="560px"
            compact={true}
          />
        </div>
      </div>
    </div>
  )
}

export function EditorPane() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const notes = useNoteStore((s) => s.notes)
  const createNote = useNoteStore((s) => s.createNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const syncStatus = useNoteStore((s) => s.syncStatus)
  const syncCurrentStatus = useNoteStore((s) => s.syncCurrentStatus)
  const syncNoteToCloud = useNoteStore((s) => s.syncNoteToCloud)

  const selectedNote = notes.find((n) => n.id === selectedNoteId)

  const handleCreateFromEmpty = useCallback(async () => {
    await createNote()
  }, [createNote])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleImageUpload = useCallback(async (_file: File, ..._args: any[]): Promise<string> => {
    const formData = new FormData()
    formData.append('file', _file)

    const response = await fetch(apiUrl('/upload/image'), {
      method: 'POST',
      body: formData,
    })

    const payload = await readJson<UploadResponse>(response)
    if (!response.ok || !payload?.url) {
      throw new Error(getErrorMessage(payload, '图片上传失败'))
    }

    return resolveApiUrl(payload.url)
  }, []) as NoteImageUploadHandler

  if (!selectedNote) {
    return (
      <section className="editor-panel">
        <div className="editor-body editor-body--empty editor-body--notion-empty">
          <div className="empty-stage empty-stage--minimal">
            <Typography.Title level={2} className="empty-stage__title">
              开始记录
            </Typography.Title>
            <Typography.Paragraph className="empty-stage__description">
              新建一篇笔记，像使用文档工具一样开始写作。
            </Typography.Paragraph>

            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => void handleCreateFromEmpty()}
            >
              新建笔记
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="editor-panel">
      <SelectedNoteEditor
        key={selectedNote.id}
        note={selectedNote}
        isAuthenticated={isAuthenticated}
        isReauthRequired={syncStatus === 'reauth-required'}
        syncCurrentStatus={syncCurrentStatus}
        onSyncCurrentNote={syncNoteToCloud}
        onUpdate={updateNote}
        onDelete={deleteNote}
        onImageUpload={handleImageUpload}
      />
    </section>
  )
}
