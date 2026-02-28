import { Sidebar } from './Sidebar'
import { EditorPane } from '../editor/EditorPane'

interface AppShellProps {
  onShowAuth: () => void
}

export function AppShell({ onShowAuth }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <div className="titlebar-drag" />
      <Sidebar onShowAuth={onShowAuth} />
      <EditorPane />
    </div>
  )
}
