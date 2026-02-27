import { v4 as uuid } from 'uuid'
import { join, basename, extname } from 'path'
import { copyFileSync, mkdirSync, unlinkSync, existsSync } from 'fs'
import { statSync } from 'fs'
import { app, shell } from 'electron'
import { getDatabase, saveDatabase } from '../connection'
import type { Attachment } from '../../types'

let _attachmentsDir: string | null = null
function getAttachmentsDir(): string {
  if (!_attachmentsDir) {
    _attachmentsDir = join(app.getPath('userData'), 'attachments')
  }
  return _attachmentsDir
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

function getMimeType(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] ?? 'application/octet-stream'
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export class AttachmentsRepository {
  getForNote(noteId: string): Attachment[] {
    const db = getDatabase()
    const stmt = db.prepare(
      `SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at DESC`
    )
    stmt.bind([noteId])
    const results: Attachment[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Attachment)
    }
    stmt.free()
    return results
  }

  add(noteId: string, sourcePath: string): Attachment {
    const db = getDatabase()
    ensureDir(getAttachmentsDir())

    const id = uuid()
    const filename = basename(sourcePath)
    const ext = extname(sourcePath)
    const storedName = `${id}${ext}`
    const destPath = join(getAttachmentsDir(), storedName)

    copyFileSync(sourcePath, destPath)

    const stats = statSync(destPath)
    const mimeType = getMimeType(ext)
    const now = new Date().toISOString()

    db.run(
      `INSERT INTO attachments (id, note_id, filename, mime_type, size_bytes, file_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, noteId, filename, mimeType, stats.size, storedName, now]
    )
    saveDatabase()

    // Read back the inserted row
    const stmt = db.prepare(`SELECT * FROM attachments WHERE id = ?`)
    stmt.bind([id])
    let result: Attachment | undefined
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as Attachment
    }
    stmt.free()
    return result!
  }

  delete(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare(`SELECT * FROM attachments WHERE id = ?`)
    stmt.bind([id])
    let attachment: Attachment | undefined
    if (stmt.step()) {
      attachment = stmt.getAsObject() as unknown as Attachment
    }
    stmt.free()

    if (!attachment) return false

    const filePath = join(getAttachmentsDir(), attachment.file_path)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    db.run(`DELETE FROM attachments WHERE id = ?`, [id])
    saveDatabase()
    return db.getRowsModified() > 0
  }

  open(id: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare(`SELECT * FROM attachments WHERE id = ?`)
    stmt.bind([id])
    let attachment: Attachment | undefined
    if (stmt.step()) {
      attachment = stmt.getAsObject() as unknown as Attachment
    }
    stmt.free()

    if (!attachment) return false

    const filePath = join(getAttachmentsDir(), attachment.file_path)
    shell.openPath(filePath)
    return true
  }
}
