import { useCallback, useRef } from 'react'
import { Search, Plus, FileText, Shield } from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'

export function Sidebar() {
  const notes = useNoteStore((s) => s.notes)
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const searchQuery = useNoteStore((s) => s.searchQuery)
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery)
  const selectNote = useNoteStore((s) => s.selectNote)
  const createNote = useNoteStore((s) => s.createNote)

  const searchRef = useRef<HTMLInputElement>(null)

  const handleCreateNote = useCallback(async () => {
    const note = await createNote()
    if (note) {
      selectNote(note.id)
    }
  }, [createNote, selectNote])

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 7) return `${days} 天前`
    return date.toLocaleDateString('zh-CN')
  }

  const getPreview = (content: string) => {
    if (!content) return '空笔记'
    // Strip any HTML/JSON and get plain text preview
    const text = content.replace(/<[^>]*>/g, '').replace(/[{}[\]"]/g, '').trim()
    return text.substring(0, 80) || '空笔记'
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <Shield size={20} />
          <span>SecureNotes</span>
        </div>
        <button
          className="btn-icon"
          onClick={handleCreateNote}
          title="新建笔记"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="search-wrapper">
        <div className="search-container">
          <Search className="search-icon" size={16} />
          <input
            ref={searchRef}
            type="text"
            className="search-input"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="note-list">
        {notes.length === 0 ? (
          <div className="empty-state fade-in" style={{ padding: '32px 16px' }}>
            <FileText className="empty-state-icon" size={40} />
            <p className="empty-state-desc">
              {searchQuery ? '没有找到匹配的笔记' : '还没有笔记，点击 + 创建'}
            </p>
          </div>
        ) : (
          notes.map((note, index) => (
            <div
              key={note.id}
              className={`note-card slide-in ${selectedNoteId === note.id ? 'active' : ''}`}
              style={{ animationDelay: `${index * 30}ms` }}
              onClick={() => selectNote(note.id)}
            >
              <div className="note-card-title">
                {note.title || '无标题'}
              </div>
              <div className="note-card-preview">
                {getPreview(note.content)}
              </div>
              <div className="note-card-time">
                {formatTime(note.updated_at)}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sync-indicator">
        <span className="sync-dot" />
        <span>本地</span>
      </div>
    </aside>
  )
}
