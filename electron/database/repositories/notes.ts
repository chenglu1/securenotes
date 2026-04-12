import { v4 as uuid } from 'uuid'
import { getDatabase, saveDatabase } from '../connection'
import type { Note, NoteSummary } from '../../types'
import { getAuthSession } from '../../secure-store'

const LOCAL_NOTE_SCOPE = '__local__'

export class NotesRepository {
  private getCurrentScope(): string {
    return getAuthSession()?.userId ?? LOCAL_NOTE_SCOPE
  }

  getSummaries(query?: string): NoteSummary[] {
    const scope = this.getCurrentScope()
    const db = getDatabase()
    const normalizedQuery = query?.trim()
    const summarySql = normalizedQuery
      ? `SELECT id, title, created_at, updated_at, deleted_at, sync_version, is_dirty
         FROM notes
         WHERE deleted_at IS NULL
           AND owner_user_id = ?
           AND title LIKE ?
         ORDER BY updated_at DESC
         LIMIT 50`
      : `SELECT id, title, created_at, updated_at, deleted_at, sync_version, is_dirty
         FROM notes
         WHERE deleted_at IS NULL AND owner_user_id = ?
         ORDER BY updated_at DESC`

    const stmt = db.prepare(summarySql)
    if (normalizedQuery) {
      const pattern = `%${normalizedQuery}%`
      stmt.bind([scope, pattern])
    } else {
      stmt.bind([scope])
    }

    const results: NoteSummary[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as NoteSummary)
    }
    stmt.free()
    return results
  }

  getById(id: string): Note | undefined {
    const scope = this.getCurrentScope()
    const db = getDatabase()
    const stmt = db.prepare(
      `SELECT * FROM notes WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
    )
    stmt.bind([id, scope])
    let result: Note | undefined
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as Note
    }
    stmt.free()
    return result
  }

  create(data: { title?: string; content?: string }): Note {
    const scope = this.getCurrentScope()
    const db = getDatabase()
    const id = uuid()
    const now = new Date().toISOString()
    const title = data.title ?? ''
    const content = data.content ?? ''

    db.run(
      `INSERT INTO notes (id, owner_user_id, title, content, created_at, updated_at, sync_version, is_dirty, last_synced_version)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [id, scope, title, content, now, now]
    )
    saveDatabase()

    return this.getById(id)!
  }

  update(id: string, data: { title?: string; content?: string }): Note | undefined {
    const db = getDatabase()
    const now = new Date().toISOString()
    const note = this.getById(id)
    if (!note) return undefined

    const title = data.title ?? note.title
    const content = data.content ?? note.content

    if (title === note.title && content === note.content) {
      return note
    }

    db.run(
      `UPDATE notes SET title = ?, content = ?, updated_at = ?, is_dirty = 1 WHERE id = ? AND owner_user_id = ?`,
      [title, content, now, id, this.getCurrentScope()]
    )
    saveDatabase()

    return this.getById(id)
  }

  delete(id: string): boolean {
    const db = getDatabase()
    const now = new Date().toISOString()
    const note = this.getById(id)

    if (!note) return false

    if ((note.sync_version ?? 0) === 0 && (note.last_synced_version ?? 0) === 0) {
      db.run(
        `DELETE FROM notes WHERE id = ? AND owner_user_id = ?`,
        [id, this.getCurrentScope()]
      )
      saveDatabase()
      return db.getRowsModified() > 0
    }

    db.run(
      `UPDATE notes SET deleted_at = ?, is_dirty = 1 WHERE id = ? AND owner_user_id = ?`,
      [now, id, this.getCurrentScope()]
    )
    saveDatabase()
    return db.getRowsModified() > 0
  }

  getDirty(): Note[] {
    const scope = this.getCurrentScope()
    const db = getDatabase()
    const stmt = db.prepare(`SELECT * FROM notes WHERE is_dirty = 1 AND owner_user_id = ?`)
    stmt.bind([scope])
    const results: Note[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Note)
    }
    stmt.free()
    return results
  }

  markSynced(id: string, syncVersion: number): void {
    const db = getDatabase()
    db.run(
      `UPDATE notes
       SET is_dirty = 0,
           sync_version = ?,
           last_synced_version = ?,
           last_synced_title = title,
           last_synced_content = content,
           last_synced_deleted_at = deleted_at
       WHERE id = ? AND owner_user_id = ?`,
      [syncVersion, syncVersion, id, this.getCurrentScope()]
    )
    saveDatabase()
  }

  claimLocalNotes(userId: string): number {
    const db = getDatabase()
    db.run(
      `UPDATE notes SET owner_user_id = ? WHERE owner_user_id = ?`,
      [userId, LOCAL_NOTE_SCOPE]
    )
    saveDatabase()
    return db.getRowsModified()
  }

  /**
   * Upsert a note from cloud sync (insert or update based on sync version)
   */
  upsertFromCloud(cloudNote: {
    id: string
    title: string
    content: string
    syncVersion: number
    createdAt: string
    updatedAt: string
    deletedAt?: string | null
  }, options?: { force?: boolean }): Note | undefined {
    const scope = this.getCurrentScope()
    const db = getDatabase()
    const force = options?.force === true
    
    // 查询笔记（包括已删除的）
    const stmt = db.prepare(`SELECT * FROM notes WHERE id = ? AND owner_user_id = ?`)
    stmt.bind([cloudNote.id, scope])
    let localNote: Note | undefined
    if (stmt.step()) {
      localNote = stmt.getAsObject() as unknown as Note
    }
    stmt.free()

    // 如果本地笔记是脏数据（有未同步的修改），不要覆盖
    if (localNote && localNote.is_dirty === 1 && !force) {
      console.log(`⏭️ Skipping note ${cloudNote.id} - local changes not synced yet`)
      return localNote
    }

    if (!localNote) {
      // Insert new note from cloud
      db.run(
        `INSERT INTO notes (
           id,
           owner_user_id,
           title,
           content,
           sync_version,
           is_dirty,
           created_at,
           updated_at,
           deleted_at,
           last_synced_title,
           last_synced_content,
           last_synced_deleted_at,
           last_synced_version
         )
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cloudNote.id,
          scope,
          cloudNote.title,
          cloudNote.content,
          cloudNote.syncVersion,
          cloudNote.createdAt,
          cloudNote.updatedAt,
          cloudNote.deletedAt || null,
          cloudNote.title,
          cloudNote.content,
          cloudNote.deletedAt || null,
          cloudNote.syncVersion,
        ]
      )
    } else {
      // Update only if cloud version is strictly newer
      if (force || cloudNote.syncVersion > (localNote.sync_version || 0)) {
        db.run(
          `UPDATE notes SET 
            title = ?,
            content = ?,
            sync_version = ?,
            last_synced_version = ?,
            last_synced_title = ?,
            last_synced_content = ?,
            is_dirty = 0,
            updated_at = ?,
            deleted_at = ?,
            last_synced_deleted_at = ?
           WHERE id = ? AND owner_user_id = ?`,
          [
            cloudNote.title,
            cloudNote.content,
            cloudNote.syncVersion,
            cloudNote.syncVersion,
            cloudNote.title,
            cloudNote.content,
            cloudNote.updatedAt,
            cloudNote.deletedAt || null,
            cloudNote.deletedAt || null,
            cloudNote.id,
            scope,
          ]
        )
      }
    }

    saveDatabase()
    
    // 返回更新后的笔记（可能是 null 如果已删除）
    return this.getById(cloudNote.id)
  }
}
