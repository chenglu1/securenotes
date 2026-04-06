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
import { useNoteStore } from '../../stores/noteStore'
import { apiUrl, getErrorMessage, readJson, resolveApiUrl } from '../../services/api'

interface UploadResponse {
  url: string
  message?: string | string[]
  error?: string
}

export function EditorPane() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const notes = useNoteStore((s) => s.notes)
  const createNote = useNoteStore((s) => s.createNote)
  const selectNote = useNoteStore((s) => s.selectNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const syncStatus = useNoteStore((s) => s.syncStatus)
  const syncToCloud = useNoteStore((s) => s.syncToCloud)

  const selectedNote = notes.find((n) => n.id === selectedNoteId)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeNoteIdRef = useRef<string | null>(null)
  const latestTitleRef = useRef('')
  const latestContentRef = useRef('')

  const hasNoteChanged = useCallback(
    (noteId: string, nextTitle: string, nextContent: string) => {
      const note = notes.find((item) => item.id === noteId)
      if (!note) {
        return true
      }

      return note.title !== nextTitle || (note.content || '') !== nextContent
    },
    [notes],
  )

  const flushPendingEdits = useCallback(
    (noteId = activeNoteIdRef.current) => {
      if (!noteId) {
        return
      }

      const hasPendingChanges = Boolean(titleDebounceRef.current || contentDebounceRef.current)
      if (!hasPendingChanges) {
        return
      }

      if (titleDebounceRef.current) {
        clearTimeout(titleDebounceRef.current)
        titleDebounceRef.current = undefined
      }

      if (contentDebounceRef.current) {
        clearTimeout(contentDebounceRef.current)
        contentDebounceRef.current = undefined
      }

      if (!hasNoteChanged(noteId, latestTitleRef.current, latestContentRef.current)) {
        return
      }

      void updateNote(noteId, {
        title: latestTitleRef.current,
        content: latestContentRef.current,
      })
    },
    [hasNoteChanged, updateNote]
  )

  const handleCreateFromEmpty = useCallback(async () => {
    const note = await createNote()
    if (note) {
      selectNote(note.id)
    }
  }, [createNote, selectNote])

  useEffect(() => {
    const previousNoteId = activeNoteIdRef.current
    if (previousNoteId && previousNoteId !== selectedNoteId) {
      flushPendingEdits(previousNoteId)
    }

    if (!selectedNote) {
      activeNoteIdRef.current = null
      latestTitleRef.current = ''
      latestContentRef.current = ''
      setTitle('')
      setContent('')
      return
    }

    activeNoteIdRef.current = selectedNote.id
    latestTitleRef.current = selectedNote.title
    latestContentRef.current = selectedNote.content || ''
    setTitle(selectedNote.title)
    setContent(selectedNote.content || '')
  }, [selectedNoteId, selectedNote, flushPendingEdits])

  useEffect(() => {
    return () => {
      flushPendingEdits()
    }
  }, [flushPendingEdits])

  const handleContentChange = useCallback(
    (newContent: string) => {
      if (newContent === latestContentRef.current) return

      setContent(newContent)
      latestContentRef.current = newContent
      if (!selectedNoteId) return

      if (contentDebounceRef.current) clearTimeout(contentDebounceRef.current)
      contentDebounceRef.current = setTimeout(() => {
        void updateNote(selectedNoteId, { content: newContent })
        contentDebounceRef.current = undefined
      }, 500)
    },
    [selectedNoteId, updateNote]
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value
      if (newTitle === latestTitleRef.current) return

      setTitle(newTitle)
      latestTitleRef.current = newTitle
      if (!selectedNoteId) return

      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
      titleDebounceRef.current = setTimeout(() => {
        void updateNote(selectedNoteId, { title: newTitle })
        titleDebounceRef.current = undefined
      }, 500)
    },
    [selectedNoteId, updateNote]
  )

  const handleDelete = useCallback(async () => {
    if (!selectedNoteId) return
    if (confirm('确定要删除这篇笔记吗？')) {
      await deleteNote(selectedNoteId)
    }
  }, [selectedNoteId, deleteNote])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
      }
    },
    []
  )

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
  }, []) as any

  const syncTagColor = selectedNote?.is_dirty ? 'warning' : isAuthenticated ? 'success' : 'default'
  const syncTagLabel = selectedNote?.is_dirty ? '未同步' : isAuthenticated ? '已同步' : '本地草稿'
  const syncStateLabel =
    syncStatus === 'syncing'
      ? '同步中'
      : syncStatus === 'error'
        ? '同步失败'
        : syncStatus === 'success' && isAuthenticated
          ? '已同步到云端'
          : null
  const updatedAtLabel = selectedNote
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(selectedNote.updated_at))
    : ''
  const metaLine = updatedAtLabel ? `最近编辑 ${updatedAtLabel}` : '新建文档'

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
                <Tooltip title="把本地改动同步到云端">
                  <Button
                    icon={syncStatus === 'syncing' ? <SyncOutlined spin /> : <CloudSyncOutlined />}
                    loading={syncStatus === 'syncing'}
                    onClick={() => void syncToCloud()}
                  >
                    同步
                  </Button>
                </Tooltip>
              ) : null}

              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => void handleDelete()}>
                删除
              </Button>
            </div>
          </div>

          {syncStatus === 'reauth-required' ? (
            <Alert
              showIcon
              type="warning"
              className="editor-alert"
              message="当前登录态缺少加密密钥，请重新登录后再继续云同步。"
            />
          ) : null}

          <div className="editor-surface editor-surface--simple">
            <ConfigurableTiptapEditor
              key={selectedNote.id}
              value={content}
              valueType="markdown"
              placeholder="开始写点什么..."
              onUpdate={(event) => {
                if (event.valueType === 'markdown' && event.source === 'user') {
                  handleContentChange(event.value as string)
                }
              }}
              showToolbar={true}
              uploadHandler={handleImageUpload}
              maxFileSize={5 * 1024 * 1024}
              minHeight="560px"
              compact={true}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
