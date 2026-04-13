export type NewsAnalysisProvider = 'openrouter' | 'gemini'
export type NewsRunStatus = 'idle' | 'running' | 'success' | 'error'

export interface NewsSettings {
  enabled: boolean
  fetchTime: string
  topN: number
  provider: NewsAnalysisProvider
  model: string
  desktopNotificationsEnabled: boolean
  sources: string[]
}

export interface NewsRuntimeState {
  lastRunStatus: NewsRunStatus
  lastRunStartedAt: string | null
  lastRunCompletedAt: string | null
  lastSuccessfulRunAt: string | null
  lastRunError: string | null
  lastModelUsed: string | null
  lastUsedFallback: boolean
}

export interface NewsSettingsRecord extends NewsSettings, NewsRuntimeState {}

export interface NewsSettingsView extends NewsSettingsRecord {
  apiKeyConfigured: boolean
  apiKeyConfiguredByProvider: Record<NewsAnalysisProvider, boolean>
  logFilePath: string
}

export interface NewsSettingsInput extends NewsSettings {
  apiKey?: string
}

export interface NewsDigestItem {
  id: string
  source: string
  url: string
  publishedAt: string
  originalLanguage: string
  title: string
  summary: string
  titleZh: string
  summaryZh: string
  alertTextZh: string
  category: string
  marketImpact: string
  marketBias: string
  ruleScore: number
  llmScore: number
  finalScore: number
  createdAt: string
}

export interface NewsDigest {
  id: string
  digestDate: string
  title: string
  summaryMarkdown: string
  topCount: number
  notifiedAt: string | null
  createdAt: string
  updatedAt: string
  items: NewsDigestItem[]
}

export interface FinanceNewsSource {
  id: string
  label: string
  url: string
  weight: number
  maxItems: number
}

export interface NewsCandidate {
  id: string
  sourceId: string
  sourceLabel: string
  sourceWeight: number
  title: string
  summary: string
  url: string
  publishedAt: string
  languageGuess: string
  normalizedTitle: string
  normalizedUrl: string
}

export interface RankedNewsCandidate extends NewsCandidate {
  clusterSize: number
  recencyScore: number
  ruleScore: number
}

export interface NewsAnalysisItem {
  candidateId: string
  include: boolean
  heatScore: number
  category: string
  marketImpact: string
  marketBias: string
  titleZh: string
  summaryZh: string
  alertTextZh: string
  reasonZh: string
}

export interface NewsAnalysisResult {
  items: NewsAnalysisItem[]
  modelUsed: string
}

export interface NewsFetchSourceResult {
  sourceId: string
  sourceLabel: string
  url: string
  attempts: number
  success: boolean
  itemCount: number
  error: string | null
}

export interface NewsFetchResult {
  candidates: NewsCandidate[]
  sourceResults: NewsFetchSourceResult[]
}
