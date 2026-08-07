import { electronBackend } from './electronBackend'
import { webBackend } from './webBackend'
import type { Backend } from './types'

// 运行环境探测：存在 window.electronAPI（桌面 Electron）→ 用 IPC；
// 否则（浏览器 / PWA / Capacitor 安卓）→ 用 webBackend（Capacitor 下再由原生插件增强）。
function resolve(): Backend {
  if (typeof window !== 'undefined' && (window as any).electronAPI) return electronBackend
  return webBackend
}

export const api: Backend = resolve()
