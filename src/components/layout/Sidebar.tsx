import { useCallback, useRef } from 'react'
import { Search, Plus, FileText, Shield, Cloud, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'

interface SidebarProps {
  onShowAuth: () => void
}

export function Sidebar({ onShowAuth }: SidebarProps) {
  const notes = useNoteStore((s) => s.notes)
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const searchQuery = useNoteStore((s) => s.searchQuery)
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery)
  const selectNote = useNoteStore((s) => s.selectNote)
  const createNote = useNoteStore((s) => s.createNote)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const syncStatus = useNoteStore((s) => s.syncStatus)
  const syncToCloud = useNoteStore((s) => s.syncToCloud)
  const logout = useNoteStore((s) => s.logout)

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
    <aside className="w-[280px] min-w-[280px] h-screen bg-bg-secondary border-r border-border flex flex-col overflow-hidden transition-all duration-slow">
      <div className="pt-[50px] px-lg pb-md flex items-center justify-between">
        <div className="flex items-center gap-sm font-semibold text-lg bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          <Shield size={20} />
          <span>SecureNotes</span>
        </div>
        <button
          className="w-9 h-9 p-0 border-none bg-transparent text-text-secondary rounded-md cursor-pointer flex items-center justify-center hover:bg-bg-hover hover:text-text-primary transition-all duration-fast"
          onClick={handleCreateNote}
          title="新建笔记"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="px-lg pb-md">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" size={16} />
          <input
            ref={searchRef}
            type="text"
            className="w-full py-sm px-md pl-9 bg-bg-tertiary border border-border rounded-md text-text-primary font-sans text-sm transition-all duration-fast focus:outline-none focus:border-primary focus:shadow-glow focus:bg-bg-elevated placeholder:text-text-muted"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-sm">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-lg p-2xl text-center animate-[fadeIn_350ms_ease_forwards]" style={{ padding: '32px 16px' }}>
            <FileText className="w-10 h-10 opacity-30" size={40} />
            <p className="text-sm max-w-[300px] leading-relaxed">
              {searchQuery ? '没有找到匹配的笔记' : '还没有笔记，点击 + 创建'}
            </p>
          </div>
        ) : (
          notes.map((note, index) => (
            <div
              key={note.id}
              className={`p-md px-lg my-0.5 rounded-md cursor-pointer border transition-all duration-fast animate-[slideIn_350ms_ease_forwards] ${
                selectedNoteId === note.id
                  ? 'bg-bg-active border-primary shadow-[inset_3px_0_0_#6366f1]'
                  : 'border-transparent hover:bg-bg-hover'
              }`}
              style={{ animationDelay: `${index * 30}ms` }}
              onClick={() => selectNote(note.id)}
            >
              <div className="font-medium text-base text-text-primary mb-xs overflow-hidden text-ellipsis whitespace-nowrap">
                {note.title || '无标题'}
              </div>
              <div className="text-xs text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap leading-normal">
                {getPreview(note.content)}
              </div>
              <div className="text-xs text-text-muted mt-xs">
                {formatTime(note.updated_at)}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-xs text-xs text-text-muted px-sm py-sm">
        {isAuthenticated ? (
          <>
            <button
              onClick={syncToCloud}
              disabled={syncStatus === 'syncing'}
              className="border-none bg-transparent text-primary flex items-center gap-2 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:text-primary-hover transition-colors"
              title="同步到云端"
            >
              <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              {syncStatus === 'syncing' ? '同步中...' : '云同步'}
            </button>
            <button
              onClick={logout}
              className="border-none bg-transparent text-text-secondary p-1 cursor-pointer hover:text-text-primary transition-colors"
              title="登出"
            >
              <LogOut size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span>本地模式</span>
            <button
              onClick={onShowAuth}
              className="ml-auto border-none bg-transparent text-text-secondary cursor-pointer p-2 hover:text-text-primary transition-colors"
              title="登录以启用云同步"
            >
              <LogIn size={16} />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
