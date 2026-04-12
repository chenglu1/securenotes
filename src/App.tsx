import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { AuthModal } from './components/auth/AuthModal'
import { useNoteStore } from './stores/noteStore'

let bootstrapPromise: Promise<void> | null = null

export function App() {
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const loadTags = useNoteStore((s) => s.loadTags)
  const initAuth = useNoteStore((s) => s.initAuth)
  const isAuthenticated = useNoteStore((s) => s.isAuthenticated)
  const syncStatus = useNoteStore((s) => s.syncStatus)
  const createNote = useNoteStore((s) => s.createNote)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    const bootstrap = async () => {
      if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
          await initAuth()
          await loadNotes()
          await loadTags()
        })().catch((error) => {
          bootstrapPromise = null
          throw error
        })
      }

      await bootstrapPromise
    }

    void bootstrap()
  }, [initAuth, loadNotes, loadTags])

  useEffect(() => {
    return window.api.onCreateNewNote(async () => {
      await createNote()
    })
  }, [createNote])

  useEffect(() => {
    if (syncStatus === 'reauth-required') {
      setShowAuthModal(true)
    }
  }, [syncStatus])

  return (
    <>
      <AppShell onShowAuth={() => setShowAuthModal(true)} />
      {showAuthModal && !isAuthenticated && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </>
  )
}
