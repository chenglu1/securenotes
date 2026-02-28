import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { useNoteStore } from '../../stores/noteStore'
import { EditorToolbar } from './EditorToolbar'
import { FileText, Trash2 } from 'lucide-react'

export function EditorPane() {
  const selectedNoteId = useNoteStore((s) => s.selectedNoteId)
  const notes = useNoteStore((s) => s.notes)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)

  const selectedNote = notes.find((n) => n.id === selectedNoteId)
  const [title, setTitle] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isUpdatingRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // We'll use lowlight version later
      }),
      Placeholder.configure({
        placeholder: '开始写点什么...',
      }),
      Highlight,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Image,
    ],
    content: '',
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return
      if (!selectedNoteId) return

      const content = editor.getHTML()

      // Debounced auto-save
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateNote(selectedNoteId, { content })
      }, 500)
    },
  })

  // Load note content when selection changes
  useEffect(() => {
    if (!editor) return
    if (!selectedNote) {
      isUpdatingRef.current = true
      editor.commands.setContent('')
      setTitle('')
      isUpdatingRef.current = false
      return
    }

    isUpdatingRef.current = true
    setTitle(selectedNote.title)
    editor.commands.setContent(selectedNote.content || '')
    isUpdatingRef.current = false
  }, [selectedNoteId, editor]) // eslint-disable-line react-hooks/exhaustive-deps

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
        editor?.commands.focus('start')
      }
    },
    [editor]
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

      {editor && <EditorToolbar editor={editor} />}

      <div className="flex-1 overflow-y-auto px-xl py-xl">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
