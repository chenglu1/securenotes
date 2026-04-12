import { useState } from 'react'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Modal, Segmented, Typography } from 'antd'
import { useNoteStore } from '../../stores/noteStore'

interface AuthModalProps {
  onClose: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = useNoteStore((s) => s.login)
  const register = useNoteStore((s) => s.register)
  const loginWithGoogle = useNoteStore((s) => s.loginWithGoogle)
  const syncStatus = useNoteStore((s) => s.syncStatus)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await register(email, password)
      }

      // 成功后关闭模态框
      onClose()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)

    try {
      await loginWithGoogle()
      if (useNoteStore.getState().isAuthenticated) {
        onClose()
      }
    } catch (err: any) {
      setError(err.message || 'Google 登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      centered
      footer={null}
      width={420}
      destroyOnClose
      maskClosable={!loading}
      closable={!loading}
      keyboard={!loading}
      onCancel={onClose}
      className="auth-modal"
    >
      <div className="auth-panel">
        <div className="auth-hero auth-hero--simple">
          <Typography.Text className="auth-kicker auth-kicker--notion">Secure Workspace</Typography.Text>
          <Typography.Title level={3} className="auth-title auth-title--simple">
            {isLogin ? '登录 SecureNotes' : '创建 SecureNotes 账户'}
          </Typography.Title>
          <Typography.Paragraph className="auth-subtitle">
            像常见文档工具一样使用它。内容先保存在本地，登录后再同步到你的云端空间。
          </Typography.Paragraph>
        </div>

        {syncStatus === 'reauth-required' && (
          <Alert
            showIcon
            type="warning"
            message="检测到旧版登录态缺少加密密钥，请重新输入密码以恢复云同步。"
          />
        )}

        <Segmented
          block
          size="large"
          options={[
            { label: '登录', value: 'login' },
            { label: '注册', value: 'register' },
          ]}
          value={isLogin ? 'login' : 'register'}
          onChange={(value) => {
            setIsLogin(value === 'login')
            setError('')
          }}
        />

        <form onSubmit={handleSubmit} className="auth-form">
          <>
            <div className="auth-field">
              <label className="auth-field__label">
                邮箱
              </label>
              <Input
                type="email"
                size="large"
                prefix={<MailOutlined />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="your@email.com"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label">
                密码
              </label>
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </>

          {error && (
            <Alert showIcon type="error" message={error} />
          )}

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            disabled={loading}
            loading={loading}
          >
            {loading
              ? '处理中...'
              : isLogin
                ? '登录并同步'
                : '注册并开始同步'}
          </Button>

          <>
            <div className="auth-oauth-divider">
              <span>或</span>
            </div>

            <Button
              size="large"
              block
              className="auth-google-button"
              disabled={loading}
              onClick={handleGoogleLogin}
            >
              <span className="auth-google-button__mark">G</span>
              <span>使用 Google 登录</span>
            </Button>
          </>
        </form>

        <div className="auth-footer-copy">
          <Button
            type="link"
            onClick={() => {
              setIsLogin(!isLogin)
              setError('')
            }}
          >
            {isLogin ? '没有账号？注册' : '已有账号？登录'}
          </Button>

          <Typography.Text className="auth-helper-text">
            数据默认先保存在本地。
          </Typography.Text>
        </div>
      </div>
    </Modal>
  )
}
