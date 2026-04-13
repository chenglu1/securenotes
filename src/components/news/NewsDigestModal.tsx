import {
  BarChartOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  LinkOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Modal, Skeleton, Typography } from 'antd'
import type { NewsDigest } from '../../../electron/news/types'

interface NewsDigestModalProps {
  open: boolean
  digest: NewsDigest | null
  loading: boolean
  running: boolean
  onClose: () => void
  onRefresh: () => void
  onOpenSettings: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  macro: '宏观',
  equity: '股市',
  forex: '外汇',
  commodity: '大宗',
  company: '公司',
  policy: '政策',
  other: '其他',
}

const IMPACT_LABELS: Record<string, string> = {
  high: '高影响',
  medium: '中影响',
  low: '低影响',
}

const BIAS_LABELS: Record<string, string> = {
  positive: '偏利多',
  negative: '偏利空',
  mixed: '影响复杂',
  neutral: '偏中性',
}

function formatPublishedAt(value: string): string {
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

function formatCategoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? CATEGORY_LABELS.other
}

function formatImpactLabel(value: string): string {
  return IMPACT_LABELS[value] ?? IMPACT_LABELS.medium
}

function formatBiasLabel(value: string): string {
  return BIAS_LABELS[value] ?? BIAS_LABELS.mixed
}

export function NewsDigestModal({
  open,
  digest,
  loading,
  running,
  onClose,
  onRefresh,
  onOpenSettings,
}: NewsDigestModalProps) {
  const usedFallback = digest?.summaryMarkdown.includes('模型分析不可用') ?? false
  const sourceCount = digest ? new Set(digest.items.map((item) => item.source)).size : 0

  return (
    <Modal
      open={open}
      width={980}
      title={null}
      onCancel={onClose}
      footer={null}
      destroyOnClose={false}
      className="news-modal"
    >
      <div className="news-modal__hero">
        <div className="news-modal__hero-copy">
          <div className="news-modal__eyebrow-row">
            <Typography.Text className="news-modal__eyebrow">Daily Finance Digest</Typography.Text>
            <span className={`news-status-pill ${usedFallback ? 'news-status-pill--warning' : 'news-status-pill--live'}`}>
              {usedFallback ? '规则降级' : 'LLM 精排'}
            </span>
          </div>

          <Typography.Title level={3} className="news-modal__title">
            {digest?.title || '今日财经热点'}
          </Typography.Title>

          <Typography.Paragraph className="news-modal__subtitle">
            聚合多源财经新闻后，由模型完成筛选、翻译、重写与提醒文案生成，让信息密度更高、阅读更轻。
          </Typography.Paragraph>
        </div>

        <div className="news-modal__toolbar-actions">
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={running}
            onClick={onRefresh}
          >
            立即抓取
          </Button>
        </div>
      </div>

      {digest ? (
        <div className="news-modal__stats">
          <div className="news-stat-card">
            <span className="news-stat-card__icon">
              <BarChartOutlined />
            </span>
            <div className="news-stat-card__copy">
              <Typography.Text className="news-stat-card__label">热点条数</Typography.Text>
              <Typography.Text className="news-stat-card__value">{digest.items.length} 条</Typography.Text>
            </div>
          </div>

          <div className="news-stat-card">
            <span className="news-stat-card__icon">
              <GlobalOutlined />
            </span>
            <div className="news-stat-card__copy">
              <Typography.Text className="news-stat-card__label">覆盖来源</Typography.Text>
              <Typography.Text className="news-stat-card__value">{sourceCount} 个源</Typography.Text>
            </div>
          </div>

          <div className="news-stat-card">
            <span className="news-stat-card__icon">
              <NotificationOutlined />
            </span>
            <div className="news-stat-card__copy">
              <Typography.Text className="news-stat-card__label">摘要模式</Typography.Text>
              <Typography.Text className="news-stat-card__value">{usedFallback ? '规则补位' : '模型增强'}</Typography.Text>
            </div>
          </div>
        </div>
      ) : null}

      {usedFallback ? (
        <Alert
          showIcon
          type="warning"
          className="news-modal__alert"
          message="本次摘要触发了模型降级，当前结果由规则排序与基础补位生成。"
        />
      ) : null}

      {loading ? (
        <div className="news-modal__loading-grid">
          {[0, 1, 2].map((index) => (
            <div key={index} className="news-digest-card news-digest-card--loading">
              <Skeleton active title={{ width: index === 0 ? '72%' : '64%' }} paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      ) : digest ? (
        <div className="news-digest-list">
          {digest.items.map((item, index) => (
            <article
              key={`${item.url}-${index}`}
              className={`news-digest-card news-digest-card--${item.marketImpact}${index === 0 ? ' is-featured' : ''}`}
            >
              <div className="news-digest-card__rail">
                <div className="news-digest-card__rank">{String(index + 1).padStart(2, '0')}</div>

                <div className="news-digest-card__score">
                  <span>热度</span>
                  <strong>{item.finalScore}</strong>
                </div>
              </div>

              <div className="news-digest-card__body">
                <div className="news-digest-card__topline">
                  <div className="news-digest-card__badges">
                    <span className="news-pill">{item.source}</span>
                    <span className="news-pill news-pill--accent">{formatCategoryLabel(item.category)}</span>
                    <span className={`news-pill news-pill--impact news-pill--impact-${item.marketImpact}`}>
                      {formatImpactLabel(item.marketImpact)}
                    </span>
                    <span className={`news-pill news-pill--bias news-pill--bias-${item.marketBias}`}>
                      {formatBiasLabel(item.marketBias)}
                    </span>
                  </div>

                  <Typography.Text className="news-digest-card__time">
                    <ClockCircleOutlined />
                    {formatPublishedAt(item.publishedAt)}
                  </Typography.Text>
                </div>

                <Typography.Title level={4} className="news-digest-card__title">
                    {item.titleZh}
                  </Typography.Title>

                <Typography.Paragraph className="news-digest-card__summary">
                  {item.summaryZh}
                </Typography.Paragraph>

                <div className="news-digest-card__alert-box">
                  <NotificationOutlined />
                  <div className="news-digest-card__alert-copy">
                    <span className="news-digest-card__alert-label">提醒文案</span>
                    <strong>{item.alertTextZh}</strong>
                  </div>
                </div>

                <div className="news-digest-card__actions">
                  <Typography.Text className="news-digest-card__note">
                    <GlobalOutlined />
                    {item.originalLanguage === 'zh' ? '原文为中文内容' : `原文语言：${item.originalLanguage.toUpperCase()}`}
                  </Typography.Text>

                  <Button
                    className="news-digest-card__link"
                    icon={<LinkOutlined />}
                    onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                  >
                    打开原文
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="news-modal__empty">
          <Empty
            description="还没有生成今日摘要，先完成一次抓取，应用会自动整理成中文热点卡片。"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      )}
    </Modal>
  )
}
