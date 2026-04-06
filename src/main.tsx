import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntdApp, ConfigProvider, type ThemeConfig } from 'antd'
import 'antd/dist/reset.css'
import { installMockApi } from './services/mockApi'
import { App } from './App'
import './styles/index.css'
import './styles/sidebar.css'
import './styles/editor.css'
import './styles/auth.css'

const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2f3437',
    colorInfo: '#2f3437',
    colorSuccess: '#2f7d64',
    colorWarning: '#b7791f',
    colorError: '#c2410c',
    colorTextBase: '#37352f',
    colorBgBase: '#fbfbfa',
    colorBgElevated: '#ffffff',
    colorBorder: 'rgba(55, 53, 47, 0.09)',
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,
    boxShadowSecondary: '0 12px 24px rgba(15, 23, 42, 0.05)',
    fontFamily:
      '"Aptos", "Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei UI", sans-serif',
    fontFamilyCode:
      '"IBM Plex Mono", "Cascadia Mono", "Consolas", monospace',
  },
  components: {
    Layout: {
      bodyBg: 'transparent',
      headerBg: 'transparent',
      siderBg: 'transparent',
    },
    Button: {
      controlHeightLG: 42,
      paddingInlineLG: 18,
      primaryShadow: '0 6px 14px rgba(47, 52, 55, 0.12)',
      defaultShadow: 'none',
    },
    Card: {
      colorBgContainer: '#ffffff',
      colorBorderSecondary: 'rgba(55, 53, 47, 0.06)',
    },
    Input: {
      activeShadow: '0 0 0 3px rgba(47, 52, 55, 0.08)',
      hoverBorderColor: '#d6d3d1',
    },
    Modal: {
      contentBg: '#ffffff',
      headerBg: '#ffffff',
    },
    Tag: {
      defaultBg: '#f7f6f3',
    },
  },
}



// Install mock API for browser-based development (no-op in Electron)
installMockApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
)

postMessage({ payload: 'removeLoading' }, '*')
