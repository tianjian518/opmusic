// 渲染进程与 Electron 主进程通信的封装 + 工具函数
declare global {
  interface Window {
    electronAPI: any
  }
}

export interface Account {
  id: string
  name: string
  url: string
  username: string
  password: string
}

export interface FileItem {
  name: string
  path: string
  isDir: boolean
  size: number
  lastmod: string
}

export interface Settings {
  skin: string // 预设皮肤：midnight/charcoal/graphite/light/lightgray/sky/lavender/mint/rose
  accent: string // 强调色
  glass: boolean // 玻璃渐变虚化
  glassBlur: number // 模糊强度(px)
  bgImage: string | null // 自定义背景图(dataURL)
  bgGradient: string | null // 渐变背景(CSS)
  playlistSort: 'custom' | 'name' | 'count' | 'recent' // 歌单列表排序
  playMode: 'order' | 'loop-one' | 'loop-list' | 'shuffle'
  volume: number
  eq: number[]
  autoFullscreen: boolean // 播放时是否自动跳转到全屏播放界面
  theme?: 'dark' | 'light' // 兼容旧配置
}

// 渲染端「后端」按运行环境解析：桌面用 Electron IPC，浏览器/Capacitor 用 webBackend。
// 这样同一套 UI 代码在三种环境通用。
import { api as backendApi } from './backend'
export const api = backendApi

export function formatTime(sec: number): string {
  if (!isFinite(sec) || !sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatSize(bytes: number): string {
  if (!bytes) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}

export interface LrcLine {
  time: number
  text: string
}

export function parseLrc(text: string): LrcLine[] {
  const lines: LrcLine[] = []
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  text.split(/\r?\n/).forEach((line) => {
    const texts = line.replace(re, '').trim()
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(line))) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0
      const time = min * 60 + sec + ms / 1000
      if (texts) lines.push({ time, text: texts })
    }
  })
  return lines.sort((a, b) => a.time - b.time)
}

export function currentLrc(lines: LrcLine[], time: number): string {
  if (!lines.length) return ''
  let cur = lines[0]
  for (const l of lines) {
    if (l.time <= time + 0.2) cur = l
    else break
  }
  return cur?.text || ''
}

export const AUDIO_EXT = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'ape', 'wma']
export function isAudioName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return AUDIO_EXT.includes(ext)
}

// 这些格式 Chromium / Electron 内置媒体栈默认不带解码器（受许可限制），<audio> 无法原生播放，
// 改由主进程用 ffmpeg 实时转码为 MP3（需本机安装 ffmpeg）。
export const UNPLAYABLE_EXT = ['wma', 'ape']
export function isPlayable(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return AUDIO_EXT.includes(ext)
}
// 是否需要主进程转码（浏览器原生不支持的格式）
export function needsTranscode(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return UNPLAYABLE_EXT.includes(ext)
}

// 从文件名（及所在目录）解析 歌手/歌名/专辑，用于在线刮削与歌词搜索
export interface TrackMeta {
  artist?: string
  title: string
  album?: string
  cleanTitle: string // 去掉括号补充说明，更适合搜索
  artistFromDir?: boolean // 歌手是否由目录判定（用于避免被歌曲搜索兜底覆盖）
}
// 按「空格-连字符-空格」拆分文件名片段（去纯数字段），供解析与顺序判定复用
export function splitDashName(s: string): string[] {
  return s.split(/\s*[-–—]\s*/).map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x))
}
export function parseMeta(name: string, dir?: string): TrackMeta {
  const stripNum = (s: string) => s.replace(/^\s*\d+[\s.\-_]+/, '') // 去开头序号 01 / 01. / 01-
  const splitDash = splitDashName

  // 文件名：去扩展名 + 去序号
  let s = name.replace(/\.[^.]+$/, '')
  s = stripNum(s)
  const cleanTitle = s.replace(/[（(].*?[)）]/g, '').replace(/\s+/g, ' ').trim()

  // 目录名拆「专辑 - 歌手」（常见：序号 专辑-歌手，如 024 寓言-王菲）；单段目录当作歌手目录（如 「王菲/」）
  let folderAlbum: string | undefined
  let folderArtist: string | undefined
  if (dir) {
    const seg = dir.split('/').filter(Boolean).pop() || ''
    const fs = stripNum(seg)
    const dp = fs.split(/\s*[-–—]\s*/).map((x) => x.trim()).filter(Boolean)
    if (dp.length >= 2) {
      folderAlbum = dp[0]
      folderArtist = dp[1]
    } else if (dp.length === 1) {
      folderArtist = dp[0]
    }
  }

  // 文件名拆「歌手 / 专辑 / 歌名」（常见：歌手 - 歌名；歌手 - 专辑 - 歌名）
  const fp = splitDash(s)
  let fArtist: string | undefined
  let fTitle = s
  let fAlbum: string | undefined
  let artistFromDir = false
  const same = (x: string, y: string) => x && y && (x === y || x.includes(y) || y.includes(x))
  if (fp.length === 2) {
    const [A, B] = [fp[0], fp[1]]
    // 文件名两段时，用「目录里的歌手名」判定哪段才是歌手——文件名既可能是「歌手-歌名」
    // 也可能是「歌名-歌手」（用户库两种都有）。目录含歌手时以目录为准，避免整反。
    if (folderArtist && (same(A, folderArtist) || same(B, folderArtist))) {
      if (same(A, folderArtist)) {
        fArtist = A
        fTitle = B
      } else {
        fArtist = B
        fTitle = A
      }
      artistFromDir = true
    } else {
      // 无目录线索：保守按「歌手 - 歌名」
      fArtist = A
      fTitle = B
    }
  } else if (fp.length >= 3) {
    fArtist = fp[0]
    fAlbum = fp[1]
    fTitle = fp[2]
  }

  // 互补：文件名缺的从目录补
  const artist = fArtist || folderArtist
  const album = fAlbum || folderAlbum
  const title = fTitle.trim()

  return { artist, title, album, cleanTitle, artistFromDir }
}
