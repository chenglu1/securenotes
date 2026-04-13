import { writeNewsLog } from './logger'
import { buildFallbackNewsAnalysis } from './scoring'
import type { NewsAnalysisItem, NewsAnalysisProvider, NewsAnalysisResult, RankedNewsCandidate } from './types'

const DEFAULT_OPENROUTER_MODEL = 'minimax/minimax-m2.5:free'
const OPENROUTER_FALLBACK_MODELS = [
  DEFAULT_OPENROUTER_MODEL,
  'z-ai/glm-4.5-air:free',
  'google/gemma-3-27b-it:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
]
const MODEL_REQUEST_TIMEOUT_MS = 45_000
const MAX_MODEL_REQUEST_ATTEMPTS = 2

interface AnalyzeCandidatesInput {
  provider: NewsAnalysisProvider
  model: string
  apiKey: string
  topN: number
  candidates: RankedNewsCandidate[]
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>
    }
  }>
  error?: {
    message?: string
  }
}

class OpenRouterRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'OpenRouterRequestError'
  }
}

function buildPrompt(topN: number, candidates: RankedNewsCandidate[]): string {
  const payload = candidates.map((candidate) => ({
    candidateId: candidate.id,
    source: candidate.sourceLabel,
    publishedAt: candidate.publishedAt,
    language: candidate.languageGuess,
    title: candidate.title,
    summary: candidate.summary,
    ruleScore: candidate.ruleScore,
  }))

  return [
    '你是一个财经新闻分析助手。',
    `请从候选新闻中选出最值得进入今日前 ${topN} 条热点的新闻，并输出严格 JSON。`,
    '要求：',
    '1. 只能基于提供的标题、摘要、来源和时间分析。',
    '2. 不得补充外部事实，不得编造数据。',
    '3. 若原文不是中文，翻译成自然中文。',
    '4. 输出字段必须包含：candidateId, include, heatScore, category, marketImpact, marketBias, titleZh, summaryZh, alertTextZh, reasonZh。',
    '5. include 为 true 表示建议入选今日热点；heatScore 范围为 0 到 100。',
    '6. titleZh 和 summaryZh 需要是自然、简洁、财经语境准确的中文。',
    '7. alertTextZh 适合桌面提醒，长度控制在 36 个中文字符左右。',
    '8. 最终输出必须是 JSON 对象，格式如下：{"items":[...]}。不要输出 JSON 之外的任何说明。',
    '',
    '候选新闻如下：',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return trimmed
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return String(error)
}

function extractMessageContent(content: string | Array<{ text?: string; type?: string }> | undefined): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim()
  }

  return ''
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenRouterRequestError) {
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(error.status)
  }

  if (!(error instanceof Error)) {
    return false
  }

  return /timeout|network|fetch failed|socket/i.test(error.message)
}

function normalizeAnalysisItems(value: unknown): NewsAnalysisItem[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) {
    throw new Error('Model response does not contain an items array.')
  }

  return (value as { items: unknown[] }).items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const row = item as Record<string, unknown>
      const candidateId = typeof row.candidateId === 'string' ? row.candidateId : null
      if (!candidateId) {
        return null
      }

      const heatScore = typeof row.heatScore === 'number' && Number.isFinite(row.heatScore)
        ? Math.max(0, Math.min(100, Math.round(row.heatScore)))
        : 0

      const titleZh = typeof row.titleZh === 'string' ? row.titleZh.trim() : ''
      const summaryZh = typeof row.summaryZh === 'string' ? row.summaryZh.trim() : ''
      const alertTextZh = typeof row.alertTextZh === 'string' ? row.alertTextZh.trim() : ''

      if (!titleZh || !summaryZh) {
        return null
      }

      return {
        candidateId,
        include: row.include !== false,
        heatScore,
        category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'other',
        marketImpact:
          typeof row.marketImpact === 'string' && row.marketImpact.trim() ? row.marketImpact.trim() : 'medium',
        marketBias:
          typeof row.marketBias === 'string' && row.marketBias.trim() ? row.marketBias.trim() : 'mixed',
        titleZh,
        summaryZh,
        alertTextZh: alertTextZh || titleZh,
        reasonZh: typeof row.reasonZh === 'string' && row.reasonZh.trim() ? row.reasonZh.trim() : '基于候选新闻内容生成。',
      } satisfies NewsAnalysisItem
    })
    .filter((item): item is NewsAnalysisItem => Boolean(item))
}

async function analyzeWithOpenRouter(input: AnalyzeCandidatesInput): Promise<NewsAnalysisItem[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MODEL_REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost/securenotes',
        'X-Title': 'SecureNotes Finance Digest',
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        max_tokens: 2200,
        messages: [
          {
            role: 'system',
            content: '你是一个严谨的财经新闻分析助手，必须输出严格 JSON。',
          },
          {
            role: 'user',
            content: buildPrompt(input.topN, input.candidates),
          },
        ],
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OpenRouterRequestError('OpenRouter request timed out.', 408)
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }

  const payload = (await response.json()) as OpenRouterChatCompletionResponse
  if (!response.ok) {
    throw new OpenRouterRequestError(payload.error?.message || 'OpenRouter request failed.', response.status)
  }

  const content = extractMessageContent(payload.choices?.[0]?.message?.content)
  if (!content) {
    throw new Error('OpenRouter response is empty.')
  }

  const parsed = JSON.parse(extractJsonObject(content)) as unknown
  return normalizeAnalysisItems(parsed)
}

async function analyzeWithOpenRouterRetries(input: AnalyzeCandidatesInput): Promise<NewsAnalysisItem[]> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_MODEL_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await analyzeWithOpenRouter(input)
    } catch (error) {
      lastError = error
      const retryable = isRetryableError(error)

      writeNewsLog(retryable ? 'warn' : 'error', 'OpenRouter model attempt failed', {
        model: input.model,
        attempt,
        retryable,
        error: formatErrorMessage(error),
      })

      if (!retryable || attempt >= MAX_MODEL_REQUEST_ATTEMPTS) {
        throw error
      }

      await delay(900 * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed.')
}

function buildModelAttemptList(model: string): string[] {
  const preferredModel = model.trim() || DEFAULT_OPENROUTER_MODEL
  return [preferredModel, ...OPENROUTER_FALLBACK_MODELS].filter((value, index, list) => value && list.indexOf(value) === index)
}

export async function analyzeNewsCandidates(input: AnalyzeCandidatesInput): Promise<NewsAnalysisResult> {
  if (input.provider !== 'openrouter') {
    throw new Error(`Unsupported news analysis provider: ${input.provider}`)
  }

  const attemptedModels: string[] = []
  let lastError: unknown = null

  for (const model of buildModelAttemptList(input.model)) {
    attemptedModels.push(model)

    try {
      const analyses = await analyzeWithOpenRouterRetries({
        ...input,
        model,
      })

      if (model !== input.model) {
        writeNewsLog('warn', 'Switched to fallback finance digest model', {
          requestedModel: input.model,
          modelUsed: model,
        })
      }

      return {
        items: analyses,
        modelUsed: model,
      }
    } catch (error) {
      lastError = error

      const detail = formatErrorMessage(error)
      if (error instanceof OpenRouterRequestError) {
        writeNewsLog('warn', 'Finance digest model failed', {
          model,
          status: error.status,
          error: detail,
        })
      } else {
        writeNewsLog('warn', 'Finance digest model failed', {
          model,
          error: detail,
        })
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : 'Unknown OpenRouter error.'
  throw new Error(`All OpenRouter model attempts failed (${attemptedModels.join(', ')}): ${reason}`)
}

export function buildFallbackAnalysis(candidates: RankedNewsCandidate[]): NewsAnalysisItem[] {
  return buildFallbackNewsAnalysis(candidates)
}
