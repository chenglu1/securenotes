import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfigurableTiptapEditor } from '@chenglu1/xeditor-editor'
import { useNoteStore } from '../../stores/noteStore'
import { uploadImage } from '../../services/uploadService'
import { FileText, Trash2 } from 'lucide-react'

export function EditorPane() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const notes = useNoteStore((s) => s.notes)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)

  const selectedNote = notes.find((n) => n.id === selectedNoteId)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Load note content when selection changes
  useEffect(() => {
    if (!selectedNote) {
      setTitle('')
      setContent('')
      return
    }

    setTitle(selectedNote.title)
    setContent(selectedNote.content || '')
  }, [selectedNoteId, selectedNote])

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
      if (!selectedNoteId) return

      // Debounced auto-save
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateNote(selectedNoteId, { content: newContent })
      }, 500)
    },
    [selectedNoteId, updateNote]
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value
      setTitle(newTitle)
      if (!selectedNoteId) return

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateNote(selectedNoteId, { title: newTitle })
      }, 500)
    },
    [selectedNoteId, updateNote]
  )

  const handleDelete = useCallback(async () => {
    if (!selectedNoteId) return
    if (confirm('确定要删除这篇笔记吗？')) {
      await deleteNote(selectedNoteId)
    }
  }, [selectedNoteId, deleteNote])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
      }
    },
    []
  )

  // 图片上传处理函数
  const handleImageUpload = useCallback(
    async (
      file: File,
      onProgress?: (event: { progress: number }) => void,
      abortSignal?: AbortSignal
    ): Promise<string> => {
      try {
        // 使用上传服务
        const imageUrl = await uploadImage(file, onProgress, abortSignal)
        return imageUrl
      } catch (error) {
        console.error('图片上传失败:', error)
        // 可以在这里显示错误提示
        throw error
      }
    },
    []
  )

  // No note selected
  if (!selectedNote) {
    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-bg-primary">
        <div className="flex flex-col items-center justify-center h-full text-text-muted gap-lg p-3xl text-center animate-[fadeIn_350ms_ease_forwards]">
          <FileText className="w-16 h-16 opacity-30" size={64} />
          <h2 className="text-lg font-medium text-text-secondary">选择或创建一篇笔记</h2>
          <p className="text-sm max-w-[300px] leading-relaxed">
            从左侧选择一篇笔记开始编辑，或点击 + 按钮创建新笔记
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-bg-primary animate-[fadeIn_350ms_ease_forwards]">
      <div className="flex items-center justify-between pt-[46px] px-xl pb-sm border-b border-border [-webkit-app-region:drag]">
        <input
          type="text"
          className="text-2xl font-bold text-text-primary bg-transparent border-none outline-none w-full font-sans placeholder:text-text-muted [-webkit-app-region:no-drag]"
          placeholder="无标题"
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
        />
        <button
          className="w-9 h-9 p-0 border-none bg-transparent text-danger rounded-md cursor-pointer flex items-center justify-center hover:bg-bg-hover transition-all duration-fast [-webkit-app-region:no-drag]"
          onClick={handleDelete}
          title="删除笔记"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-xl">
        <ConfigurableTiptapEditor
          value={content}
          contentType="html"
          placeholder="开始写点什么..."
          onChange={handleContentChange}
          showToolbar={true}
          uploadHandler={handleImageUpload}
          maxFileSize={5 * 1024 * 1024}
          minHeight="100%"
        />
      </div>
    </div>
  )
}
