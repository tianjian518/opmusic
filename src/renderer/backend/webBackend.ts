import { createClient, type WebDAVClient } from 'webdav'
import type { Backend, AccountLite, FileItem, TrackMetaInfo } from './types'
import { coverInfoFor, getInfo, onlineLyrics, disambiguateArtistTitle } from './webMeta'

const AUDIO_EXT = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'ape', 'wma']
function isAudio(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return AUDIO_EXT.includes(ext)
}

// ---- 服务器模式（自托管 Web 服务）：账号由同活后端 /api/accounts 托管，
// WebDAV 流 / 封面 / 歌词全部经同源后端代理，彻底绕开浏览器 CORS。
// 通过 import.meta.env.VITE_SERVER_MODE 注入（仅 build:server 时为真）。 ----
const SERVER = import.meta.env.VITE_SERVER_MODE === true

async function serverAccountsList(): Promise<AccountLite[]> {
  const r = await fetch('/api/accounts')
  if (!r.ok) throw new Error('加载账号失败')
  return (await r.json()) as AccountLite[]
}
async function serverAccountSave(acc: AccountLite): Promise<void> {
  const r = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(acc)
  })
  if (!r.ok) throw new Error('保存账号失败')
}
async function serverAccountDelete(id: string): Promise<void> {
  const r = await fetch('/api/accounts/' + encodeURIComponent(id), { method: 'DELETE' })
  if (!r.ok) throw new Error('删除账号失败')
}

// ---- 账号 / 歌单 / 设置：用 localStorage 持久化（与 electron-store 字段兼容） ----
function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function lsSet(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* 忽略 */
  }
}

// 若有 Capacitor 原生插件（安卓 APK），把账号同步过去，供本地流代理按 id 解析凭据
function pushAccountsToNative(accounts: AccountLite[]) {
  const cap = (window as any).Capacitor
  const plugin = cap?.Plugins?.OpMusic
  if (plugin?.setAccounts) {
    try {
      plugin.setAccounts({ accounts })
    } catch {
      /* ignore */
    }
  }
}

function readAccounts(): AccountLite[] {
  return lsGet<AccountLite[]>('accounts', [])
}
function writeAccounts(list: AccountLite[]) {
  lsSet('accounts', list)
  pushAccountsToNative(list)
}

// ---- WebDAV 客户端缓存 ----
const clientCache = new Map<string, WebDAVClient>()
function getClient(accountId: string): WebDAVClient {
  let c = clientCache.get(accountId)
  if (!c) {
    const acc = readAccounts().find((a) => a.id === accountId)
    if (!acc) throw new Error('账号不存在: ' + accountId)
    c = createClient(acc.url.replace(/\/$/, '') + '/', { username: acc.username, password: acc.password })
    clientCache.set(accountId, c)
  }
  return c
}

function mapItems(arr: any[]): FileItem[] {
  return arr
    .map((it) => ({
      name: it.basename,
      path: it.filename,
      isDir: it.type === 'directory',
      size: it.size || 0,
      lastmod: it.lastmod || ''
    }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh') : a.isDir ? -1 : 1))
}

async function listFiles(accountId: string, dir: string): Promise<FileItem[]> {
  const client = getClient(accountId)
  const items = await client.getDirectoryContents(dir, { includeSelf: false })
  const arr = Array.isArray(items) ? items : (items as any).data || []
  return mapItems(arr as any[])
}

// 服务端模式：列目录走同源后端 /api/list（后端用服务端凭据连 WebDAV，彻底绕开浏览器 CORS）
async function serverListFiles(accountId: string, dir: string): Promise<FileItem[]> {
  const r = await fetch(`/api/list?acct=${encodeURIComponent(accountId)}&path=${encodeURIComponent(dir)}`)
  if (!r.ok) throw new Error('列目录失败: ' + r.status)
  const j = await r.json()
  return (j.items || []) as FileItem[]
}

// 当前生效的列表函数（SERVER 模式走后端代理，否则浏览器直连 WebDAV）
const activeList = SERVER ? serverListFiles : listFiles

async function collectAudio(accountId: string, dir: string, depth = 6): Promise<FileItem[]> {
  const out: FileItem[] = []
  async function walk(d: string, dep: number) {
    if (dep > depth) return
    const list = await activeList(accountId, d)
    for (const it of list) {
      if (it.isDir) await walk(it.path, dep + 1)
      else if (isAudio(it.name)) out.push(it)
    }
  }
  await walk(dir, 0)
  return out
}

async function search(accountId: string, root: string, kw: string, depth = 3): Promise<FileItem[]> {
  const kwl = kw.toLowerCase()
  const out: FileItem[] = []
  async function walk(dir: string, d: number) {
    if (d > depth) return
    const list = await activeList(accountId, dir)
    for (const it of list) {
      if (it.name.toLowerCase().includes(kwl)) out.push(it)
      if (it.isDir) await walk(it.path, d + 1)
    }
  }
  await walk(root, 0)
  return out.filter((i) => !i.isDir)
}

// ---- 流地址：优先走 Capacitor 原生本地代理（CORS 无关）；无代理时回退 WebDAV 直链 ----
function nativeStreamBase(): string {
  return (window as any).__TIANJIAN_STREAM_BASE__ || ''
}

function webdavDirectUrl(acc: AccountLite, filePath: string): string {
  const base = acc.url.replace(/\/$/, '')
  const full = base + filePath
  const m = full.match(/^(https?:\/\/)(.*)$/)
  if (!m) return full
  const auth = acc.username ? `${encodeURIComponent(acc.username)}:${encodeURIComponent(acc.password)}@` : ''
  return m[1] + auth + m[2]
}

export const webBackend: Backend = {
  env: 'web',

  accounts: {
    list: SERVER
      ? serverAccountsList
      : async () => readAccounts(),
    save: SERVER
      ? serverAccountSave
      : async (acc) => {
          const list = readAccounts()
          const idx = list.findIndex((a) => a.id === acc.id)
          if (idx >= 0) list[idx] = acc
          else list.push(acc)
          writeAccounts(list)
          clientCache.delete(acc.id)
        },
    delete: SERVER
      ? serverAccountDelete
      : async (id) => {
          writeAccounts(readAccounts().filter((a) => a.id !== id))
          clientCache.delete(id)
        }
  },

  files: {
    list: activeList,
    search,
    collectAudio
  },

  stream: {
    base: async () => (SERVER ? '' : nativeStreamBase()),
    url: async (acct, filePath) => {
      const base = nativeStreamBase()
      if (base) return `${base}/stream?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(filePath)}`
      if (SERVER) return `/stream?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(filePath)}`
      const acc = readAccounts().find((a) => a.id === acct)
      if (!acc) throw new Error('账号不存在')
      return webdavDirectUrl(acc, filePath)
    },
    coverUrl: async (acct, dir, artist?, album?, title?) => {
      const base = nativeStreamBase()
      if (base) {
        let u = `${base}/cover?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(dir)}`
        if (artist) u += `&artist=${encodeURIComponent(artist)}`
        if (album) u += `&album=${encodeURIComponent(album)}`
        if (title) u += `&title=${encodeURIComponent(title)}`
        return u
      }
      // 服务端模式：封面走同源后端 /cover（能用网盘内 folder.jpg，也支持在线刮削兜底）
      if (SERVER) {
        let u = `/cover?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(dir)}`
        if (artist) u += `&artist=${encodeURIComponent(artist)}`
        if (album) u += `&album=${encodeURIComponent(album)}`
        if (title) u += `&title=${encodeURIComponent(title)}`
        return u
      }
      // 纯浏览器回退：优先网易云，其次 Cover Art Archive 直链（CORS 友好）
      if (artist || album || title) {
        const info = await coverInfoFor(artist || '', album || '', title)
        if (info?.cover) return info.cover
      }
      return ''
    },
    lyricsUrl: async (acct, filePath) => {
      const base = nativeStreamBase()
      if (base) return `${base}/lyrics?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(filePath)}`
      if (SERVER) return `/lyrics?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(filePath)}`
      return '' // 纯浏览器无本地代理：由 loadLyrics 自动降级到在线歌词
    }
  },

  meta: {
    info: async (artist, album, _title?, _force?): Promise<TrackMetaInfo> => {
      const cap = (window as any).Capacitor
      const plugin = cap?.Plugins?.OpMusic
      if (plugin?.metaInfo) {
        try {
          const r = await plugin.metaInfo({ artist, album })
          if (r) return r
        } catch {
          /* 落到浏览器 fetch */
        }
      }
      return getInfo(artist, album, _title, _force)
    },
    tags: SERVER
      ? async (acct: string, path: string) => {
          const r = await fetch(`/api/tags?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(path)}`)
          if (!r.ok) return null
          return r.json()
        }
      : async (acct, path): Promise<{ artist?: string; album?: string; title?: string } | null> => {
          const cap = (window as any).Capacitor
          const plugin = cap?.Plugins?.OpMusic
          if (plugin?.getTags) {
            try {
              const r = await plugin.getTags({ acct, path })
              if (r) return r
            } catch {
              /* 落到浏览器回退 */
            }
          }
          return null
        },
    disambiguate: async (a, b) => disambiguateArtistTitle(a, b),
    duration: SERVER
      ? async (acct, path) => {
          const r = await fetch(`/api/duration?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(path)}`)
          if (!r.ok) return null
          const j = await r.json().catch(() => null)
          return j?.duration ?? null
        }
      : undefined
  },

  lyrics: {
    online: async (artist, title): Promise<string | null> => {
      const cap = (window as any).Capacitor
      const plugin = cap?.Plugins?.OpMusic
      if (plugin?.onlineLyrics) {
        try {
          const r = await plugin.onlineLyrics({ artist, title })
          if (r) return r
        } catch {
          /* 落到浏览器 fetch */
        }
      }
      return onlineLyrics(artist, title)
    }
  },

  store: {
    get: async <T = any>(key: string): Promise<T> => {
      // 服务端模式：从后端 /api/store 读取（数据存在服务器 /data，跨设备/跨浏览器共享）
      if (SERVER) {
        try {
          const r = await fetch('/api/store?key=' + encodeURIComponent(key))
          if (r.ok) return (await r.json()).value as T
        } catch {
          /* 后端不可达时降级到 localStorage */
        }
        return lsGet<T>(key, (undefined as unknown) as T)
      }
      return lsGet<T>(key, (undefined as unknown) as T)
    },
    set: async (key, val) => {
      // 服务端模式：写入后端 /api/store（服务端持久化，换设备也不丢）
      if (SERVER) {
        try {
          await fetch('/api/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: val })
          })
          return
        } catch {
          /* 后端不可达时降级到 localStorage */
        }
      }
      lsSet(key, val)
    }
  },

  lyric: {
    set: () => {
      /* 移动端无独立桌面歌词窗口；App 内歌词面板已覆盖 */
    },
    hide: () => {}
  },

  openExternal: (url) => {
    window.open(url, '_blank', 'noopener')
  },

  onLyric: () => {
    /* no-op on web */
  }
}
