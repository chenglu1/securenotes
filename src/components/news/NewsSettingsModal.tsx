import {
  ClockCircleOutlined,
  FileTextOutlined,
  GlobalOutlined,
  NotificationOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Select, Switch, Typography } from 'antd'
import { FINANCE_NEWS_SOURCES } from '../../../electron/news/sources'
import type { NewsAnalysisProvider, NewsSettingsInput, NewsSettingsView } from '../../../electron/news/types'

interface NewsSettingsModalProps {
  open: boolean
  settings: NewsSettingsView | null
  saving: boolean
  running: boolean
  onClose: () => void
  onSave: (input: NewsSettingsInput) => Promise<void>
  onRunNow: () => void
  onOpenLogs: () => void
}

const PROVIDER_OPTIONS = [
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'Gemini', value: 'gemini' },
] as const

function getDefaultModelForProvider(provider: NewsAnalysisProvider): string {
  if (provider === 'gemini') {
    return 'gemini-2.5-flash'
  }

  return 'minimax/minimax-m2.5:free'
}

function getProviderDisplayName(provider: NewsAnalysisProvider): string {
  return provider === 'gemini' ? 'Gemini' : 'OpenRouter'
}

function getApiKeyLabel(provider: NewsAnalysisProvider): string {
  return provider === 'gemini' ? 'Gemini API Key' : 'OpenRouter API Key'
}

function getModelPlaceholder(provider: NewsAnalysisProvider): string {
  return provider === 'gemini' ? 'gemini-2.5-flash' : 'minimax/minimax-m2.5:free'
}

function formatRuntimeTime(value: string | null | undefined): string {
  if (!value) {
    return '暂无'
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatRunStatus(status: NewsSettingsView['lastRunStatus'] | undefined): string {
  switch (status) {
    case 'running':
      return '正在执行'
    case 'success':
      return '最近运行成功'
    case 'error':
      return '最近运行失败'
    default:
      return '尚未运行'
  }
}

export function NewsSettingsModal({
  open,
  settings,
  saving,
  running,
  onClose,
  onSave,
  onRunNow,
  onOpenLogs,
}: NewsSettingsModalProps) {
  const [enabled, setEnabled] = useState(true)
  const [fetchTime, setFetchTime] = useState('08:30')
  const [topN, setTopN] = useState(10)
  const [provider, setProvider] = useState<NewsAnalysisProvider>('openrouter')
  const [model, setModel] = useState('minimax/minimax-m2.5:free')
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(true)
  const [sources, setSources] = useState<string[]>([])
  const [apiKey, setApiKey] = useState('')
  const hasStoredKey = settings?.apiKeyConfiguredByProvider?.[provider] ?? settings?.apiKeyConfigured ?? false

  useEffect(() => {
    if (!settings || !open) {
      return
    }

    setEnabled(settings.enabled)
    setFetchTime(settings.fetchTime)
    setTopN(settings.topN)
    setProvider(settings.provider)
    setModel(settings.model)
    setDesktopNotificationsEnabled(settings.desktopNotificationsEnabled)
    setSources(settings.sources)
    setApiKey('')
  }, [open, settings])

  const handleSave = async () => {
    await onSave({
      enabled,
      fetchTime,
      topN,
      provider,
      model,
      desktopNotificationsEnabled,
      sources,
      apiKey: apiKey.trim() || undefined,
    })
  }

  const handleProviderChange = (nextProvider: NewsAnalysisProvider) => {
    setProvider(nextProvider)
    setModel(getDefaultModelForProvider(nextProvider))
  }

  return (
    <Modal
      open={open}
      width={760}
      title={null}
      onCancel={onClose}
      onOk={() => void handleSave()}
      okText="保存设置"
      cancelText="关闭"
      confirmLoading={saving}
      className="news-settings-modal"
      destroyOnClose={false}
      footer={(_, { OkBtn, CancelBtn }) => (
        <div className="news-settings-modal__footer">
          <div className="news-settings-modal__footer-copy">
            <SafetyCertificateOutlined />
            <span>配置将保存在本机安全存储中。</span>
          </div>

          <div className="news-settings-modal__footer-actions">
            <Button className="news-settings-modal__run" icon={<ThunderboltOutlined />} onClick={onRunNow} loading={running}>
              立即抓取
            </Button>
            <CancelBtn />
            <OkBtn />
          </div>
        </div>
      )}
    >
      <div className="news-settings-modal__hero">
        <div className="news-settings-modal__hero-copy">
          <Typography.Text className="news-settings-modal__eyebrow">Digest Control Center</Typography.Text>
          <Typography.Title level={3} className="news-settings-modal__title">
            财经热点设置
          </Typography.Title>
          <Typography.Paragraph className="news-settings-modal__subtitle">
            控制抓取节奏、模型摘要和提醒方式，让每天打开应用时看到的是一份整理好的金融简报。
          </Typography.Paragraph>
        </div>

        <div className="news-settings-modal__status-stack">
          <span className={`news-status-pill ${hasStoredKey ? 'news-status-pill--live' : 'news-status-pill--warning'}`}>
            {hasStoredKey ? `${getProviderDisplayName(provider)} Key 已连接` : `等待配置 ${getProviderDisplayName(provider)} Key`}
          </span>
          <span className={`news-status-pill ${enabled ? 'news-status-pill--muted' : 'news-status-pill--neutral'}`}>
            {enabled ? '每日提醒开启' : '每日提醒暂停'}
          </span>
        </div>
      </div>

      <div className="news-settings-modal__cards">
        {settings ? (
          <section className="news-settings-runtime">
            <div className="news-settings-runtime__head">
              <div className="news-settings-runtime__copy">
                <Typography.Text className="news-settings-runtime__label">运行状态</Typography.Text>
                <Typography.Title level={5} className="news-settings-runtime__title">
                  {formatRunStatus(settings.lastRunStatus)}
                </Typography.Title>
              </div>

              <Button icon={<FileTextOutlined />} onClick={onOpenLogs}>
                打开日志
              </Button>
            </div>

            <div className="news-settings-runtime__meta">
              <span>最近开始：{formatRuntimeTime(settings.lastRunStartedAt)}</span>
              <span>最近完成：{formatRuntimeTime(settings.lastRunCompletedAt)}</span>
              <span>最近成功：{formatRuntimeTime(settings.lastSuccessfulRunAt)}</span>
              <span>最近模型：{settings.lastModelUsed || '暂无'}</span>
            </div>

            {settings.lastRunStatus === 'error' && settings.lastRunError ? (
              <Alert
                showIcon
                type="error"
                message={`最近一次执行失败：${settings.lastRunError}`}
              />
            ) : null}

            {settings.lastRunStatus === 'success' && settings.lastUsedFallback ? (
              <Alert
                showIcon
                type="warning"
                message="最近一次执行已完成，但模型阶段发生了回退，摘要使用了规则补位结果。"
              />
            ) : null}
          </section>
        ) : null}

        <section className="news-settings-card">
          <div className="news-settings-card__head">
            <span className="news-settings-card__icon">
              <ClockCircleOutlined />
            </span>
            <div className="news-settings-card__copy">
              <Typography.Text className="news-settings-card__title">抓取节奏</Typography.Text>
              <Typography.Text className="news-settings-card__desc">设置何时生成简报，以及每天保留几条热点。</Typography.Text>
            </div>
          </div>

          <div className="news-settings-card__toggle-row">
            <div className="news-settings-card__toggle-copy">
              <Typography.Text className="news-settings-card__toggle-title">启用每日提醒</Typography.Text>
              <Typography.Text className="news-settings-card__toggle-desc">应用在后台运行时，会按设定时间生成摘要。</Typography.Text>
            </div>
            <Switch checked={enabled} onChange={setEnabled} />
          </div>

          <div className="news-settings-modal__grid">
            <div className="news-settings-modal__field">
              <Typography.Text className="news-settings-modal__label">抓取时间</Typography.Text>
              <Input type="time" value={fetchTime} onChange={(event) => setFetchTime(event.target.value)} />
            </div>

            <div className="news-settings-modal__field">
              <Typography.Text className="news-settings-modal__label">热点条数</Typography.Text>
              <InputNumber min={5} max={20} value={topN} onChange={(value) => setTopN(typeof value === 'number' ? value : 10)} />
            </div>
          </div>
        </section>

        <section className="news-settings-card">
          <div className="news-settings-card__head">
            <span className="news-settings-card__icon">
              <RobotOutlined />
            </span>
            <div className="news-settings-card__copy">
              <Typography.Text className="news-settings-card__title">模型与凭证</Typography.Text>
              <Typography.Text className="news-settings-card__desc">选择摘要模型，并为本机配置可用的访问密钥。</Typography.Text>
            </div>
          </div>

          <div className="news-settings-modal__grid">
            <div className="news-settings-modal__field">
              <Typography.Text className="news-settings-modal__label">模型提供商</Typography.Text>
              <Select
                value={provider}
                options={PROVIDER_OPTIONS as unknown as Array<{ label: string; value: string }>}
                onChange={(value) => handleProviderChange(value as NewsAnalysisProvider)}
              />
            </div>

            <div className="news-settings-modal__field">
              <Typography.Text className="news-settings-modal__label">模型名称</Typography.Text>
              <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder={getModelPlaceholder(provider)} />
            </div>
          </div>

          <div className="news-settings-modal__section">
            <Typography.Text className="news-settings-modal__label">{getApiKeyLabel(provider)}</Typography.Text>
            <Input.Password
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasStoredKey ? '留空表示继续使用已保存的 Key' : `请先输入你的 ${getProviderDisplayName(provider)} API Key`}
            />
            <Typography.Text className="news-settings-modal__hint">
              {hasStoredKey ? '当前已保存 Key。留空不会覆盖。' : `当前尚未配置 ${getProviderDisplayName(provider)} Key，暂时无法调用模型生成中文摘要。`}
            </Typography.Text>
          </div>
        </section>

        <section className="news-settings-card">
          <div className="news-settings-card__head">
            <span className="news-settings-card__icon">
              <NotificationOutlined />
            </span>
            <div className="news-settings-card__copy">
              <Typography.Text className="news-settings-card__title">通知与来源</Typography.Text>
              <Typography.Text className="news-settings-card__desc">决定是否弹出桌面提醒，以及从哪些结构化源聚合候选新闻。</Typography.Text>
            </div>
          </div>

          <div className="news-settings-card__toggle-row">
            <div className="news-settings-card__toggle-copy">
              <Typography.Text className="news-settings-card__toggle-title">启用桌面通知</Typography.Text>
              <Typography.Text className="news-settings-card__toggle-desc">抓取成功后，将前几条重点内容直接推送到桌面。</Typography.Text>
            </div>
            <Switch checked={desktopNotificationsEnabled} onChange={setDesktopNotificationsEnabled} />
          </div>

          <div className="news-settings-modal__section">
            <Typography.Text className="news-settings-modal__label">新闻源</Typography.Text>
            <Checkbox.Group
              className="news-settings-modal__source-group"
              value={sources}
              onChange={(value) => setSources(value.filter((item): item is string => typeof item === 'string'))}
            >
              {FINANCE_NEWS_SOURCES.map((source) => (
                <div key={source.id} className={`news-source-card${sources.includes(source.id) ? ' is-active' : ''}`}>
                  <Checkbox value={source.id}>{source.label}</Checkbox>
                  <Typography.Text className="news-source-card__meta">
                    <GlobalOutlined />
                    RSS 源
                  </Typography.Text>
                </div>
              ))}
            </Checkbox.Group>
          </div>
        </section>
      </div>

      <Alert
        showIcon
        type="info"
        className="news-settings-modal__alert"
        message={`当前已选择 ${sources.length} 个新闻源。应用在后台运行时，会按设定时间生成中文摘要并提醒。日志位置：${settings?.logFilePath || '初始化后可用'}`}
      />
    </Modal>
  )
}
