import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { AuthModal } from './components/auth/AuthModal'
import { useNoteStore } from './stores/noteStore'

export function App() {
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const loadTags = useNoteStore((s) => s.loadTags)
  const initAuth = useNoteStore((s) => s.initAuth)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    // 先初始化认证状态，再加载笔记
    const init = async () => {
      await initAuth()
      await loadNotes()
      await loadTags()
    }
    init()
  }, [initAuth, loadNotes, loadTags])

  return (
    <>
      <AppShell onShowAuth={() => setShowAuthModal(true)} />
      {showAuthModal && !isAuthenticated && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </>
  )
}
