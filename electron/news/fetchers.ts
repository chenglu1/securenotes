import Parser from 'rss-parser'
import { v4 as uuid } from 'uuid'
import { getFinanceNewsSources } from './sources'
import { writeNewsLog } from './logger'
import type { FinanceNewsSource, NewsCandidate, NewsFetchResult, NewsFetchSourceResult } from './types'

const parser = new Parser({
  headers: {
    'User-Agent': 'SecureNotes/1.0 (+https://localhost)',
  },
  timeout: 15_000,
})

const MAX_FETCH_ATTEMPTS = 3
const FETCH_RETRY_DELAYS_MS = [0, 900, 2_100]

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return value.split('#')[0]?.split('?')[0] ?? value
  }
}

function normalizeTitle(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectLanguage(text: string): string {
  if (/[\u3400-\u9fff]/.test(text)) {
    return 'zh'
  }

  return 'en'
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

function pickSummary(item: Record<string, unknown>): string {
  const candidates = [
    item.contentSnippet,
    item.summary,
    item.content,
    item['content:encoded'],
    item.description,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return normalizeWhitespace(stripHtml(value)).slice(0, 420)
    }
  }

  return ''
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

function mapFeedItems(source: FinanceNewsSource, rawItems: unknown[]): NewsCandidate[] {
  return rawItems
    .map((rawItem) => {
      const item = rawItem as Record<string, unknown>
      const title = typeof item.title === 'string' ? normalizeWhitespace(item.title) : ''
      const url = typeof item.link === 'string' ? item.link.trim() : ''
      const publishedAt =
        toIsoDate(item.isoDate) ??
        toIsoDate(item.pubDate) ??
        new Date().toISOString()

      if (!title || !url) {
        return null
      }

      const summary = pickSummary(item)
      const normalizedUrl = normalizeUrl(url)
      return {
        id: uuid(),
        sourceId: source.id,
        sourceLabel: source.label,
        sourceWeight: source.weight,
        title,
        summary,
        url,
        publishedAt,
        languageGuess: detectLanguage(`${title} ${summary}`),
        normalizedTitle: normalizeTitle(title),
        normalizedUrl,
      } satisfies NewsCandidate
    })
    .filter((item): item is NewsCandidate => Boolean(item))
}

async function fetchSourceCandidates(source: FinanceNewsSource): Promise<NewsFetchSourceResult & { items: NewsCandidate[] }> {
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const retryDelay = FETCH_RETRY_DELAYS_MS[attempt - 1] ?? FETCH_RETRY_DELAYS_MS[FETCH_RETRY_DELAYS_MS.length - 1]
    if (retryDelay > 0) {
      await delay(retryDelay)
    }

    try {
      const feed = await parser.parseURL(source.url)
      const items = mapFeedItems(source, (feed.items ?? []).slice(0, source.maxItems))

      writeNewsLog('info', 'Fetched finance feed', {
        sourceId: source.id,
        attempt,
        itemCount: items.length,
      })

      return {
        sourceId: source.id,
        sourceLabel: source.label,
        url: source.url,
        attempts: attempt,
        success: true,
        itemCount: items.length,
        error: null,
        items,
      }
    } catch (error) {
      lastError = formatErrorMessage(error)
      writeNewsLog('warn', 'Finance feed fetch attempt failed', {
        sourceId: source.id,
        sourceLabel: source.label,
        attempt,
        error: lastError,
      })
    }
  }

  return {
    sourceId: source.id,
    sourceLabel: source.label,
    url: source.url,
    attempts: MAX_FETCH_ATTEMPTS,
    success: false,
    itemCount: 0,
    error: lastError,
    items: [],
  }
}

export async function fetchFinanceNewsCandidates(sourceIds?: string[]): Promise<NewsFetchResult> {
  const sources = getFinanceNewsSources(sourceIds)
  const sourceFetches = await Promise.all(sources.map((source) => fetchSourceCandidates(source)))
  const sourceResults: NewsFetchSourceResult[] = sourceFetches.map(({ items: _items, ...result }) => result)
  const candidates = sourceFetches.flatMap((result) => result.items)

  writeNewsLog('info', 'Completed finance feed fetch cycle', {
    sourceCount: sources.length,
    successCount: sourceResults.filter((item) => item.success).length,
    candidateCount: candidates.length,
  })

  return {
    candidates,
    sourceResults,
  }
}
