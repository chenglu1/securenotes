import type { NewsAnalysisItem, RankedNewsCandidate, NewsCandidate } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function computeRecencyScore(publishedAt: string): number {
  const published = Date.parse(publishedAt)
  if (Number.isNaN(published)) {
    return 30
  }

  const ageHours = Math.max(0, (Date.now() - published) / 3_600_000)
  return Math.round(clamp(100 - ageHours * 4.5, 8, 100))
}

export function rankNewsCandidates(candidates: NewsCandidate[], shortlistSize: number): RankedNewsCandidate[] {
  const seenUrls = new Set<string>()
  const seenTitles = new Set<string>()
  const deduped: NewsCandidate[] = []

  for (const candidate of [...candidates].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))) {
    if (!candidate.normalizedTitle || !candidate.normalizedUrl) {
      continue
    }

    if (seenUrls.has(candidate.normalizedUrl) || seenTitles.has(candidate.normalizedTitle)) {
      continue
    }

    seenUrls.add(candidate.normalizedUrl)
    seenTitles.add(candidate.normalizedTitle)
    deduped.push(candidate)
  }

  const clusterCounts = new Map<string, number>()
  for (const candidate of deduped) {
    clusterCounts.set(candidate.normalizedTitle, (clusterCounts.get(candidate.normalizedTitle) ?? 0) + 1)
  }

  return deduped
    .map((candidate) => {
      const clusterSize = clusterCounts.get(candidate.normalizedTitle) ?? 1
      const recencyScore = computeRecencyScore(candidate.publishedAt)
      const ruleScore = Math.round(recencyScore * 0.72 + candidate.sourceWeight + (clusterSize - 1) * 8)

      return {
        ...candidate,
        clusterSize,
        recencyScore,
        ruleScore,
      } satisfies RankedNewsCandidate
    })
    .sort((left, right) => {
      if (right.ruleScore !== left.ruleScore) {
        return right.ruleScore - left.ruleScore
      }

      return right.publishedAt.localeCompare(left.publishedAt)
    })
    .slice(0, shortlistSize)
}

function buildLocalSummary(candidate: RankedNewsCandidate): string {
  const summary = candidate.summary.trim()
  if (summary) {
    return summary.slice(0, 140)
  }

  return candidate.title.slice(0, 140)
}

export function buildFallbackNewsAnalysis(candidates: RankedNewsCandidate[]): NewsAnalysisItem[] {
  return candidates.map((candidate) => ({
    candidateId: candidate.id,
    include: true,
    heatScore: clamp(Math.round(candidate.ruleScore), 1, 100),
    category: 'other',
    marketImpact: candidate.ruleScore >= 75 ? 'high' : candidate.ruleScore >= 55 ? 'medium' : 'low',
    marketBias: 'mixed',
    titleZh: candidate.title,
    summaryZh: buildLocalSummary(candidate),
    alertTextZh: candidate.languageGuess === 'zh' ? candidate.title : `国际财经快讯：${candidate.title}`,
    reasonZh: '模型分析不可用，本次使用来源权重与发布时间的规则排序结果。',
  }))
}
