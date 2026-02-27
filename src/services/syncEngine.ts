// Sync Engine: manages synchronization between local SQLite and remote server
// Uses incremental sync with version tracking and offline queue

interface SyncOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  entity: 'note' | 'tag' | 'attachment'
  entityId: string
  payload: unknown
  timestamp: string
  retries: number
}

class SyncEngine {
  private queue: SyncOperation[] = []
  private isSyncing = false
  private serverUrl: string | null = null
  private authToken: string | null = null
  private onStatusChange?: (status: SyncStatus) => void

  get isConfigured(): boolean {
    return !!this.serverUrl && !!this.authToken
  }

  /**
   * Configure the sync engine with server details
   */
  configure(serverUrl: string, authToken: string) {
    this.serverUrl = serverUrl
    this.authToken = authToken
  }

  /**
   * Add an operation to the sync queue
   */
  enqueue(op: Omit<SyncOperation, 'id' | 'timestamp' | 'retries'>) {
    this.queue.push({
      ...op,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      retries: 0,
    })
    this.notifyStatus('pending')
  }

  /**
   * Process the sync queue — sends pending operations to the server
   */
  async processQueue(): Promise<void> {
    if (this.isSyncing || !this.isConfigured || this.queue.length === 0) return

    this.isSyncing = true
    this.notifyStatus('syncing')

    const batch = [...this.queue]
    const failed: SyncOperation[] = []

    for (const op of batch) {
      try {
        await this.sendOperation(op)
        // Remove from queue on success
        this.queue = this.queue.filter((q) => q.id !== op.id)
      } catch (err) {
        console.error(`Sync failed for ${op.type} ${op.entityId}:`, err)
        op.retries++
        if (op.retries < 5) {
          failed.push(op)
        } else {
          console.error(`Dropping operation after 5 retries:`, op)
        }
      }
    }

    this.queue = [...failed, ...this.queue.filter((q) => !batch.includes(q))]
    this.isSyncing = false
    this.notifyStatus(this.queue.length === 0 ? 'synced' : 'pending')
  }

  /**
   * Pull changes from the server since the last sync version
   */
  async pullChanges(lastSyncVersion: number): Promise<SyncPullResult | null> {
    if (!this.isConfigured) return null

    try {
      const response = await fetch(`${this.serverUrl}/api/sync/pull?since=${lastSyncVersion}`, {
        headers: { Authorization: `Bearer ${this.authToken}` },
      })
      if (!response.ok) throw new Error(`Pull failed: ${response.status}`)
      return response.json()
    } catch (err) {
      console.error('Pull failed:', err)
      return null
    }
  }

  /**
   * Send a single sync operation to the server
   */
  private async sendOperation(op: SyncOperation): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(op),
    })

    if (!response.ok) {
      throw new Error(`Push failed: ${response.status}`)
    }
  }

  /**
   * Get the current sync queue length
   */
  get pendingCount(): number {
    return this.queue.length
  }

  /**
   * Register a status change callback
   */
  onStatus(callback: (status: SyncStatus) => void) {
    this.onStatusChange = callback
  }

  private notifyStatus(status: SyncStatus) {
    this.onStatusChange?.(status)
  }
}

export type SyncStatus = 'offline' | 'synced' | 'syncing' | 'pending' | 'error'

export interface SyncPullResult {
  notes: Array<{ id: string; title: string; content: string; updated_at: string; sync_version: number }>
  syncVersion: number
}

// Singleton instance
export const syncEngine = new SyncEngine()
