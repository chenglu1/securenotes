import { App as AntdApp, Alert, AutoComplete, Button, Empty, Input, Modal, Skeleton, Typography } from 'antd'
import { DeleteOutlined, MailOutlined, TeamOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type ApiResponse, apiUrl, getErrorMessage, readJson, unwrapApiResponse } from '../../services/api'
import { useNoteStore, type Note } from '../../stores/noteStore'

interface ShareNoteModalProps {
  open: boolean
  note: Note
  syncCurrentStatus: 'idle' | 'syncing' | 'success' | 'error'
  onClose: () => void
}

interface NoteShareMember {
  id: string
  email: string
  role: 'viewer'
  createdAt: string
}

interface NoteShareStateResponse {
  canInvite: boolean
  reason: string | null
  items: NoteShareMember[]
}

interface NoteShareCandidate {
  id: string
  email: string
}

interface NoteShareCandidateListResponse {
  items: NoteShareCandidate[]
  total: number
}

interface ShareCandidateOption {
  value: string
  label: string
}

function normalizeShareErrorMessage(message: string, fallback: string) {
  const normalizedMessage = message.trim() || fallback

  if (/relation\s+"note_shares"\s+does not exist/i.test(normalizedMessage)) {
    return '分享服务尚未完成初始化，请先重新部署后端或执行数据库迁移。'
  }

  return normalizedMessage
}

function getShareErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback
  }

  return normalizeShareErrorMessage(error.message, fallback)
}

function formatInviteTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚共享'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function ShareNoteModal({ open, note, syncCurrentStatus, onClose }: ShareNoteModalProps) {
  const { message } = AntdApp.useApp()
  const token = useNoteStore((s) => s.token)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [removingShareId, setRemovingShareId] = useState<string | null>(null)
  const [shareState, setShareState] = useState<NoteShareStateResponse | null>(null)
  const [candidateOptions, setCandidateOptions] = useState<ShareCandidateOption[]>([])
  const [searchingCandidates, setSearchingCandidates] = useState(false)
  const [candidateSearchError, setCandidateSearchError] = useState('')
  const [error, setError] = useState('')

  const loadShareState = useCallback(async () => {
    if (!token) {
      setShareState(null)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(apiUrl(`/notes/${note.id}/shares`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = await readJson<ApiResponse<NoteShareStateResponse>>(response)
      const data = unwrapApiResponse(payload)
      if (!response.ok || !data) {
        throw new Error(getErrorMessage(payload, '读取分享状态失败'))
      }

      setShareState(data)
    } catch (nextError) {
      setError(getShareErrorMessage(nextError, '读取分享状态失败'))
      setShareState(null)
    } finally {
      setLoading(false)
    }
  }, [note.id, token])

  useEffect(() => {
    if (!open) {
      setEmail('')
      setError('')
      setCandidateOptions([])
      setCandidateSearchError('')
      setSearchingCandidates(false)
      return
    }

    void loadShareState()
  }, [loadShareState, open])

  const inviteBlockedReason = useMemo(() => {
    if (!isAuthenticated || !token) {
      return '登录后才能分享文档。'
    }

    if (note.sync_version <= 0) {
      return '请先将当前文档同步到云端。'
    }

    if (note.is_dirty || syncCurrentStatus === 'syncing') {
      return '当前文档还有未同步修改，请先同步当前文档后再分享。'
    }

    if (shareState && !shareState.canInvite) {
      return shareState.reason ?? '当前文档暂不支持分享。'
    }

    return null
  }, [isAuthenticated, note.is_dirty, note.sync_version, shareState, syncCurrentStatus, token])

  useEffect(() => {
    const query = email.trim().toLowerCase()

    if (!open || !token || inviteBlockedReason || query.length < 2) {
      setCandidateOptions([])
      setCandidateSearchError('')
      setSearchingCandidates(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setSearchingCandidates(true)
      setCandidateOptions([])
      setCandidateSearchError('')

      try {
        const response = await fetch(apiUrl(`/notes/${note.id}/shares/candidates?query=${encodeURIComponent(query)}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })
        const payload = await readJson<ApiResponse<NoteShareCandidateListResponse>>(response)
        const data = unwrapApiResponse(payload)
        if (!response.ok || !data) {
          throw new Error(getErrorMessage(payload, '搜索成员失败'))
        }

        if (cancelled) {
          return
        }

        setCandidateOptions(
          data.items.map((candidate) => ({
            value: candidate.email,
            label: candidate.email,
          })),
        )
      } catch (nextError) {
        if (cancelled || (nextError instanceof DOMException && nextError.name === 'AbortError')) {
          return
        }

        console.error('Failed to search share candidates:', nextError)
        setCandidateOptions([])
        setCandidateSearchError(getShareErrorMessage(nextError, '搜索成员失败'))
      } finally {
        if (!cancelled) {
          setSearchingCandidates(false)
        }
      }
    }, 240)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [email, inviteBlockedReason, note.id, open, token])

  const handleInvite = useCallback(async () => {
    if (!token) {
      return
    }

    const nextEmail = email.trim().toLowerCase()
    if (!nextEmail || inviteBlockedReason) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(apiUrl(`/notes/${note.id}/shares`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: nextEmail }),
      })
      const payload = await readJson<ApiResponse<NoteShareMember>>(response)
      if (!response.ok || !unwrapApiResponse(payload)) {
        throw new Error(getErrorMessage(payload, '分享文档失败'))
      }

      setEmail('')
      setCandidateOptions([])
      setCandidateSearchError('')
      message.success('文档已共享给该成员')
      await loadShareState()
    } catch (nextError) {
      setError(getShareErrorMessage(nextError, '分享文档失败'))
    } finally {
      setSubmitting(false)
    }
  }, [email, inviteBlockedReason, loadShareState, message, note.id, token])

  const handleRemoveShare = useCallback(async (shareId: string) => {
    if (!token) {
      return
    }

    setRemovingShareId(shareId)
    setError('')

    try {
      const response = await fetch(apiUrl(`/notes/${note.id}/shares/${shareId}`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = await readJson<ApiResponse<{ success: boolean }>>(response)
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, '取消分享失败'))
      }

      message.success('已取消该成员的访问权限')
      await loadShareState()
    } catch (nextError) {
      setError(getShareErrorMessage(nextError, '取消分享失败'))
    } finally {
      setRemovingShareId(null)
    }
  }, [loadShareState, message, note.id, token])

  const candidateNotFoundContent = useMemo(() => {
    if (candidateSearchError) {
      return candidateSearchError
    }

    if (searchingCandidates) {
      return '正在搜索成员...'
    }

    if (email.trim().length < 2) {
      return '至少输入 2 个字符开始搜索'
    }

    return '未找到匹配成员'
  }, [candidateSearchError, email, searchingCandidates])

  return (
    <Modal
      open={open}
      centered
      destroyOnClose
      footer={null}
      width={620}
      onCancel={onClose}
      className="share-modal"
    >
      <div className="share-modal__hero">
        <div>
          <Typography.Title level={3} className="share-modal__title">
            分享
          </Typography.Title>
          <Typography.Text className="share-modal__note-name" ellipsis>
            {note.title.trim() || '无标题'}
          </Typography.Text>
        </div>
      </div>

      {inviteBlockedReason ? (
        <Alert showIcon type="warning" className="share-modal__alert" message={inviteBlockedReason} />
      ) : null}

      {error ? (
        <Alert showIcon type="error" className="share-modal__alert" message={error} />
      ) : null}

      <div className="share-modal__invite-row">
        <AutoComplete
          className="share-modal__email-search"
          value={email}
          options={candidateOptions}
          filterOption={false}
          notFoundContent={candidateNotFoundContent}
          onChange={(nextValue) => setEmail(nextValue)}
          onSelect={(nextValue) => setEmail(nextValue)}
        >
          <Input
            size="large"
            prefix={<MailOutlined />}
            placeholder="搜索或输入已注册成员邮箱"
            disabled={loading || submitting}
            onPressEnter={() => {
              void handleInvite()
            }}
          />
        </AutoComplete>

        <Button
          type="primary"
          size="large"
          loading={submitting}
          disabled={Boolean(inviteBlockedReason) || !email.trim()}
          onClick={() => {
            void handleInvite()
          }}
        >
          邀请成员
        </Button>
      </div>

      <div className="share-modal__access-panel">
        <div className="share-modal__panel-head">
          <Typography.Text className="share-modal__panel-title">成员</Typography.Text>
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        ) : shareState?.items.length ? (
          <div className="share-modal__member-list">
            {shareState.items.map((member) => (
              <div key={member.id} className="share-modal__member-item">
                <div className="share-modal__member-copy">
                  <div className="share-modal__member-title-row">
                    <TeamOutlined className="share-modal__member-icon" />
                    <Typography.Text className="share-modal__member-email">{member.email}</Typography.Text>
                    <span className="share-modal__member-role">查看</span>
                  </div>
                  <Typography.Text className="share-modal__member-meta">
                    {formatInviteTime(member.createdAt)}
                  </Typography.Text>
                </div>

                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  loading={removingShareId === member.id}
                  onClick={() => {
                    void handleRemoveShare(member.id)
                  }}
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="share-modal__empty-state">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" />
          </div>
        )}
      </div>
    </Modal>
  )
}