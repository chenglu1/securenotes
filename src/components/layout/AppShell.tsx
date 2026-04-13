import { CloseOutlined, MenuOutlined } from '@ant-design/icons'
import { Button, Layout } from 'antd'
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { EditorPane } from '../editor/EditorPane'

interface AppShellProps {
  onShowAuth: () => void
}

const { Sider, Content } = Layout
const COMPACT_LAYOUT_QUERY = '(max-width: 1024px)'

function getInitialCompactLayout() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia(COMPACT_LAYOUT_QUERY).matches
}

export function AppShell({ onShowAuth }: AppShellProps) {
  const [isCompactLayout, setIsCompactLayout] = useState(getInitialCompactLayout)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsCompactLayout(event.matches)
    }

    setIsCompactLayout(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    if (!isCompactLayout) {
      setIsSidebarOpen(false)
    }
  }, [isCompactLayout])

  useEffect(() => {
    if (!isCompactLayout || !isSidebarOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCompactLayout, isSidebarOpen])

  return (
    <div className="app-frame">
      <div className="titlebar-drag" />
      <div className="workspace-shell">
        <Layout className="shell-layout">
          {isCompactLayout ? null : (
            <Sider width="clamp(272px, 24vw, 312px)" className="shell-sider" theme="light">
              <Sidebar onShowAuth={onShowAuth} />
            </Sider>
          )}

          <Content className={`shell-content${isCompactLayout ? ' shell-content--compact' : ''}`}>
            {isCompactLayout ? (
              <div className="shell-mobile-toolbar app-region-drag">
                <Button
                  type="text"
                  icon={<MenuOutlined />}
                  className="shell-mobile-toolbar__toggle app-region-no-drag"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  笔记列表
                </Button>
              </div>
            ) : null}

            <EditorPane />
          </Content>
        </Layout>

        {isCompactLayout ? (
          <div className={`shell-mobile-sidebar ${isSidebarOpen ? 'is-open' : ''}`} aria-hidden={!isSidebarOpen}>
            <button
              type="button"
              className="shell-mobile-sidebar__backdrop"
              aria-label="关闭侧栏"
              onClick={() => setIsSidebarOpen(false)}
            />

            <aside className="shell-mobile-sidebar__panel app-region-no-drag">
              <div className="shell-mobile-sidebar__controls">
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  className="shell-mobile-sidebar__close"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  收起
                </Button>
              </div>

              <Sidebar onShowAuth={onShowAuth} onRequestClose={() => setIsSidebarOpen(false)} />
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  )
}
