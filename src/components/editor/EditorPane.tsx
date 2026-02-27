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
      <div className="editor-pane">
        <div className="empty-state fade-in">
          <FileText className="empty-state-icon" size={64} />
          <h2 className="empty-state-title">选择或创建一篇笔记</h2>
          <p className="empty-state-desc">
            从左侧选择一篇笔记开始编辑，或点击 + 按钮创建新笔记
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-pane fade-in">
      <div className="editor-header">
        <input
          type="text"
          className="editor-title-input"
          placeholder="无标题"
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
        />
        <button
          className="btn-icon"
          onClick={handleDelete}
          title="删除笔记"
          style={{ color: 'var(--danger)' }}
        >
          <Trash2 size={18} />
        </button>
      </div>

      {editor && <EditorToolbar editor={editor} />}

      <div className="editor-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
