export type GithubTrendingPeriod = 'daily' | 'weekly' | 'monthly'

export type GithubTrendingSourceKind = 'trending' | 'search'

export interface GithubTrendingProject {
  rank: number
  owner: string
  name: string
  repository: string
  url: string
  description: string | null
  language: string | null
  totalStars: number | null
  totalStarsLabel: string | null
  forks: number | null
  forksLabel: string | null
  periodStars: number | null
  periodStarsLabel: string | null
}

export interface GithubTrendingResponse {
  period: GithubTrendingPeriod
  fetchedAt: string
  sourceUrl: string
  sourceKind: GithubTrendingSourceKind
  sourceLabel: string
  warning: string | null
  items: GithubTrendingProject[]
}