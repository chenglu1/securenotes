import { v4 as uuid } from 'uuid'
import { getDatabase, saveDatabase } from '../connection'
import type { Tag } from '../../types'

export class TagsRepository {
  getAll(): Tag[] {
    const db = getDatabase()
    const stmt = db.prepare(`SELECT * FROM tags ORDER BY name`)
    const results: Tag[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Tag)
    }
    stmt.free()
    return results
  }

  create(data: { name: string; color?: string }): Tag {
    const db = getDatabase()
    const id = uuid()
    const color = data.color ?? '#6366f1'
    db.run(`INSERT INTO tags (id, name, color) VALUES (?, ?, ?)`, [
      id,
      data.name,
      color,
    ])
    saveDatabase()
    return { id, name: data.name, color }
  }

  delete(id: string): boolean {
    const db = getDatabase()
    db.run(`DELETE FROM tags WHERE id = ?`, [id])
    saveDatabase()
    return db.getRowsModified() > 0
  }

  addToNote(noteId: string, tagId: string): void {
    const db = getDatabase()
    db.run(
      `INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)`,
      [noteId, tagId]
    )
    saveDatabase()
  }

  removeFromNote(noteId: string, tagId: string): void {
    const db = getDatabase()
    db.run(`DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?`, [
      noteId,
      tagId,
    ])
    saveDatabase()
  }

  getForNote(noteId: string): Tag[] {
    const db = getDatabase()
    const stmt = db.prepare(
      `SELECT tags.* FROM tags
       JOIN note_tags ON tags.id = note_tags.tag_id
       WHERE note_tags.note_id = ?
       ORDER BY tags.name`
    )
    stmt.bind([noteId])
    const results: Tag[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Tag)
    }
    stmt.free()
    return results
  }
}
