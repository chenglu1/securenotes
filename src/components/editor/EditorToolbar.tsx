import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Highlighter,
} from 'lucide-react'

interface EditorToolbarProps {
  editor: Editor
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  // Tiptap v3: ChainedCommands 类型不包含扩展命令，用辅助函数统一断言
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = () => editor.chain().focus() as any

  const addLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('输入链接 URL:', previousUrl)

    if (url === null) return
    if (url === '') {
      chain().extendMarkRange('link').unsetLink().run()
      return
    }

    chain().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-xl py-sm border-b border-border bg-bg-secondary flex-wrap">
      <ToolbarButton
        onClick={() => chain().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="加粗"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="斜体"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="删除线"
      >
        <Strikethrough size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="行内代码"
      >
        <Code size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title="高亮"
      >
        <Highlighter size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-border mx-xs" />

      <ToolbarButton
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="标题 1"
      >
        <Heading1 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="标题 2"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="标题 3"
      >
        <Heading3 size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-border mx-xs" />

      <ToolbarButton
        onClick={() => chain().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="无序列表"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="有序列表"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title="任务列表"
      >
        <ListChecks size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-border mx-xs" />

      <ToolbarButton
        onClick={() => chain().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="引用"
      >
        <Quote size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().setHorizontalRule().run()}
        title="分割线"
      >
        <Minus size={16} />
      </ToolbarButton>
      <ToolbarButton onClick={addLink} isActive={editor.isActive('link')} title="链接">
        <LinkIcon size={16} />
      </ToolbarButton>

      <div className="w-px h-5 bg-border mx-xs" />

      <ToolbarButton
        onClick={() => chain().undo().run()}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disabled={!(editor.can() as any).undo()}
        title="撤销"
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => chain().redo().run()}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disabled={!(editor.can() as any).redo()}
        title="重做"
      >
        <Redo size={16} />
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      className={`flex items-center justify-center w-8 h-8 border-none bg-transparent text-text-secondary rounded-sm cursor-pointer transition-all duration-fast [-webkit-app-region:no-drag] hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed ${
        isActive ? 'bg-primary/25 text-primary' : ''
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}
