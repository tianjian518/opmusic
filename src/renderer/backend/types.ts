// 渲染端与「后端」通信的统一接口。
// 桌面端由 Electron 主进程通过 IPC 提供；浏览器/Capacitor 端由 webBackend 直接实现。
// 这样同一套 React 代码无需改动即可跑在三种环境。

export interface AccountLite {
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

export interface TrackMetaInfo {
  artistBio?: string
  albumName?: string
  albumYear?: string
}

export interface Backend {
  env: 'electron' | 'web'
  accounts: {
    list: () => Promise<AccountLite[]>
    save: (acc: AccountLite) => Promise<void>
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
    info: (artist: string, album: string, title?: string, force?: boolean) => Promise<TrackMetaInfo>
    // 读取音频文件内嵌标签（歌手/专辑/歌名 + 真实时长），用于精确匹配歌词与在线信息；
    // 无原生能力（纯浏览器且无 Capacitor 插件）时返回 null，调用方回退到文件名解析。
    tags?: (acct: string, path: string) => Promise<{ artist?: string; album?: string; title?: string; duration?: number } | null>
    // 探测真实时长（秒），用于转码格式浏览器拿不到时长的兜底；无能力时返回 null。
    duration?: (acct: string, path: string) => Promise<number | null>
    // 判定文件名「A - B」两段谁是歌手（歌名-歌手 / 歌手-歌名）；无法判定时返回 null。
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
  selftest?: { result: (data: any) => void }
  onLyric?: (cb: (text: string) => void) => void
}
