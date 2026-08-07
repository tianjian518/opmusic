import type { Backend } from './types'

// 桌面端：直接复用 Electron preload 暴露的 window.electronAPI（行为完全不变）。
export const electronBackend = (window as any).electronAPI as Backend
