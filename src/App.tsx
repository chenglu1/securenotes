import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { useNoteStore } from './stores/noteStore'

export function App() {
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const loadTags = useNoteStore((s) => s.loadTags)

  useEffect(() => {
    loadNotes()
    loadTags()
  }, [loadNotes, loadTags])

  return <AppShell />
}
