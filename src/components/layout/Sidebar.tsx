import {
  CloudSyncOutlined,
  LoginOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
  SyncOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Empty, Input, Typography } from 'antd'
import { useCallback, useDeferredValue, useEffect } from 'react'
import { useNoteStore } from '../../stores/noteStore'

interface SidebarProps {
  onShowAuth: () => void
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

function getPreview(content: string) {
  if (!content) return '空白页，适合开始新的想法。'

  const text = content.replace(/<[^>]*>/g, '').replace(/[{}[\]"]/g, '').trim()
  return text.substring(0, 96) || '空白页，适合开始新的想法。'
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

export function Sidebar({ onShowAuth }: SidebarProps) {
  const notes = useNoteStore((s) => s.notes)
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const searchQuery = useNoteStore((s) => s.searchQuery)
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery)
  const selectNote = useNoteStore((s) => s.selectNote)
  const createNote = useNoteStore((s) => s.createNote)
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

  const handleCreateNote = useCallback(async () => {
    await createNote()
  }, [createNote])

  useEffect(() => {
    void loadNotes()
  }, [deferredSearchQuery, loadNotes])

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
    ? dirtyCount > 0
      ? `${dirtyCount} 条改动待同步`
      : '云端与本地已同步'
    : isReauthRequired
      ? '请重新登录恢复同步'
      : '当前仅本地保存'
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
  const workspaceMeta = isAuthenticated
    ? '仅当前账号可见，本地优先并自动同步。'
    : '本地优先，登录后再同步到你的云端空间。'
  const footerHint = isAuthenticated
    ? '当前列表只显示这个账号下的笔记'
    : isReauthRequired
      ? '重新登录后恢复加密同步'
      : '登录后可在多端访问同一账号内容'

  return (
    <aside className="sidebar-panel">
      <div className="sidebar-identity-card">
        <div className="sidebar-identity-card__head">
          <Typography.Text className="workspace-switcher__eyebrow">Secure Workspace</Typography.Text>
          <span className={`sidebar-sync-badge sidebar-sync-badge--${syncTone}`}>
            {syncLabel}
          </span>
        </div>

        <div className="sidebar-identity-card__body">
          <Avatar
            size={46}
            icon={avatarText ? undefined : <UserOutlined />}
            className={`workspace-avatar ${isAuthenticated ? 'is-live' : 'is-local'}`}
          >
            {avatarText}
          </Avatar>

          <div className="sidebar-identity-card__copy">
            <Typography.Title level={5} className="workspace-switcher__title">
              {workspaceName}
            </Typography.Title>
            <Typography.Text className="workspace-switcher__meta">{accountHint}</Typography.Text>
          </div>
        </div>

        <div className="sidebar-identity-card__foot">
          <Typography.Paragraph className="sidebar-identity-card__description">
            {workspaceMeta}
          </Typography.Paragraph>

          {isAuthenticated ? (
            <Button
              type="text"
              size="small"
              icon={<LogoutOutlined />}
              className="sidebar-identity-card__action"
              onClick={() => void logout()}
            >
              退出
            </Button>
          ) : null}
        </div>
      </div>

      <Input
        size="large"
        value={searchQuery}
        prefix={<SearchOutlined />}
        placeholder="搜索标题或内容..."
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
            onClick={onShowAuth}
          >
            {isReauthRequired ? '重新登录' : '登录'}
          </Button>
        )}
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
              description={deferredSearchQuery ? '没有找到匹配内容。' : '还没有笔记。'}
            />
          </div>
        ) : (
          visibleNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className={`note-list-item ${selectedNoteId === note.id ? 'is-active' : ''}`}
              onClick={() => void selectNote(note.id)}
            >
              <div className="note-list-item__head">
                <Typography.Text className="note-title" strong ellipsis>
                  {note.title || '无标题'}
                </Typography.Text>
                <span className={`note-status ${note.is_dirty ? 'note-status--dirty' : ''}`}>
                  {getNoteStatusLabel(note, isAuthenticated)}
                </span>
              </div>

              <Typography.Paragraph className="note-preview" ellipsis={{ rows: 2 }}>
                {getPreview(note.preview)}
              </Typography.Paragraph>

              <div className="note-list-item__foot">
                <span>{formatRelativeTime(note.updated_at)}</span>
                {note.deleted_at ? <span>已删除</span> : null}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="sidebar-footer sidebar-footer--simple">
        <div className="sidebar-footer__meta">
          <Typography.Text className="sidebar-footer__status">{footerText}</Typography.Text>
          <Typography.Text className="sidebar-footer__hint">{footerHint}</Typography.Text>
        </div>
      </div>

      {isLoading ? <div className="sidebar-loading-indicator">正在读取本地笔记…</div> : null}
    </aside>
  )
}
