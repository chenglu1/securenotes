import React from 'react'
import ReactDOM from 'react-dom/client'
import { installMockApi } from './services/mockApi'
import { App } from './App'
import './styles/index.css'
import 'katex/dist/katex.min.css'
import '@chenglu1/xeditor-editor/dist/style.css'
import '@chenglu1/xeditor-editor/dist/xeditor-editor.css'

// Install mock API for browser-based development (no-op in Electron)
installMockApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

postMessage({ payload: 'removeLoading' }, '*')
