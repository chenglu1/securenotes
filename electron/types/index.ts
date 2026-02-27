// Shared types for IPC communication

export interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  sync_version: number
  is_dirty: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface NoteTag {
  note_id: string
  tag_id: string
}

export interface Attachment {
  id: string
  note_id: string
  filename: string
  mime_type: string
  size_bytes: number
  file_path: string
  created_at: string
}
