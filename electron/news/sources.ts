import type { FinanceNewsSource } from './types'

export const FINANCE_NEWS_SOURCES: FinanceNewsSource[] = [
  {
    id: 'cnbc-top-news',
    label: 'CNBC Top News',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    weight: 14,
    maxItems: 18,
  },
  {
    id: 'cnbc-economy',
    label: 'CNBC Economy',
    url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    weight: 12,
    maxItems: 18,
  },
  {
    id: 'cnbc-finance',
    label: 'CNBC Finance',
    url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',
    weight: 12,
    maxItems: 18,
  },
  {
    id: 'marketwatch-topstories',
    label: 'MarketWatch Top Stories',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    weight: 11,
    maxItems: 18,
  },
]

export const DEFAULT_FINANCE_NEWS_SOURCE_IDS = [
  'cnbc-top-news',
  'cnbc-economy',
  'marketwatch-topstories',
]

export function getFinanceNewsSources(sourceIds?: string[]): FinanceNewsSource[] {
  const ids = Array.isArray(sourceIds) && sourceIds.length > 0 ? sourceIds : DEFAULT_FINANCE_NEWS_SOURCE_IDS
  const selected = FINANCE_NEWS_SOURCES.filter((source) => ids.includes(source.id))
  return selected.length > 0 ? selected : FINANCE_NEWS_SOURCES.filter((source) => DEFAULT_FINANCE_NEWS_SOURCE_IDS.includes(source.id))
}
