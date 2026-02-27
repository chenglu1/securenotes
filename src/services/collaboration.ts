import * as Y from 'yjs'

// Map of noteId -> Y.Doc for active collaborative documents
const activeDocs = new Map<string, Y.Doc>()

/**
 * Get or create a Yjs document for a given note.
 * Each note has its own Y.Doc to enable independent collaboration.
 */
export function getOrCreateYDoc(noteId: string): Y.Doc {
  let doc = activeDocs.get(noteId)
  if (!doc) {
    doc = new Y.Doc()
    activeDocs.set(noteId, doc)
  }
  return doc
}

/**
 * Destroy a Yjs document when no longer needed (e.g., note closed).
 */
export function destroyYDoc(noteId: string): void {
  const doc = activeDocs.get(noteId)
  if (doc) {
    doc.destroy()
    activeDocs.delete(noteId)
  }
}

/**
 * Get all active document IDs
 */
export function getActiveDocIds(): string[] {
  return Array.from(activeDocs.keys())
}

/**
 * Export the Yjs state vector for syncing
 */
export function getStateVector(noteId: string): Uint8Array | null {
  const doc = activeDocs.get(noteId)
  if (!doc) return null
  return Y.encodeStateVector(doc)
}

/**
 * Export the full Yjs state as an update
 */
export function getFullState(noteId: string): Uint8Array | null {
  const doc = activeDocs.get(noteId)
  if (!doc) return null
  return Y.encodeStateAsUpdate(doc)
}

/**
 * Apply a remote update to a Yjs document
 */
export function applyUpdate(noteId: string, update: Uint8Array): void {
  const doc = activeDocs.get(noteId)
  if (doc) {
    Y.applyUpdate(doc, update)
  }
}
