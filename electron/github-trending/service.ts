import { net } from 'electron'
import { load } from 'cheerio'
import type {
  GithubTrendingPeriod,
  GithubTrendingProject,
  GithubTrendingResponse,
} from './types'

const CACHE_TTL_MS = 10 * 60 * 1000
const TRENDING_BASE_URL = 'https://github.com/trending'
const SEARCH_API_BASE_URL = 'https://api.github.com/search/repositories'
const VALID_PERIODS = new Set<GithubTrendingPeriod>(['daily', 'weekly', 'monthly'])
const REQUEST_TIMEOUT_MS = 15000
const TRENDING_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent': 'SecureNotes-GitHubTrending/1.0',
}
const SEARCH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'User-Agent': 'SecureNotes-GitHubTrending/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
}

interface HttpTextResponse {
  status: number
  body: string
}

interface GithubSearchRepository {
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  owner?: {
    login?: string
  }
  name: string
}

interface GithubSearchApiResponse {
  items?: GithubSearchRepository[]
}

function normalizeText(value: string | undefined | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function parseCount(value: string | undefined | null) {
  const digits = normalizeText(value).replace(/[^\d]/g, '')
  return digits ? Number.parseInt(digits, 10) : null
}

function buildTrendingUrl(period: GithubTrendingPeriod) {
  return `${TRENDING_BASE_URL}?since=${period}`
}

function getWindowLabel(period: GithubTrendingPeriod) {
  switch (period) {
    case 'daily':
      return '过去 24 小时'
    case 'weekly':
      return '过去 7 天'
    case 'monthly':
      return '过去 30 天'
    default:
      return '最近一段时间'
  }
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function buildSearchFallbackUrl(period: GithubTrendingPeriod) {
  const since = new Date()

  switch (period) {
    case 'daily':
      since.setDate(since.getDate() - 1)
      break
    case 'weekly':
      since.setDate(since.getDate() - 7)
      break
    case 'monthly':
      since.setDate(since.getDate() - 30)
      break
  }

  const query = `archived:false fork:false stars:>0 pushed:>=${formatDateOnly(since)}`
  return `${SEARCH_API_BASE_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`
}

function isOkStatus(status: number) {
  return status >= 200 && status < 300
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return String(error)
}

function createHttpError(sourceLabel: string, status: number) {
  if (status === 403 || status === 429) {
    return new Error(`${sourceLabel}请求频率受限，请稍后重试。`)
  }

  return new Error(`${sourceLabel}请求失败 (${status})`)
}

async function requestTextViaElectronNet(url: string, headers: Record<string, string>, timeoutMs: number) {
  return new Promise<HttpTextResponse>((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
    })

    let settled = false
    const finishResolve = (value: HttpTextResponse) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve(value)
    }
    const finishReject = (reason: unknown) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      reject(reason instanceof Error ? reason : new Error(String(reason)))
    }

    const timeout = setTimeout(() => {
      request.abort()
      finishReject(new Error('请求超时'))
    }, timeoutMs)

    for (const [key, value] of Object.entries(headers)) {
      request.setHeader(key, value)
    }

    request.on('response', (response) => {
      const chunks: Buffer[] = []

      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })

      response.on('end', () => {
        finishResolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })

      response.on('error', finishReject)
    })

    request.on('error', finishReject)
    request.end()
  })
}

async function requestTextViaNodeFetch(url: string, headers: Record<string, string>, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    })

    return {
      status: response.status,
      body: await response.text(),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function requestTextWithFallback(url: string, headers: Record<string, string>, timeoutMs: number) {
  const failures: string[] = []
  let lastResponse: HttpTextResponse | null = null

  for (const [label, requester] of [
    ['Electron net', requestTextViaElectronNet],
    ['Node fetch', requestTextViaNodeFetch],
  ] as const) {
    try {
      const response = await requester(url, headers, timeoutMs)

      if (isOkStatus(response.status)) {
        return response
      }

      lastResponse = response
      failures.push(`${label}: HTTP ${response.status}`)
    } catch (error) {
      failures.push(`${label}: ${normalizeErrorMessage(error)}`)
    }
  }

  if (lastResponse) {
    return lastResponse
  }

  throw new Error(failures.join(' | '))
}

export class GithubTrendingService {
  private cache = new Map<GithubTrendingPeriod, { expiresAt: number; response: GithubTrendingResponse }>()

  async getTrending(period: GithubTrendingPeriod, forceRefresh = false): Promise<GithubTrendingResponse> {
    if (!VALID_PERIODS.has(period)) {
      throw new Error('Unsupported GitHub trending period.')
    }

    const cached = this.cache.get(period)
    const now = Date.now()

    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.response
    }

    const sourceUrl = buildTrendingUrl(period)

    try {
      const response = await requestTextWithFallback(sourceUrl, TRENDING_HEADERS, REQUEST_TIMEOUT_MS)

      if (!isOkStatus(response.status)) {
        throw createHttpError('GitHub Trending 页面', response.status)
      }

      const html = response.body
      const items = this.parseTrendingProjects(html)

      if (items.length === 0) {
        throw new Error('未解析到 GitHub 热门项目，请稍后重试。')
      }

      const result: GithubTrendingResponse = {
        period,
        fetchedAt: new Date().toISOString(),
        sourceUrl,
        sourceKind: 'trending',
        sourceLabel: 'GitHub Trending',
        warning: null,
        items,
      }

      this.cache.set(period, {
        expiresAt: now + CACHE_TTL_MS,
        response: result,
      })

      return result
    } catch (error) {
      console.warn('[github-trending] trending request failed, falling back to search api:', error)

      try {
        const fallbackResponse = await this.getSearchFallback(period)

        this.cache.set(period, {
          expiresAt: now + CACHE_TTL_MS,
          response: fallbackResponse,
        })

        return fallbackResponse
      } catch (fallbackError) {
        console.warn('[github-trending] search fallback failed:', fallbackError)
        throw new Error('GitHub 热门项目暂时不可用，请稍后重试。')
      }
    }
  }

  private async getSearchFallback(period: GithubTrendingPeriod): Promise<GithubTrendingResponse> {
    const sourceUrl = buildSearchFallbackUrl(period)
    const response = await requestTextWithFallback(sourceUrl, SEARCH_HEADERS, REQUEST_TIMEOUT_MS)

    if (!isOkStatus(response.status)) {
      throw createHttpError('GitHub Search API', response.status)
    }

    const payload = JSON.parse(response.body) as GithubSearchApiResponse
    const items = (payload.items ?? []).slice(0, 10).map((project, index) => ({
      rank: index + 1,
      owner: project.owner?.login ?? project.full_name.split('/')[0] ?? 'unknown',
      name: project.name,
      repository: project.full_name,
      url: project.html_url,
      description: normalizeText(project.description) || null,
      language: normalizeText(project.language) || null,
      totalStars: project.stargazers_count,
      totalStarsLabel: new Intl.NumberFormat('en-US').format(project.stargazers_count),
      forks: project.forks_count,
      forksLabel: new Intl.NumberFormat('en-US').format(project.forks_count),
      periodStars: null,
      periodStarsLabel: `活跃于${getWindowLabel(period)}`,
    }))

    if (items.length === 0) {
      throw new Error('GitHub Search API 未返回可展示的项目。')
    }

    return {
      period,
      fetchedAt: new Date().toISOString(),
      sourceUrl,
      sourceKind: 'search',
      sourceLabel: 'GitHub Search API 近似结果',
      warning: `GitHub Trending 页面暂时不可达，已自动切换为备用数据源。当前结果按${getWindowLabel(period)}内有活跃更新的仓库并结合总 Star 排序。`,
      items,
    }
  }

  private parseTrendingProjects(html: string): GithubTrendingProject[] {
    const $ = load(html)
    const articles = $('article.Box-row').toArray().slice(0, 10)
    const projects: GithubTrendingProject[] = []

    for (const [index, article] of articles.entries()) {
      const item = $(article)
      const headingLink = item.find('h2 a, h1 a').first()
      const repoPath = normalizeText(headingLink.attr('href')).replace(/^\/+/, '').replace(/\s+/g, '')

      if (!repoPath.includes('/')) {
        continue
      }

      const [owner, name] = repoPath.split('/')
      const metricLinks = item.find('a.Link--muted').toArray()
      const starLink = metricLinks.find((element) => normalizeText($(element).attr('href')).includes('/stargazers'))
      const forkLink = metricLinks.find((element) => normalizeText($(element).attr('href')).includes('/forks'))
      const starText = starLink ? normalizeText($(starLink).text()) : null
      const forkText = forkLink ? normalizeText($(forkLink).text()) : null
      const periodStarsLabel =
        normalizeText(item.find('span.d-inline-block.float-sm-right').first().text()) ||
        normalizeText(item.find('span[class*="float-sm-right"]').first().text()) ||
        null

      projects.push({
        rank: index + 1,
        owner,
        name,
        repository: `${owner}/${name}`,
        url: `https://github.com/${repoPath}`,
        description: normalizeText(item.find('p').first().text()) || null,
        language: normalizeText(item.find('[itemprop="programmingLanguage"]').first().text()) || null,
        totalStars: parseCount(starText),
        totalStarsLabel: starText,
        forks: parseCount(forkText),
        forksLabel: forkText,
        periodStars: parseCount(periodStarsLabel),
        periodStarsLabel,
      })
    }

    return projects
  }
}