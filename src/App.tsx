import { useCallback, useEffect, useState } from 'react'
import { App as AntdApp } from 'antd'
import { AppShell } from './components/layout/AppShell'
import { AuthModal } from './components/auth/AuthModal'
import { GithubTrendingModal } from './components/github/GithubTrendingModal'
import { NewsDigestModal } from './components/news/NewsDigestModal'
import { NewsSettingsModal } from './components/news/NewsSettingsModal'
import { useNoteStore } from './stores/noteStore'
import type { GithubTrendingPeriod, GithubTrendingResponse } from '../electron/github-trending/types'
import type { NewsDigest, NewsSettingsInput, NewsSettingsView } from '../electron/news/types'

let bootstrapPromise: Promise<void> | null = null

function getDisplayErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback
  }

  const normalized = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^TypeError:\s*/i, '')
    .trim()

  if (!normalized || normalized.toLowerCase() === 'fetch failed') {
    return fallback
  }

  return normalized
}

export function App() {
  const { message } = AntdApp.useApp()
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const loadTags = useNoteStore((s) => s.loadTags)
  const initAuth = useNoteStore((s) => s.initAuth)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const syncStatus = useNoteStore((s) => s.syncStatus)
  const createNote = useNoteStore((s) => s.createNote)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showNewsDigestModal, setShowNewsDigestModal] = useState(false)
  const [showNewsSettingsModal, setShowNewsSettingsModal] = useState(false)
  const [showGithubTrendingModal, setShowGithubTrendingModal] = useState(false)
  const [latestNewsDigest, setLatestNewsDigest] = useState<NewsDigest | null>(null)
  const [newsSettings, setNewsSettings] = useState<NewsSettingsView | null>(null)
  const [githubTrending, setGithubTrending] = useState<GithubTrendingResponse | null>(null)
  const [newsDigestLoading, setNewsDigestLoading] = useState(false)
  const [newsSettingsSaving, setNewsSettingsSaving] = useState(false)
  const [newsRunning, setNewsRunning] = useState(false)
  const [githubTrendingPeriod, setGithubTrendingPeriod] = useState<GithubTrendingPeriod>('daily')
  const [githubTrendingLoading, setGithubTrendingLoading] = useState(false)
  const [githubTrendingRefreshing, setGithubTrendingRefreshing] = useState(false)

  const loadGithubTrending = useCallback(async (
    period: GithubTrendingPeriod,
    options?: { showModal?: boolean; forceRefresh?: boolean },
  ) => {
    const showModal = options?.showModal ?? false
    const forceRefresh = options?.forceRefresh ?? false

    if (showModal) {
      setShowGithubTrendingModal(true)
    }

    if (forceRefresh) {
      setGithubTrendingRefreshing(true)
    } else {
      setGithubTrendingLoading(true)
    }

    setGithubTrendingPeriod(period)

    try {
      const response = await window.api.getGithubTrending(period, { forceRefresh })
      setGithubTrending(response)
    } catch (error) {
      console.error('Failed to load GitHub trending:', error)
      const nextMessage = getDisplayErrorMessage(error, '读取 GitHub 热门项目失败，请稍后重试。')
      message.error(nextMessage)
    } finally {
      setGithubTrendingLoading(false)
      setGithubTrendingRefreshing(false)
    }
  }, [message])

  const loadLatestNewsDigest = useCallback(async (showModal = false) => {
    setNewsDigestLoading(true)
    try {
      const digest = await window.api.getLatestNewsDigest()
      setLatestNewsDigest(digest)
      if (showModal) {
        setShowNewsDigestModal(true)
      }
    } catch (error) {
      console.error('Failed to load latest news digest:', error)
      message.error('读取今日财经热点失败')
    } finally {
      setNewsDigestLoading(false)
    }
  }, [message])

  const loadNewsSettings = useCallback(async (showModal = false) => {
    try {
      const settings = await window.api.getNewsSettings()
      setNewsSettings(settings)
      if (showModal) {
        setShowNewsSettingsModal(true)
      }
    } catch (error) {
      console.error('Failed to load news settings:', error)
      message.error('读取财经热点设置失败')
    }
  }, [message])

  const handleShowNewsDigest = useCallback(() => {
    void loadLatestNewsDigest(true)
  }, [loadLatestNewsDigest])

  const handleShowNewsSettings = useCallback(() => {
    void loadNewsSettings(true)
  }, [loadNewsSettings])

  const handleShowGithubTrending = useCallback(() => {
    void loadGithubTrending(githubTrendingPeriod, { showModal: true })
  }, [githubTrendingPeriod, loadGithubTrending])

  const handleRunNewsDigest = useCallback(async () => {
    setNewsRunning(true)
    try {
      const digest = await window.api.runNewsDigestNow()
      setLatestNewsDigest(digest)
      setShowNewsDigestModal(true)
      message.success('今日财经热点已更新')
    } catch (error) {
      console.error('Failed to run news digest:', error)
      const nextMessage = error instanceof Error && error.message.trim() ? error.message : '执行财经热点抓取失败'
      message.error(nextMessage)
    } finally {
      void loadNewsSettings()
      setNewsRunning(false)
    }
  }, [loadNewsSettings, message])

  const handleOpenNewsLog = useCallback(async () => {
    try {
      await window.api.openNewsLogFile()
    } catch (error) {
      console.error('Failed to open news log file:', error)
      const nextMessage = error instanceof Error && error.message.trim() ? error.message : '打开财经热点日志失败'
      message.error(nextMessage)
    }
  }, [message])

  const handleSaveNewsSettings = useCallback(async (input: NewsSettingsInput) => {
    setNewsSettingsSaving(true)
    try {
      const nextSettings = await window.api.saveNewsSettings(input)
      setNewsSettings(nextSettings)
      message.success('财经热点设置已保存')
    } catch (error) {
      console.error('Failed to save news settings:', error)
      const nextMessage = error instanceof Error && error.message.trim() ? error.message : '保存财经热点设置失败'
      message.error(nextMessage)
      throw error
    } finally {
      setNewsSettingsSaving(false)
    }
  }, [message])

  useEffect(() => {
    const bootstrap = async () => {
      if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
          await initAuth()
          await loadNotes()
          await loadTags()
        })().catch((error) => {
          bootstrapPromise = null
          throw error
        })
      }

      await bootstrapPromise
    }

    void bootstrap()
  }, [initAuth, loadNotes, loadTags])

  useEffect(() => {
    return window.api.onCreateNewNote(async () => {
      await createNote()
    })
  }, [createNote])

  useEffect(() => {
    if (syncStatus === 'reauth-required') {
      setShowAuthModal(true)
    }
  }, [syncStatus])

  useEffect(() => {
    void loadNewsSettings()
    void loadLatestNewsDigest()
  }, [loadLatestNewsDigest, loadNewsSettings])

  useEffect(() => {
    return window.api.onNewsDigestReady(() => {
      void loadLatestNewsDigest(true)
    })
  }, [loadLatestNewsDigest])

  useEffect(() => {
    return window.api.onOpenNewsDigest(() => {
      void loadLatestNewsDigest(true)
    })
  }, [loadLatestNewsDigest])

  useEffect(() => {
    return window.api.onOpenNewsSettings(() => {
      void loadNewsSettings(true)
    })
  }, [loadNewsSettings])

  return (
    <>
      <AppShell
        onShowAuth={() => setShowAuthModal(true)}
        onShowNewsDigest={handleShowNewsDigest}
        onShowNewsSettings={handleShowNewsSettings}
        onRunNewsDigest={() => {
          void handleRunNewsDigest()
        }}
        onShowGithubTrending={handleShowGithubTrending}
        isNewsRunning={newsRunning}
      />
      {showAuthModal && !isAuthenticated && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
      <NewsDigestModal
        open={showNewsDigestModal}
        digest={latestNewsDigest}
        loading={newsDigestLoading}
        running={newsRunning}
        onClose={() => setShowNewsDigestModal(false)}
        onRefresh={() => {
          void handleRunNewsDigest()
        }}
        onOpenSettings={handleShowNewsSettings}
      />
      <NewsSettingsModal
        open={showNewsSettingsModal}
        settings={newsSettings}
        saving={newsSettingsSaving}
        running={newsRunning}
        onClose={() => setShowNewsSettingsModal(false)}
        onSave={handleSaveNewsSettings}
        onRunNow={() => {
          void handleRunNewsDigest()
        }}
        onOpenLogs={() => {
          void handleOpenNewsLog()
        }}
      />
      <GithubTrendingModal
        open={showGithubTrendingModal}
        period={githubTrendingPeriod}
        data={githubTrending}
        loading={githubTrendingLoading}
        refreshing={githubTrendingRefreshing}
        onClose={() => setShowGithubTrendingModal(false)}
        onPeriodChange={(period) => {
          void loadGithubTrending(period)
        }}
        onRefresh={() => {
          void loadGithubTrending(githubTrendingPeriod, { forceRefresh: true })
        }}
      />
    </>
  )
}
