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

  db.run(`
    UPDATE notes
    SET
      last_synced_title = title,
      last_synced_content = content,
      last_synced_deleted_at = deleted_at,
      last_synced_version = COALESCE(sync_version, 0)
    WHERE is_dirty = 0 AND COALESCE(sync_version, 0) > 0 AND COALESCE(last_synced_version, 0) = 0;
  `)

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
