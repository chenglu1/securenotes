import { useEffect, useRef, useCallback } from 'react'
import { getOrCreateYDoc, destroyYDoc } from '../services/collaboration'
import type * as Y from 'yjs'

interface UseCollaborationOptions {
  noteId: string | null
  enabled?: boolean
  serverUrl?: string
}

interface UseCollaborationReturn {
  ydoc: Y.Doc | null
  isConnected: boolean
}

/**
 * Hook to manage Yjs document lifecycle for a note.
 * Creates or retrieves a Y.Doc when a note is selected,
 * and destroys it when the note is deselected.
 * 
 * In the future, this will also manage the WebSocket provider
 * for real-time collaboration with the server.
 */
export function useCollaboration({
  noteId,
  enabled = true,
}: UseCollaborationOptions): UseCollaborationReturn {
  const ydocRef = useRef<Y.Doc | null>(null)
  const prevNoteIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Clean up previous doc if we switched notes
    if (prevNoteIdRef.current && prevNoteIdRef.current !== noteId) {
      destroyYDoc(prevNoteIdRef.current)
      ydocRef.current = null
    }

    if (!noteId || !enabled) {
      ydocRef.current = null
      prevNoteIdRef.current = null
      return
    }

    // Get or create a Y.Doc for this note
    const doc = getOrCreateYDoc(noteId)
    ydocRef.current = doc
    prevNoteIdRef.current = noteId

    return () => {
      // Cleanup on unmount
      if (noteId) {
        destroyYDoc(noteId)
        ydocRef.current = null
      }
    }
  }, [noteId, enabled])

  return {
    ydoc: ydocRef.current,
    isConnected: false, // Will be true when WebSocket provider is connected
  }
}
