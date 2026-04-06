/// <reference types="vite/client" />

import type { ElectronAPI } from '../electron/preload'

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
