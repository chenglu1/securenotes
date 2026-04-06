import { Layout } from 'antd'
import { Sidebar } from './Sidebar'
import { EditorPane } from '../editor/EditorPane'

interface AppShellProps {
  onShowAuth: () => void
}

const { Sider, Content } = Layout

export function AppShell({ onShowAuth }: AppShellProps) {
  return (
    <div className="app-frame">
      <div className="titlebar-drag" />
      <div className="workspace-shell">
        <Layout className="shell-layout">
          <Sider width="clamp(272px, 24vw, 312px)" className="shell-sider" theme="light">
            <Sidebar onShowAuth={onShowAuth} />
          </Sider>
          <Content className="shell-content">
            <EditorPane />
          </Content>
        </Layout>
      </div>
    </div>
  )
}
