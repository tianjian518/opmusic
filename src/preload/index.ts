import { contextBridge, ipcRenderer } from 'electron'
import type { Account, Settings, Playlist, TrackRef } from '../main/store'
import type { FileItem } from '../main/webdav'

export interface ElectronAPI {
  accounts: {
    list: () => Promise<Account[]>
    save: (acc: Account) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  files: {
    list: (acct: string, dir: string) => Promise<FileItem[]>
    search: (acct: string, root: string, kw: string) => Promise<FileItem[]>
    collectAudio: (acct: string, dir: string, depth?: number) => Promise<FileItem[]>
  }
  stream: {
    base: () => Promise<string>
    url: (acct: string, filePath: string) => Promise<string>
    coverUrl: (acct: string, dir: string, artist?: string, album?: string, title?: string) => Promise<string>
    lyricsUrl: (acct: string, filePath: string) => Promise<string>
  }
  meta: {
    info: (artist: string, album: string, title?: string, force?: boolean) => Promise<{ artistBio?: string; albumName?: string; albumYear?: string }>
    tags: (acct: string, path: string) => Promise<{ artist?: string; album?: string; title?: string; duration?: number } | null>
    duration?: (acct: string, path: string) => Promise<number | null>
    disambiguate?: (a: string, b: string) => Promise<{ artist?: string; title?: string } | null>
  }
  lyrics: {
    online: (artist: string, title: string) => Promise<string | null>
  }
  store: {
    get: <T = any>(key: string) => Promise<T>
    set: (key: string, val: any) => Promise<void>
  }
  lyric: {
    set: (text: string) => void
    hide: () => void
  }
  openExternal: (url: string) => void
  selftest: {
    result: (data: any) => void
  }
  onLyric: (cb: (text: string) => void) => void
}

const api: ElectronAPI = {
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    save: (acc) => ipcRenderer.invoke('accounts:save', acc),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id)
  },
  files: {
    list: (acct, dir) => ipcRenderer.invoke('files:list', acct, dir),
    search: (acct, root, kw) => ipcRenderer.invoke('files:search', acct, root, kw),
    collectAudio: (acct, dir, depth) => ipcRenderer.invoke('files:collectAudio', acct, dir, depth)
  },
  stream: {
    base: () => ipcRenderer.invoke('stream:base'),
    url: async (acct, filePath) => {
      const base = await ipcRenderer.invoke('stream:base')
      return `${base}/stream?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(filePath)}`
    },
    coverUrl: async (acct, dir, artist?, album?, title?) => {
      const base = await ipcRenderer.invoke('stream:base')
      let u = `${base}/cover?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(dir)}`
      if (artist) u += `&artist=${encodeURIComponent(artist)}`
      if (album) u += `&album=${encodeURIComponent(album)}`
      if (title) u += `&title=${encodeURIComponent(title)}`
      return u
    },
    lyricsUrl: async (acct, filePath) => {
      const base = await ipcRenderer.invoke('stream:base')
      return `${base}/lyrics?acct=${encodeURIComponent(acct)}&path=${encodeURIComponent(filePath)}`
    }
  },
  meta: {
    info: (artist, album, title, force) => ipcRenderer.invoke('meta:info', artist, album, title, force),
    tags: (acct, path) => ipcRenderer.invoke('meta:tags', acct, path),
    duration: (acct, path) => ipcRenderer.invoke('meta:duration', acct, path),
    disambiguate: (a, b) => ipcRenderer.invoke('meta:disambiguate', a, b)
  },
  lyrics: {
    online: (artist, title) => ipcRenderer.invoke('lyrics:online', artist, title)
  },
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, val) => ipcRenderer.invoke('store:set', key, val)
  },
  lyric: {
    set: (text) => ipcRenderer.send('lyric:set', text),
    hide: () => ipcRenderer.send('lyric:hide')
  },
  openExternal: (url) => ipcRenderer.send('open-external', url),
  selftest: {
    result: (data) => ipcRenderer.send('selftest:result', data)
  },
  onLyric: (cb) => ipcRenderer.on('lyric', (_e, text) => cb(text))
}

contextBridge.exposeInMainWorld('electronAPI', api)
