import { v4 as uuid } from 'uuid'
import { getDatabase, saveDatabase } from '../connection'
import { DEFAULT_FINANCE_NEWS_SOURCE_IDS } from '../../news/sources'
import type { NewsDigest, NewsDigestItem, NewsSettings, NewsSettingsRecord, NewsRunStatus } from '../../news/types'

interface NewsSettingsRow {
  id: string
  enabled: number
  fetch_time: string
  top_n: number
  provider: string
  model: string
  desktop_notifications_enabled: number
  sources_json: string
  last_run_status: string
  last_run_started_at: string | null
  last_run_completed_at: string | null
  last_successful_run_at: string | null
  last_run_error: string | null
  last_model_used: string | null
  last_used_fallback: number
  created_at: string
  updated_at: string
}

interface NewsDigestRow {
  id: string
  digest_date: string
  title: string
  summary_markdown: string
  top_count: number
  notified_at: string | null
  created_at: string
  updated_at: string
}

interface NewsDigestItemInput extends Omit<NewsDigestItem, 'id' | 'createdAt'> {}

const NEWS_SETTINGS_ID = 'default'
const LEGACY_DEFAULT_MODEL = 'z-ai/glm-4.5-air:free'

const DEFAULT_SETTINGS: NewsSettings = {
  enabled: true,
  fetchTime: '08:30',
  topN: 10,
  provider: 'openrouter',
  model: 'minimax/minimax-m2.5:free',
  desktopNotificationsEnabled: true,
  sources: DEFAULT_FINANCE_NEWS_SOURCE_IDS,
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function parseSources(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : DEFAULT_FINANCE_NEWS_SOURCE_IDS
  } catch {
    return DEFAULT_FINANCE_NEWS_SOURCE_IDS
  }
}

function mapSettingsRow(row: NewsSettingsRow): NewsSettingsRecord {
  return {
    enabled: row.enabled === 1,
    fetchTime: row.fetch_time,
    topN: row.top_n,
    provider: row.provider === 'openrouter' ? 'openrouter' : 'openrouter',
    model: row.model === LEGACY_DEFAULT_MODEL ? DEFAULT_SETTINGS.model : row.model,
    desktopNotificationsEnabled: row.desktop_notifications_enabled === 1,
    sources: parseSources(row.sources_json),
    lastRunStatus: ['idle', 'running', 'success', 'error'].includes(row.last_run_status) ? row.last_run_status as NewsRunStatus : 'idle',
    lastRunStartedAt: row.last_run_started_at,
    lastRunCompletedAt: row.last_run_completed_at,
    lastSuccessfulRunAt: row.last_successful_run_at,
    lastRunError: row.last_run_error,
    lastModelUsed: row.last_model_used,
    lastUsedFallback: row.last_used_fallback === 1,
  }
}

function mapDigestItemRow(row: Record<string, unknown>): NewsDigestItem {
  return {
    id: String(row.id ?? ''),
    source: String(row.source ?? ''),
    url: String(row.url ?? ''),
    publishedAt: String(row.published_at ?? ''),
    originalLanguage: String(row.original_language ?? ''),
    title: String(row.title ?? ''),
    summary: String(row.summary ?? ''),
    titleZh: String(row.title_zh ?? ''),
    summaryZh: String(row.summary_zh ?? ''),
    alertTextZh: String(row.alert_text_zh ?? ''),
    category: String(row.category ?? 'other'),
    marketImpact: String(row.market_impact ?? 'medium'),
    marketBias: String(row.market_bias ?? 'mixed'),
    ruleScore: Number(row.rule_score ?? 0),
    llmScore: Number(row.llm_score ?? 0),
    finalScore: Number(row.final_score ?? 0),
    createdAt: String(row.created_at ?? ''),
  }
}

export class NewsRepository {
  private ensureSettingsRow(): NewsSettingsRow {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM news_settings WHERE id = ? LIMIT 1')
    stmt.bind([NEWS_SETTINGS_ID])
    let row: NewsSettingsRow | null = null
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as NewsSettingsRow
    }
    stmt.free()

    if (row) {
      return row
    }

    const now = nowIsoString()
    db.run(
      `INSERT INTO news_settings (
        id,
        enabled,
        fetch_time,
        top_n,
        provider,
        model,
        desktop_notifications_enabled,
        sources_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        NEWS_SETTINGS_ID,
        DEFAULT_SETTINGS.enabled ? 1 : 0,
        DEFAULT_SETTINGS.fetchTime,
        DEFAULT_SETTINGS.topN,
        DEFAULT_SETTINGS.provider,
        DEFAULT_SETTINGS.model,
        DEFAULT_SETTINGS.desktopNotificationsEnabled ? 1 : 0,
        JSON.stringify(DEFAULT_SETTINGS.sources),
        now,
        now,
      ],
    )
    saveDatabase()

    return {
      id: NEWS_SETTINGS_ID,
      enabled: DEFAULT_SETTINGS.enabled ? 1 : 0,
      fetch_time: DEFAULT_SETTINGS.fetchTime,
      top_n: DEFAULT_SETTINGS.topN,
      provider: DEFAULT_SETTINGS.provider,
      model: DEFAULT_SETTINGS.model,
      desktop_notifications_enabled: DEFAULT_SETTINGS.desktopNotificationsEnabled ? 1 : 0,
      sources_json: JSON.stringify(DEFAULT_SETTINGS.sources),
      last_run_status: 'idle',
      last_run_started_at: null,
      last_run_completed_at: null,
      last_successful_run_at: null,
      last_run_error: null,
      last_model_used: null,
      last_used_fallback: 0,
      created_at: now,
      updated_at: now,
    }
  }

  getSettings(): NewsSettingsRecord {
    return mapSettingsRow(this.ensureSettingsRow())
  }

  saveSettings(settings: NewsSettings): NewsSettingsRecord {
    const db = getDatabase()
    const now = nowIsoString()
    this.ensureSettingsRow()
    db.run(
      `UPDATE news_settings
       SET enabled = ?,
           fetch_time = ?,
           top_n = ?,
           provider = ?,
           model = ?,
           desktop_notifications_enabled = ?,
           sources_json = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        settings.enabled ? 1 : 0,
        settings.fetchTime,
        settings.topN,
        settings.provider,
        settings.model,
        settings.desktopNotificationsEnabled ? 1 : 0,
        JSON.stringify(settings.sources),
        now,
        NEWS_SETTINGS_ID,
      ],
    )
    saveDatabase()
    return this.getSettings()
  }

  recordRunStarted(startedAt: string): NewsSettingsRecord {
    const db = getDatabase()
    const now = nowIsoString()
    this.ensureSettingsRow()
    db.run(
      `UPDATE news_settings
       SET last_run_status = ?,
           last_run_started_at = ?,
           last_run_error = NULL,
           updated_at = ?
       WHERE id = ?`,
      ['running', startedAt, now, NEWS_SETTINGS_ID],
    )
    saveDatabase()
    return this.getSettings()
  }

  recordRunFinished(input: {
    status: Extract<NewsRunStatus, 'success' | 'error'>
    completedAt: string
    errorMessage?: string | null
    modelUsed?: string | null
    usedFallback: boolean
  }): NewsSettingsRecord {
    const db = getDatabase()
    const now = nowIsoString()
    const current = this.getSettings()
    const nextSuccessfulRunAt = input.status === 'success' ? input.completedAt : current.lastSuccessfulRunAt

    this.ensureSettingsRow()
    db.run(
      `UPDATE news_settings
       SET last_run_status = ?,
           last_run_completed_at = ?,
           last_successful_run_at = ?,
           last_run_error = ?,
           last_model_used = ?,
           last_used_fallback = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        input.status,
        input.completedAt,
        nextSuccessfulRunAt,
        input.errorMessage ?? null,
        input.modelUsed ?? null,
        input.usedFallback ? 1 : 0,
        now,
        NEWS_SETTINGS_ID,
      ],
    )
    saveDatabase()
    return this.getSettings()
  }

  getLatestDigest(): NewsDigest | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM news_digest ORDER BY digest_date DESC, updated_at DESC LIMIT 1')
    let row: NewsDigestRow | null = null
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as NewsDigestRow
    }
    stmt.free()

    if (!row) {
      return null
    }

    return this.getDigestById(row.id)
  }

  getDigestByDate(digestDate: string): NewsDigest | null {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM news_digest WHERE digest_date = ? LIMIT 1')
    stmt.bind([digestDate])
    let row: NewsDigestRow | null = null
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as NewsDigestRow
    }
    stmt.free()

    return row ? this.getDigestById(row.id) : null
  }

  private getDigestById(id: string): NewsDigest | null {
    const db = getDatabase()
    const digestStmt = db.prepare('SELECT * FROM news_digest WHERE id = ? LIMIT 1')
    digestStmt.bind([id])
    let digestRow: NewsDigestRow | null = null
    if (digestStmt.step()) {
      digestRow = digestStmt.getAsObject() as unknown as NewsDigestRow
    }
    digestStmt.free()

    if (!digestRow) {
      return null
    }

    const itemStmt = db.prepare(
      `SELECT * FROM news_digest_items
       WHERE digest_id = ?
       ORDER BY final_score DESC, published_at DESC, created_at ASC`,
    )
    itemStmt.bind([id])
    const items: NewsDigestItem[] = []
    while (itemStmt.step()) {
      items.push(mapDigestItemRow(itemStmt.getAsObject() as Record<string, unknown>))
    }
    itemStmt.free()

    return {
      id: digestRow.id,
      digestDate: digestRow.digest_date,
      title: digestRow.title,
      summaryMarkdown: digestRow.summary_markdown,
      topCount: digestRow.top_count,
      notifiedAt: digestRow.notified_at,
      createdAt: digestRow.created_at,
      updatedAt: digestRow.updated_at,
      items,
    }
  }

  saveDigest(input: {
    digestDate: string
    title: string
    summaryMarkdown: string
    items: NewsDigestItemInput[]
  }): NewsDigest {
    const db = getDatabase()
    const now = nowIsoString()
    const existing = this.getDigestByDate(input.digestDate)
    const digestId = existing?.id ?? uuid()

    if (existing) {
      db.run(
        `UPDATE news_digest
         SET title = ?, summary_markdown = ?, top_count = ?, updated_at = ?
         WHERE id = ?`,
        [input.title, input.summaryMarkdown, input.items.length, now, digestId],
      )
      db.run('DELETE FROM news_digest_items WHERE digest_id = ?', [digestId])
    } else {
      db.run(
        `INSERT INTO news_digest (
          id,
          digest_date,
          title,
          summary_markdown,
          top_count,
          notified_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        [digestId, input.digestDate, input.title, input.summaryMarkdown, input.items.length, now, now],
      )
    }

    for (const item of input.items) {
      db.run(
        `INSERT INTO news_digest_items (
          id,
          digest_id,
          source,
          url,
          published_at,
          original_language,
          title,
          summary,
          title_zh,
          summary_zh,
          alert_text_zh,
          category,
          market_impact,
          market_bias,
          rule_score,
          llm_score,
          final_score,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          digestId,
          item.source,
          item.url,
          item.publishedAt,
          item.originalLanguage,
          item.title,
          item.summary,
          item.titleZh,
          item.summaryZh,
          item.alertTextZh,
          item.category,
          item.marketImpact,
          item.marketBias,
          item.ruleScore,
          item.llmScore,
          item.finalScore,
          now,
        ],
      )
    }

    saveDatabase()
    return this.getDigestById(digestId)!
  }

  markDigestNotified(id: string, notifiedAt: string): NewsDigest | null {
    const db = getDatabase()
    db.run('UPDATE news_digest SET notified_at = ?, updated_at = ? WHERE id = ?', [notifiedAt, nowIsoString(), id])
    saveDatabase()
    return this.getDigestById(id)
  }
}
