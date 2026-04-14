import {
  CloudSyncOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  GithubOutlined,
  LoginOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UserOutlined,
  NotificationOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Empty, Input, Popconfirm, Popover, Typography } from 'antd'
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { useNoteStore } from '../../stores/noteStore'

interface SidebarProps {
  onShowAuth: () => void
  onRequestClose?: () => void
  onShowNewsDigest?: () => void
  onShowNewsSettings?: () => void
  onRunNewsDigest?: () => void
  onShowGithubTrending?: () => void
  isNewsRunning?: boolean
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return '刚刚修改'
  if (mins < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getWorkspaceName(userEmail: string | null, userId: string | null) {
  if (userEmail) {
    const localName = userEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim()
    return `${localName || '我的'}工作空间`
  }

  return userId ? '已连接工作空间' : '本地工作空间'
}

function getAvatarText(userEmail: string | null, userId: string | null) {
  const seed = (userEmail?.split('@')[0] ?? userId ?? '').trim()
  const readableChar = Array.from(seed).find((char) => /[A-Za-z\u4e00-\u9fa5]/.test(char))
  return readableChar ? readableChar.toUpperCase() : null
}

function getNoteStatusLabel(note: { is_dirty: number; sync_version: number }, isAuthenticated: boolean) {
  if (note.is_dirty) {
    return '未同步'
  }

  if (!isAuthenticated || note.sync_version === 0) {
    return '本地草稿'
  }

  return '已同步'
}

function shouldShowNoteStatus(note: { is_dirty: number; sync_version: number }, isAuthenticated: boolean) {
  return note.is_dirty || !isAuthenticated || note.sync_version === 0
}

export function Sidebar({
  onShowAuth,
  onRequestClose,
  onShowNewsDigest,
  onShowNewsSettings,
  onRunNewsDigest,
  onShowGithubTrending,
  isNewsRunning = false,
}: SidebarProps) {
  const notes = useNoteStore((s) => s.notes)
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const searchQuery = useNoteStore((s) => s.searchQuery)
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery)
  const selectNote = useNoteStore((s) => s.selectNote)
  const createNote = useNoteStore((s) => s.createNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)
  const isLoading = useNoteStore((s) => s.isLoading)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const userId = useNoteStore((s) => s.userId)
  const userEmail = useNoteStore((s) => s.userEmail)
  const syncStatus = useNoteStore((s) => s.syncStatus)
  const syncAllStatus = useNoteStore((s) => s.syncAllStatus)
  const syncToCloud = useNoteStore((s) => s.syncToCloud)
  const logout = useNoteStore((s) => s.logout)
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase())
  const hasHydratedSearch = useRef(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [openMenuNoteId, setOpenMenuNoteId] = useState<string | null>(null)

  const handleCreateNote = useCallback(async () => {
    await createNote()
    onRequestClose?.()
  }, [createNote, onRequestClose])

  const handleSelectNote = useCallback(async (noteId: string) => {
    setOpenMenuNoteId(null)
    await selectNote(noteId)
    onRequestClose?.()
  }, [onRequestClose, selectNote])

  const handleOpenAuth = useCallback(() => {
    onShowAuth()
    onRequestClose?.()
  }, [onRequestClose, onShowAuth])

  const handleShowNewsDigest = useCallback(() => {
    onShowNewsDigest?.()
    onRequestClose?.()
  }, [onRequestClose, onShowNewsDigest])

  const handleShowNewsSettings = useCallback(() => {
    onShowNewsSettings?.()
    onRequestClose?.()
  }, [onRequestClose, onShowNewsSettings])

  const handleRunNewsDigest = useCallback(() => {
    onRunNewsDigest?.()
    onRequestClose?.()
  }, [onRequestClose, onRunNewsDigest])

  const handleShowGithubTrending = useCallback(() => {
    onShowGithubTrending?.()
    onRequestClose?.()
  }, [onRequestClose, onShowGithubTrending])

  const startTitleEdit = useCallback((noteId: string, title: string) => {
    setOpenMenuNoteId(null)
    setEditingNoteId(noteId)
    setEditingTitle(title)
  }, [])

  const cancelTitleEdit = useCallback(() => {
    setEditingNoteId(null)
    setEditingTitle('')
  }, [])

  const submitTitleEdit = useCallback(async (noteId: string) => {
    const nextTitle = editingTitle.trim().length === 0 ? '' : editingTitle
    setEditingNoteId(null)
    setEditingTitle('')
    await updateNote(noteId, { title: nextTitle })
  }, [editingTitle, updateNote])

  const handleDeleteNote = useCallback(async (noteId: string) => {
    setOpenMenuNoteId(null)
    if (!confirm('确定要删除这篇笔记吗？')) {
      return
    }

    await deleteNote(noteId)
  }, [deleteNote])

  const handleNoteCardKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, noteId: string) => {
    if (editingNoteId === noteId) {
      return
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    void handleSelectNote(noteId)
  }, [editingNoteId, handleSelectNote])

  useEffect(() => {
    if (!hasHydratedSearch.current) {
      hasHydratedSearch.current = true
      return
    }

    void loadNotes()
  }, [deferredSearchQuery, loadNotes])

  useEffect(() => {
    if (editingNoteId && !notes.some((note) => note.id === editingNoteId)) {
      cancelTitleEdit()
    }
  }, [cancelTitleEdit, editingNoteId, notes])

  const visibleNotes = notes

  const dirtyCount = notes.filter((note) => note.is_dirty).length
  const isReauthRequired = syncStatus === 'reauth-required'
  const syncTone = isAuthenticated
    ? syncAllStatus === 'error'
      ? 'error'
      : syncAllStatus === 'syncing'
        ? 'syncing'
        : dirtyCount > 0
          ? 'pending'
          : 'success'
    : isReauthRequired
      ? 'warning'
      : 'local'
  const syncLabel = isAuthenticated
    ? syncAllStatus === 'syncing'
      ? '同步中'
      : dirtyCount > 0
        ? '未同步'
      : syncAllStatus === 'success'
        ? '已同步'
        : syncAllStatus === 'error'
          ? '同步失败'
          : '已连接'
    : isReauthRequired
      ? '需重新登录'
      : '本地模式'
  const footerText = isAuthenticated
    ? syncAllStatus === 'syncing'
      ? '正在同步更改'
      : dirtyCount > 0
        ? `${dirtyCount} 条待同步`
        : '全部已同步'
    : isReauthRequired
      ? '需要重新登录'
      : '仅本地保存'
  const metaText = deferredSearchQuery
    ? `${visibleNotes.length} 条结果`
    : dirtyCount > 0
      ? `${dirtyCount} 未同步`
      : `${notes.length} 篇笔记`
  const workspaceName = getWorkspaceName(userEmail, userId)
  const avatarText = getAvatarText(userEmail, userId)
  const accountHint = isAuthenticated
    ? userEmail ?? `账户 ${userId?.slice(0, 8)}...`
    : '当前为本地访客空间'

  return (
    <aside className="sidebar-panel">
      <div className="sidebar-identity-card">
        <div className="sidebar-identity-card__body">
          <Avatar
            size={42}
            icon={avatarText ? undefined : <UserOutlined />}
            className={`workspace-avatar ${isAuthenticated ? 'is-live' : 'is-local'}`}
          >
            {avatarText}
          </Avatar>

          <div className="sidebar-identity-card__copy">
            <div className="sidebar-identity-card__title-row">
              <Typography.Title level={5} className="workspace-switcher__title">
                {workspaceName}
              </Typography.Title>

              {isAuthenticated ? (
                <Popconfirm
                  placement="bottomRight"
                  title="确认退出当前账号？"
                  description="本地笔记会保留，云同步将暂停。"
                  okText="退出"
                  cancelText="取消"
                  onConfirm={() => logout()}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<LogoutOutlined />}
                    className="sidebar-identity-card__action"
                  >
                    退出
                  </Button>
                </Popconfirm>
              ) : null}
            </div>

            <div className="sidebar-identity-card__meta-row">
              <Typography.Text className="workspace-switcher__meta" ellipsis>
                {accountHint}
              </Typography.Text>

              <span className={`sidebar-sync-badge sidebar-sync-badge--${syncTone}`}>
                {syncLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Input
        size="large"
        value={searchQuery}
        prefix={<SearchOutlined />}
        placeholder="搜索标题..."
        className="sidebar-search"
        allowClear
        onChange={(event) => setSearchQuery(event.target.value)}
      />

      <div className="sidebar-primary-actions">
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => void handleCreateNote()}
        >
          新建笔记
        </Button>

        {isAuthenticated ? (
          <Button
            size="large"
            icon={syncAllStatus === 'syncing' ? <SyncOutlined spin /> : <CloudSyncOutlined />}
            className="secondary-action"
            loading={syncAllStatus === 'syncing'}
            onClick={() => void syncToCloud()}
          >
            同步全部
          </Button>
        ) : (
          <Button
            size="large"
            icon={<LoginOutlined />}
            className="secondary-action"
            onClick={handleOpenAuth}
          >
            {isReauthRequired ? '重新登录' : '登录'}
          </Button>
        )}
      </div>

      <div className="sidebar-quick-actions">
        <Button className="sidebar-quick-action sidebar-quick-action--digest" onClick={handleShowNewsDigest}>
          <span className="sidebar-quick-action__icon">
            <NotificationOutlined />
          </span>
          <span className="sidebar-quick-action__copy">
            <span className="sidebar-quick-action__title">今日热点</span>
            <span className="sidebar-quick-action__desc">查看摘要</span>
          </span>
        </Button>

        <Button className="sidebar-quick-action sidebar-quick-action--run" onClick={handleRunNewsDigest}>
          <span className="sidebar-quick-action__icon">
            {isNewsRunning ? <SyncOutlined spin /> : <ThunderboltOutlined />}
          </span>
          <span className="sidebar-quick-action__copy">
            <span className="sidebar-quick-action__title">立即抓取</span>
            <span className="sidebar-quick-action__desc">刷新热点</span>
          </span>
        </Button>

        <Button className="sidebar-quick-action sidebar-quick-action--settings" onClick={handleShowNewsSettings}>
          <span className="sidebar-quick-action__icon">
            <SettingOutlined />
          </span>
          <span className="sidebar-quick-action__copy">
            <span className="sidebar-quick-action__title">提醒设置</span>
            <span className="sidebar-quick-action__desc">定时配置</span>
          </span>
        </Button>

        <Button className="sidebar-quick-action sidebar-quick-action--github" onClick={handleShowGithubTrending}>
          <span className="sidebar-quick-action__icon">
            <GithubOutlined />
          </span>
          <span className="sidebar-quick-action__copy">
            <span className="sidebar-quick-action__title">GitHub 热门</span>
            <span className="sidebar-quick-action__desc">开源榜单</span>
          </span>
        </Button>
      </div>

      <div className="list-heading list-heading--simple">
        <Typography.Text className="list-heading__title">最近笔记</Typography.Text>
        <Typography.Text className="list-heading__meta">{notes.length > 0 ? metaText : ''}</Typography.Text>
      </div>

      <div className="notes-scroll">
        {visibleNotes.length === 0 ? (
          <div className="notes-empty-state notes-empty-state--minimal">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={deferredSearchQuery ? '没有找到匹配标题。' : '还没有笔记。'}
            />
          </div>
        ) : (
          visibleNotes.map((note) => (
            <div
              key={note.id}
              role="button"
              tabIndex={editingNoteId === note.id ? -1 : 0}
              className={`note-list-item ${selectedNoteId === note.id ? 'is-active' : ''} ${openMenuNoteId === note.id ? 'is-menu-open' : ''} ${editingNoteId === note.id ? 'is-editing' : ''}`}
              onClick={() => {
                if (editingNoteId === note.id) {
                  return
                }

                void handleSelectNote(note.id)
              }}
              onKeyDown={(event) => handleNoteCardKeyDown(event, note.id)}
            >
              <div className="note-list-item__head">
                <div className="note-list-item__main">
                  {editingNoteId === note.id ? (
                    <Input
                      size="small"
                      autoFocus
                      value={editingTitle}
                      placeholder="无标题"
                      className="note-title-input"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onPressEnter={() => void submitTitleEdit(note.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          cancelTitleEdit()
                        }
                      }}
                    />
                  ) : (
                    <Typography.Text className="note-title" strong ellipsis>
                      {note.title || '无标题'}
                    </Typography.Text>
                  )}
                </div>
              </div>

              <div className="note-list-item__foot">
                <span>{formatRelativeTime(note.updated_at)}</span>
                {shouldShowNoteStatus(note, isAuthenticated) ? (
                  <span className={`note-status note-status--inline ${note.is_dirty ? 'note-status--dirty' : ''}`}>
                    {getNoteStatusLabel(note, isAuthenticated)}
                  </span>
                ) : null}
                {note.deleted_at ? <span>已删除</span> : null}
              </div>

              {editingNoteId === note.id ? (
                <div className="note-list-item__edit-actions" onClick={(event) => event.stopPropagation()}>
                  <Button
                    type="primary"
                    size="small"
                    className="note-list-item__edit-button"
                    onClick={() => void submitTitleEdit(note.id)}
                  >
                    保存
                  </Button>
                  <Button
                    size="small"
                    className="note-list-item__edit-button"
                    onClick={cancelTitleEdit}
                  >
                    取消
                  </Button>
                </div>
              ) : null}

              <Popover
                trigger="click"
                placement="bottomRight"
                overlayClassName="note-actions-popover"
                open={openMenuNoteId === note.id}
                onOpenChange={(open) => setOpenMenuNoteId(open ? note.id : null)}
                content={
                  <div className="note-list-item__menu">
                    <button
                      type="button"
                      className="note-list-item__menu-button"
                      onClick={() => startTitleEdit(note.id, note.title)}
                    >
                      <EditOutlined />
                      <span>修改标题</span>
                    </button>

                    <button
                      type="button"
                      className="note-list-item__menu-button note-list-item__menu-button--danger"
                      onClick={() => void handleDeleteNote(note.id)}
                    >
                      <DeleteOutlined />
                      <span>删除笔记</span>
                    </button>
                  </div>
                }
              >
                <div className="note-list-item__actions" onClick={(event) => event.stopPropagation()}>
                  <Button
                    type="text"
                    size="small"
                    className="note-list-item__more"
                    icon={<EllipsisOutlined />}
                    aria-label="更多操作"
                    aria-expanded={openMenuNoteId === note.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenMenuNoteId((current) => current === note.id ? null : note.id)
                    }}
                  />
                </div>
              </Popover>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer sidebar-footer--simple">
        <div className="sidebar-footer__meta">
          <Typography.Text className="sidebar-footer__status">{footerText}</Typography.Text>
        </div>
      </div>

      {isLoading ? <div className="sidebar-loading-indicator">正在读取本地笔记…</div> : null}
    </aside>
  )
}
