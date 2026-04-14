import {
  ClockCircleOutlined,
  FireOutlined,
  ForkOutlined,
  GithubOutlined,
  LinkOutlined,
  ReloadOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Modal, Segmented, Skeleton, Typography } from 'antd'
import type { GithubTrendingPeriod, GithubTrendingResponse } from '../../../electron/github-trending/types'

interface GithubTrendingModalProps {
  open: boolean
  period: GithubTrendingPeriod
  data: GithubTrendingResponse | null
  loading: boolean
  refreshing: boolean
  onClose: () => void
  onPeriodChange: (period: GithubTrendingPeriod) => void
  onRefresh: () => void
}

const PERIOD_LABELS: Record<GithubTrendingPeriod, string> = {
  daily: '日榜',
  weekly: '周榜',
  monthly: '月榜',
}

function formatNumber(value: number | null) {
  if (value == null) {
    return '--'
  }

  return new Intl.NumberFormat('en-US').format(value)
}

function formatFetchedAt(value: string | null) {
  if (!value) {
    return '未抓取'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function GithubTrendingModal({
  open,
  period,
  data,
  loading,
  refreshing,
  onClose,
  onPeriodChange,
  onRefresh,
}: GithubTrendingModalProps) {
  const items = data?.items ?? []
  const featuredProject = items[0] ?? null
  const boardProjects = items.slice(1)
  const sourceLabel = data?.sourceLabel ?? 'GitHub Trending'

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      className="github-trending-modal"
      title={null}
    >
      <div className="github-trending-modal__hero">
        <div className="github-trending-modal__hero-copy">
          <div className="github-trending-modal__eyebrow-row">
            <Typography.Text className="github-trending-modal__eyebrow">GitHub Trending</Typography.Text>
            <span className="github-trending-modal__pill">Top 10</span>
          </div>

          <Typography.Title level={3} className="github-trending-modal__title">
            看看这会儿 GitHub 上最热的项目
          </Typography.Title>

          <Typography.Paragraph className="github-trending-modal__subtitle">
            像看热点头条一样快速扫榜。榜首项目单独突出，其余项目压成速览卡片，支持日榜、周榜、月榜三种窗口。
          </Typography.Paragraph>

          <div className="github-trending-modal__source-row">
            <span className="github-trending-modal__source-pill">
              <GithubOutlined />
              <span>{sourceLabel}</span>
            </span>
            <span className="github-trending-modal__source-note">
              网络波动时会自动切到备用源，尽量保持榜单连续可用。
            </span>
          </div>
        </div>

        <div className="github-trending-modal__hero-actions">
          <Segmented
            value={period}
            className="github-trending-modal__period-switch"
            options={[
              { label: '日榜', value: 'daily' },
              { label: '周榜', value: 'weekly' },
              { label: '月榜', value: 'monthly' },
            ]}
            onChange={(value) => onPeriodChange(value as GithubTrendingPeriod)}
          />

          <Button
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={onRefresh}
          >
            刷新
          </Button>
        </div>
      </div>

      <div className="github-trending-modal__stats">
        <div className="github-trending-stat-card">
          <span className="github-trending-stat-card__label">当前窗口</span>
          <strong className="github-trending-stat-card__value">{PERIOD_LABELS[period]}</strong>
        </div>
        <div className="github-trending-stat-card">
          <span className="github-trending-stat-card__label">数据来源</span>
          <strong className="github-trending-stat-card__value github-trending-stat-card__value--source">{sourceLabel}</strong>
        </div>
        <div className="github-trending-stat-card">
          <span className="github-trending-stat-card__label">项目数量</span>
          <strong className="github-trending-stat-card__value">{items.length || 10}</strong>
        </div>
        <div className="github-trending-stat-card">
          <span className="github-trending-stat-card__label">最近抓取</span>
          <strong className="github-trending-stat-card__value github-trending-stat-card__value--time">
            {formatFetchedAt(data?.fetchedAt ?? null)}
          </strong>
        </div>
      </div>

      {data?.warning ? (
        <Alert
          className="github-trending-modal__alert"
          type="info"
          showIcon
          message={data.sourceLabel}
          description={data.warning}
        />
      ) : null}

      {loading ? (
        <div className="github-trending-modal__body">
          <div className="github-trending-feature github-trending-feature--skeleton">
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
          <div className="github-trending-board__grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="github-compact-card github-compact-card--skeleton">
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="github-trending-modal__empty">
          <Empty description="暂时还没有抓到 GitHub 热门项目。" />
        </div>
      ) : (
        <div className="github-trending-modal__body">
          {featuredProject ? (
            <section className="github-trending-feature">
              <div className="github-trending-feature__topline">
                <span className="github-trending-feature__kicker">榜首项目</span>
                <span className="github-trending-feature__rank">#{featuredProject.rank}</span>
              </div>

              <div className="github-trending-feature__main">
                <div className="github-trending-feature__copy">
                  <Typography.Text className="github-trending-feature__path">
                    {featuredProject.repository}
                  </Typography.Text>

                  <Typography.Title level={4} className="github-trending-feature__title">
                    {featuredProject.name}
                  </Typography.Title>

                  <Typography.Paragraph className="github-trending-feature__description">
                    {featuredProject.description ?? 'GitHub Trending 页面未提供项目描述。'}
                  </Typography.Paragraph>

                  <div className="github-trending-feature__meta">
                    <span className="github-project-chip github-project-chip--hot">
                      <FireOutlined />
                      <span>{featuredProject.periodStarsLabel ?? `${PERIOD_LABELS[period]}热度上涨`}</span>
                    </span>
                    <span className="github-project-chip">
                      <StarOutlined />
                      <span>{featuredProject.totalStarsLabel ?? formatNumber(featuredProject.totalStars)}</span>
                    </span>
                    <span className="github-project-chip">
                      <ForkOutlined />
                      <span>{featuredProject.forksLabel ?? formatNumber(featuredProject.forks)}</span>
                    </span>
                    {featuredProject.language ? (
                      <span className="github-project-chip">
                        <ClockCircleOutlined />
                        <span>{featuredProject.language}</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="github-trending-feature__side">
                  <div className="github-trending-feature__badge">
                    <ThunderboltOutlined />
                    <span>Hot Pick</span>
                  </div>

                  <a
                    className="github-trending-feature__link"
                    href={featuredProject.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>打开仓库</span>
                    <LinkOutlined />
                  </a>
                </div>
              </div>
            </section>
          ) : null}

          {boardProjects.length > 0 ? (
            <section className="github-trending-board">
              <div className="github-trending-board__header">
                <div>
                  <Typography.Text className="github-trending-board__eyebrow">榜单速览</Typography.Text>
                  <Typography.Title level={5} className="github-trending-board__title">
                    其余 {boardProjects.length} 个热门项目
                  </Typography.Title>
                </div>
                <Typography.Text className="github-trending-board__hint">
                  点击右上角可直接跳转仓库
                </Typography.Text>
              </div>

              <div className="github-trending-board__grid">
                {boardProjects.map((project) => (
                  <article key={project.repository} className="github-compact-card">
                    <div className="github-compact-card__head">
                      <div className="github-compact-card__intro">
                        <span className={`github-compact-card__rank ${project.rank <= 3 ? 'github-compact-card__rank--top' : ''}`}>
                          #{project.rank}
                        </span>

                        <div className="github-compact-card__title-wrap">
                          <Typography.Text className="github-compact-card__path">{project.owner}</Typography.Text>
                          <a
                            className="github-compact-card__title"
                            href={project.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {project.name}
                          </a>
                        </div>
                      </div>

                      <a
                        className="github-compact-card__link"
                        href={project.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`打开 ${project.repository}`}
                      >
                        <LinkOutlined />
                      </a>
                    </div>

                    <Typography.Paragraph className="github-compact-card__description" ellipsis={{ rows: 2 }}>
                      {project.description ?? 'GitHub Trending 页面未提供项目描述。'}
                    </Typography.Paragraph>

                    <div className="github-compact-card__meta">
                      <span className="github-project-chip github-project-chip--hot">
                        <FireOutlined />
                        <span>{project.periodStarsLabel ?? `${PERIOD_LABELS[period]}热度上涨`}</span>
                      </span>
                      <span className="github-project-chip">
                        <StarOutlined />
                        <span>{project.totalStarsLabel ?? formatNumber(project.totalStars)}</span>
                      </span>
                      <span className="github-project-chip">
                        <ForkOutlined />
                        <span>{project.forksLabel ?? formatNumber(project.forks)}</span>
                      </span>
                      {project.language ? (
                        <span className="github-project-chip">
                          <ClockCircleOutlined />
                          <span>{project.language}</span>
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  )
}