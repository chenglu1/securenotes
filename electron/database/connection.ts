import initSqlJs, { Database } from 'sql.js'
import { join } from 'path'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { getAuthSession } from '../secure-store'

const LOCAL_NOTE_SCOPE = '__local__'

let db: Database | null = null
let dbPath: string | null = null

export async function initDatabase(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs()

  dbPath = join(app.getPath('userData'), 'securenotes.db')

  // Ensure the directory exists
  const dir = join(app.getPath('userData'))
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // Enable WAL mode and foreign keys
  db.run('PRAGMA foreign_keys = ON')

  runMigrations(db)
  saveDatabase() // Persist after migrations

  return db
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

function runMigrations(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id            TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL DEFAULT '${LOCAL_NOTE_SCOPE}',
      title         TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at    TEXT,
      sync_version  INTEGER DEFAULT 0,
      is_dirty      INTEGER DEFAULT 1,
      last_synced_title TEXT,
      last_synced_content TEXT,
      last_synced_deleted_at TEXT,
      last_synced_version INTEGER DEFAULT 0
    );
  `)

  if (!hasColumn(db, 'notes', 'owner_user_id')) {
    db.run(
      `ALTER TABLE notes ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT '${LOCAL_NOTE_SCOPE}';`
    )
  }

  if (!hasColumn(db, 'notes', 'last_synced_title')) {
    db.run(`ALTER TABLE notes ADD COLUMN last_synced_title TEXT;`)
  }

  if (!hasColumn(db, 'notes', 'last_synced_content')) {
    db.run(`ALTER TABLE notes ADD COLUMN last_synced_content TEXT;`)
  }

  if (!hasColumn(db, 'notes', 'last_synced_deleted_at')) {
    db.run(`ALTER TABLE notes ADD COLUMN last_synced_deleted_at TEXT;`)
  }

  if (!hasColumn(db, 'notes', 'last_synced_version')) {
    db.run(`ALTER TABLE notes ADD COLUMN last_synced_version INTEGER DEFAULT 0;`)
  }

  db.run(`CREATE INDEX IF NOT EXISTS idx_notes_owner_user_id ON notes(owner_user_id);`)

  const currentUserId = getAuthSession()?.userId
  if (currentUserId) {
    db.run(
      `UPDATE notes SET owner_user_id = ? WHERE owner_user_id IS NULL OR owner_user_id = ?`,
      [currentUserId, LOCAL_NOTE_SCOPE]
    )
  } else {
    db.run(
      `UPDATE notes SET owner_user_id = ? WHERE owner_user_id IS NULL`,
      [LOCAL_NOTE_SCOPE]
    )
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1'
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
      tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id          TEXT PRIMARY KEY,
      note_id     TEXT REFERENCES notes(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      size_bytes  INTEGER NOT NULL,
      file_path   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS news_settings (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      fetch_time TEXT NOT NULL DEFAULT '08:30',
      top_n INTEGER NOT NULL DEFAULT 10,
      provider TEXT NOT NULL DEFAULT 'openrouter',
      model TEXT NOT NULL DEFAULT 'minimax/minimax-m2.5:free',
      desktop_notifications_enabled INTEGER NOT NULL DEFAULT 1,
      sources_json TEXT NOT NULL DEFAULT '[]',
      last_run_status TEXT NOT NULL DEFAULT 'idle',
      last_run_started_at TEXT,
      last_run_completed_at TEXT,
      last_successful_run_at TEXT,
      last_run_error TEXT,
      last_model_used TEXT,
      last_used_fallback INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  if (!hasColumn(db, 'news_settings', 'last_run_status')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_run_status TEXT NOT NULL DEFAULT 'idle';`)
  }

  if (!hasColumn(db, 'news_settings', 'last_run_started_at')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_run_started_at TEXT;`)
  }

  if (!hasColumn(db, 'news_settings', 'last_run_completed_at')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_run_completed_at TEXT;`)
  }

  if (!hasColumn(db, 'news_settings', 'last_successful_run_at')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_successful_run_at TEXT;`)
  }

  if (!hasColumn(db, 'news_settings', 'last_run_error')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_run_error TEXT;`)
  }

  if (!hasColumn(db, 'news_settings', 'last_model_used')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_model_used TEXT;`)
  }

  if (!hasColumn(db, 'news_settings', 'last_used_fallback')) {
    db.run(`ALTER TABLE news_settings ADD COLUMN last_used_fallback INTEGER NOT NULL DEFAULT 0;`)
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS news_digest (
      id TEXT PRIMARY KEY,
      digest_date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary_markdown TEXT NOT NULL DEFAULT '',
      top_count INTEGER NOT NULL DEFAULT 0,
      notified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS news_digest_items (
      id TEXT PRIMARY KEY,
      digest_id TEXT NOT NULL REFERENCES news_digest(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      published_at TEXT NOT NULL,
      original_language TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      title_zh TEXT NOT NULL,
      summary_zh TEXT NOT NULL,
      alert_text_zh TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      market_impact TEXT NOT NULL DEFAULT 'medium',
      market_bias TEXT NOT NULL DEFAULT 'mixed',
      rule_score REAL NOT NULL DEFAULT 0,
      llm_score REAL NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_news_digest_date ON news_digest(digest_date);`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_news_digest_items_digest_id ON news_digest_items(digest_id);`)
}

function hasColumn(db: Database, tableName: string, columnName: string): boolean {
  const result = db.exec(`PRAGMA table_info(${tableName});`)
  if (result.length === 0) {
    return false
  }

  const nameIndex = result[0].columns.indexOf('name')
  if (nameIndex === -1) {
    return false
  }

  return result[0].values.some((row) => row[nameIndex] === columnName)
}

export function closeDatabase() {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}
