import type { BrowserWindow } from 'electron'
import { NewsRepository } from '../database/repositories/news'
import { getNewsApiKey, saveNewsApiKey } from '../secure-store'
import { analyzeNewsCandidates, buildFallbackAnalysis } from './analyzer'
import { fetchFinanceNewsCandidates } from './fetchers'
import { getNewsLogFilePath, openNewsLogFile, writeNewsLog } from './logger'
import { showNewsDigestNotification } from './notifications'
import { rankNewsCandidates } from './scoring'
import type { NewsAnalysisItem, NewsAnalysisProvider, NewsDigest, NewsDigestItem, NewsSettings, NewsSettingsInput, NewsSettingsView, RankedNewsCandidate, NewsFetchSourceResult } from './types'

function getDefaultModelForProvider(provider: NewsAnalysisProvider): string {
  if (provider === 'gemini') {
    return 'gemini-2.5-flash'
  }

  return 'minimax/minimax-m2.5:free'
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function buildDigestTitle(digestDate: string): string {
  return `${digestDate} 财经热点摘要`
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return String(error)
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

function buildDigestMarkdown(items: NewsDigestItem[], usedFallback: boolean): string {
  const lines: string[] = []
  if (usedFallback) {
    lines.push('> 注意：本次模型分析不可用，已自动降级为规则排序结果。', '')
  }

  for (const [index, item] of items.entries()) {
    lines.push(`## ${index + 1}. ${item.titleZh}`)
    lines.push(item.summaryZh)
    lines.push(`来源：${item.source} | 发布时间：${formatPublishedAt(item.publishedAt)}`)
    lines.push(`原文链接：${item.url}`)
    lines.push('')
  }

  return lines.join('\n')
}

function buildFetchFailureMessage(sourceResults: NewsFetchSourceResult[]): string {
  if (sourceResults.length === 0) {
    return '未配置可用的财经新闻源。'
  }

  const successfulSources = sourceResults.filter((item) => item.success && item.itemCount > 0)
  if (successfulSources.length > 0) {
    return '新闻源已返回数据，但经过去重和筛选后没有保留可展示候选。'
  }

  const failures = sourceResults
    .map((item) => `${item.sourceLabel}${item.error ? `：${item.error}` : ''}`)
    .join('；')

  return `未获取到可用的财经新闻源数据。已尝试 ${sourceResults.length} 个源：${failures}`
}

function msUntilNextRun(fetchTime: string, now = new Date()): number {
  const [hourText, minuteText] = fetchTime.split(':')
  const hours = Number.parseInt(hourText, 10)
  const minutes = Number.parseInt(minuteText, 10)
  const next = new Date(now)
  next.setHours(Number.isNaN(hours) ? 8 : hours, Number.isNaN(minutes) ? 30 : minutes, 0, 0)

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }

  return next.getTime() - now.getTime()
}

function mergeAnalysis(
  candidates: RankedNewsCandidate[],
  analyses: NewsAnalysisItem[],
  topN: number,
): NewsDigestItem[] {
  const analysisMap = new Map(analyses.map((analysis) => [analysis.candidateId, analysis]))
  const mergedItems = candidates
    .map((candidate) => {
      const analysis = analysisMap.get(candidate.id)
      const llmScore = analysis?.heatScore ?? Math.max(0, Math.min(100, Math.round(candidate.ruleScore)))
      const titleZh = analysis?.titleZh?.trim() || candidate.title
      const summaryZh = analysis?.summaryZh?.trim() || candidate.summary || candidate.title
      const alertTextZh = analysis?.alertTextZh?.trim() || titleZh

      return {
        candidateId: candidate.id,
        include: analysis?.include !== false,
        source: candidate.sourceLabel,
        url: candidate.url,
        publishedAt: candidate.publishedAt,
        originalLanguage: candidate.languageGuess,
        title: candidate.title,
        summary: candidate.summary,
        titleZh,
        summaryZh,
        alertTextZh,
        category: analysis?.category || 'other',
        marketImpact: analysis?.marketImpact || 'medium',
        marketBias: analysis?.marketBias || 'mixed',
        ruleScore: candidate.ruleScore,
        llmScore,
        finalScore: Math.round(candidate.ruleScore * 0.35 + llmScore * 0.65),
      }
    })

  const rankedItems = mergedItems.filter((item) => item.include)

  const fillCandidates = candidates
    .filter((candidate) => !analysisMap.has(candidate.id) && !rankedItems.some((item) => item.url === candidate.url))
    .map((candidate) => ({
      candidateId: candidate.id,
      include: true,
      source: candidate.sourceLabel,
      url: candidate.url,
      publishedAt: candidate.publishedAt,
      originalLanguage: candidate.languageGuess,
      title: candidate.title,
      summary: candidate.summary,
      titleZh: candidate.title,
      summaryZh: candidate.summary || candidate.title,
      alertTextZh: candidate.title,
      category: 'other',
      marketImpact: 'medium',
      marketBias: 'mixed',
      ruleScore: candidate.ruleScore,
      llmScore: Math.max(0, Math.min(100, Math.round(candidate.ruleScore))),
      finalScore: Math.round(candidate.ruleScore),
    }))

  return [...rankedItems, ...fillCandidates]
    .sort((left, right) => {
      if (right.finalScore !== left.finalScore) {
        return right.finalScore - left.finalScore
      }

      return right.publishedAt.localeCompare(left.publishedAt)
    })
    .slice(0, topN)
    .map((item) => ({
      id: '',
      ...item,
      createdAt: '',
    }))
}

export class NewsDigestService {
  private readonly repository = new NewsRepository()
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null
  private currentRunPromise: Promise<NewsDigest> | null = null

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  initialize() {
    void this.scheduleNextRun()
  }

  dispose() {
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer)
      this.scheduleTimer = null
    }
  }

  getSettings(): NewsSettingsView {
    const settings = this.repository.getSettings()
    const apiKeyConfiguredByProvider: Record<NewsAnalysisProvider, boolean> = {
      openrouter: Boolean(getNewsApiKey('openrouter')),
      gemini: Boolean(getNewsApiKey('gemini')),
    }

    return {
      ...settings,
      apiKeyConfigured: apiKeyConfiguredByProvider[settings.provider],
      apiKeyConfiguredByProvider,
      logFilePath: getNewsLogFilePath(),
    }
  }

  saveSettings(input: NewsSettingsInput): NewsSettingsView {
    const trimmedApiKey = input.apiKey?.trim()
    if (trimmedApiKey) {
      saveNewsApiKey(input.provider, trimmedApiKey)
    }

    this.repository.saveSettings({
      enabled: input.enabled,
      fetchTime: input.fetchTime,
      topN: input.topN,
      provider: input.provider,
      model: input.model.trim() || getDefaultModelForProvider(input.provider),
      desktopNotificationsEnabled: input.desktopNotificationsEnabled,
      sources: input.sources,
    })

    void this.scheduleNextRun()
    return this.getSettings()
  }

  getLatestDigest(): NewsDigest | null {
    return this.repository.getLatestDigest()
  }

  openDigest() {
    const win = this.getWindow()
    if (!win) {
      return
    }

    if (win.isMinimized()) {
      win.restore()
    }

    win.show()
    win.focus()
    win.webContents.send('news:open-digest')
  }

  openSettings() {
    const win = this.getWindow()
    if (!win) {
      return
    }

    if (win.isMinimized()) {
      win.restore()
    }

    win.show()
    win.focus()
    win.webContents.send('news:open-settings')
  }

  async openLogFile(): Promise<void> {
    await openNewsLogFile()
  }

  async runNow(trigger: 'manual' | 'scheduled' = 'manual'): Promise<NewsDigest> {
    if (this.currentRunPromise) {
      return this.currentRunPromise
    }

    this.currentRunPromise = this.runPipeline(trigger)
    try {
      return await this.currentRunPromise
    } finally {
      this.currentRunPromise = null
    }
  }

  private async scheduleNextRun() {
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer)
      this.scheduleTimer = null
    }

    const settings = this.repository.getSettings()
    if (!settings.enabled) {
      return
    }

    const delay = msUntilNextRun(settings.fetchTime)
    this.scheduleTimer = setTimeout(async () => {
      try {
        await this.runNow('scheduled')
      } catch (error) {
        console.error('[news] Scheduled digest run failed:', error)
      } finally {
        void this.scheduleNextRun()
      }
    }, delay)
  }

  private async runPipeline(trigger: 'manual' | 'scheduled'): Promise<NewsDigest> {
    const settings = this.repository.getSettings()
    const startedAt = new Date().toISOString()
    this.repository.recordRunStarted(startedAt)
    writeNewsLog('info', 'Starting finance digest run', {
      trigger,
      model: settings.model,
      topN: settings.topN,
      sourceCount: settings.sources.length,
    })

    let modelUsed: string | null = null
    let usedFallback = false

    try {
    const apiKey = getNewsApiKey(settings.provider)
    if (!apiKey) {
      throw new Error(`请先在财经热点设置中配置${settings.provider === 'gemini' ? ' Gemini' : ' OpenRouter'} API Key。`)
    }

    const digestDate = formatLocalDate(new Date())
    const fetchResult = await fetchFinanceNewsCandidates(settings.sources)
    const candidates = rankNewsCandidates(
      fetchResult.candidates,
      Math.max(settings.topN * 3, 24),
    )

    if (candidates.length === 0) {
      throw new Error(buildFetchFailureMessage(fetchResult.sourceResults))
    }

    let analyses: NewsAnalysisItem[]

    try {
      const analysisResult = await analyzeNewsCandidates({
        provider: settings.provider,
        model: settings.model,
        apiKey,
        topN: settings.topN,
        candidates,
      })
      analyses = analysisResult.items
      modelUsed = analysisResult.modelUsed
    } catch (error) {
      writeNewsLog('warn', 'LLM analysis failed, switching to rule-based fallback digest', {
        error: formatErrorMessage(error),
        requestedModel: settings.model,
      })
      analyses = buildFallbackAnalysis(candidates)
      usedFallback = true
      modelUsed = settings.model
    }

    const digestItems = mergeAnalysis(candidates, analyses, settings.topN)
    const digest = this.repository.saveDigest({
      digestDate,
      title: buildDigestTitle(digestDate),
      summaryMarkdown: buildDigestMarkdown(digestItems, usedFallback),
      items: digestItems.map((item) => ({
        source: item.source,
        url: item.url,
        publishedAt: item.publishedAt,
        originalLanguage: item.originalLanguage,
        title: item.title,
        summary: item.summary,
        titleZh: item.titleZh,
        summaryZh: item.summaryZh,
        alertTextZh: item.alertTextZh,
        category: item.category,
        marketImpact: item.marketImpact,
        marketBias: item.marketBias,
        ruleScore: item.ruleScore,
        llmScore: item.llmScore,
        finalScore: item.finalScore,
      })),
    })

    let finalDigest = digest
    if (settings.desktopNotificationsEnabled && !digest.notifiedAt) {
      showNewsDigestNotification(digest, this.getWindow(), () => this.openDigest())
      finalDigest = this.repository.markDigestNotified(digest.id, new Date().toISOString()) ?? digest
    }

    const completedAt = new Date().toISOString()
    this.repository.recordRunFinished({
      status: 'success',
      completedAt,
      errorMessage: null,
      modelUsed,
      usedFallback,
    })
    writeNewsLog('info', 'Finance digest run completed', {
      trigger,
      digestId: finalDigest.id,
      digestDate: finalDigest.digestDate,
      itemCount: finalDigest.items.length,
      modelUsed,
      usedFallback,
    })

    this.getWindow()?.webContents.send('news:digest-ready', { digestDate: finalDigest.digestDate, trigger })
    return finalDigest
    } catch (error) {
      const completedAt = new Date().toISOString()
      const errorMessage = formatErrorMessage(error)
      this.repository.recordRunFinished({
        status: 'error',
        completedAt,
        errorMessage,
        modelUsed,
        usedFallback,
      })
      writeNewsLog('error', 'Finance digest run failed', {
        trigger,
        error: errorMessage,
        modelUsed,
      })
      throw new Error(`财经热点抓取失败：${errorMessage}`)
    }
  }
}
