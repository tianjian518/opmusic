import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// PWA：仅在纯浏览器/网页环境下注册 Service Worker（桌面 Electron 与 Capacitor 原生环境跳过）
if (
  !(window as any).electronAPI &&
  !(window as any).Capacitor &&
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
