import { v4 as uuid } from 'uuid'
import { getDatabase, saveDatabase } from '../connection'
import type { Note } from '../../types'

export class NotesRepository {
  getAll(): Note[] {
    const db = getDatabase()
    const stmt = db.prepare(
      `SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC`
    )
    const results: Note[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Note)
    }
    stmt.free()
    return results
  }

  getById(id: string): Note | undefined {
    const db = getDatabase()
    const stmt = db.prepare(
      `SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL`
    )
    stmt.bind([id])
    let result: Note | undefined
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as Note
    }
    stmt.free()
    return result
  }

  create(data: { title?: string; content?: string }): Note {
    const db = getDatabase()
    const id = uuid()
    const now = new Date().toISOString()
    const title = data.title ?? ''
    const content = data.content ?? ''

    db.run(
      `INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [id, title, content, now, now]
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

    db.run(
      `UPDATE notes SET title = ?, content = ?, updated_at = ?, is_dirty = 1 WHERE id = ?`,
      [title, content, now, id]
    )
    saveDatabase()

    return this.getById(id)
  }

  delete(id: string): boolean {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.run(
      `UPDATE notes SET deleted_at = ?, is_dirty = 1 WHERE id = ?`,
      [now, id]
    )
    saveDatabase()
    return db.getRowsModified() > 0
  }

  search(query: string): Note[] {
    if (!query.trim()) return this.getAll()

    const db = getDatabase()
    const pattern = `%${query}%`
    const stmt = db.prepare(
      `SELECT * FROM notes
       WHERE deleted_at IS NULL
         AND (title LIKE ? OR content LIKE ?)
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    stmt.bind([pattern, pattern])
    const results: Note[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Note)
    }
    stmt.free()
    return results
  }

  getDirty(): Note[] {
    const db = getDatabase()
    const stmt = db.prepare(`SELECT * FROM notes WHERE is_dirty = 1`)
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
      `UPDATE notes SET is_dirty = 0, sync_version = ? WHERE id = ?`,
      [syncVersion, id]
    )
    saveDatabase()
  }
}
