import { Sidebar } from './Sidebar'
import { EditorPane } from '../editor/EditorPane'

export function AppShell() {
  return (
    <div className="app-layout">
      <div className="titlebar-drag" />
      <Sidebar />
      <EditorPane />
    </div>
  )
}
