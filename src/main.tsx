import React from 'react'
import ReactDOM from 'react-dom/client'
import { installMockApi } from './services/mockApi'
import { App } from './App'
import './styles/index.css'

// Install mock API for browser-based development (no-op in Electron)
installMockApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

postMessage({ payload: 'removeLoading' }, '*')
