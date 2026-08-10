import { create } from 'zustand'
import { api, Account, FileItem, Settings, LrcLine, parseLrc, isAudioName, parseMeta, splitDashName, isPlayable } from './api'

// 模块级持有 <audio> 元素引用，供全屏播放页的「点歌词跳转 / 进度条拖动」统一 seek
let _audioEl: HTMLAudioElement | null = null
export function registerAudioEl(el: HTMLAudioElement | null) {
  _audioEl = el
}

export type TrackSort = 'added' | 'name' | 'artist' | 'album' | 'custom'
export type PlaylistSort = 'custom' | 'name' | 'count' | 'recent'

// trackMeta 缓存结构版本：解析逻辑（消歧/错标纠正）变更时自增，加载时版本不符则清空旧缓存，
// 避免旧逻辑解析出的错误结果（如把「歌名 歌手」整体当歌名）长期留存、且「重新获取」也修不了。
const TRACKMETA_VER = 2

// 既支持横线也支持「单个空格」分隔的两段文件名/标题（用户库两种都有）。
// 横线优先（横线极少出现在名字内部）；横线拆不开且恰好被单个空格分成两段时，再按空格拆。
function splitNameParts(s: string): string[] {
  const byDash = splitDashName(s)
  if (byDash.length >= 2) return byDash
  const bySpace = s.split(/\s+/).map((x) => x.trim()).filter(Boolean)
  return bySpace.length === 2 ? bySpace : byDash
}

// 两段名称是否互相包含/相等（用于判断「文件名某段 == 内嵌歌手」）
function nameMatch(x: string | undefined, y: string | undefined): boolean {
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

export interface QueueTrack {
  accountId: string
  path: string
  name: string
  dir: string
  artist?: string
  album?: string
}

export interface TrackRef {
  accountId: string
  path: string
  name: string
  artist?: string
  album?: string
}

export interface Playlist {
  id: string
  name: string
  tracks: TrackRef[]
  trackSort?: TrackSort // 歌单内歌曲排序方式
  updatedAt?: number // 最近更新时间（用于「最近更新」排序）
}

// 按 trackSort 计算实际播放/展示顺序（'added'/'custom' 用存储顺序，其余按字段排序）
export function orderedTracks(pl: Playlist): TrackRef[] {
  const m = pl.trackSort || 'added'
  if (m === 'added' || m === 'custom') return pl.tracks
  const key = (t: TrackRef) =>
    (m === 'name' ? t.name : m === 'artist' ? t.artist || '' : t.album || '').toLowerCase()
  return [...pl.tracks].sort((a, b) => key(a).localeCompare(key(b), 'zh'))
}

const defaultSettings: Settings = {
  skin: 'midnight',
  accent: '#1db954',
  glass: false,
  glassBlur: 14,
  bgImage: null,
  bgGradient: null,
  playlistSort: 'custom',
  playMode: 'order',
  volume: 0.8,
  eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  autoFullscreen: false
}

interface State {
  accounts: Account[]
  activeAccount: string | null
  currentDir: string
  files: FileItem[]
  loading: boolean
  queue: QueueTrack[]
  currentIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  settings: Settings
  favorites: TrackRef[]
  playlists: Playlist[]
  searchResults: FileItem[] | null
  lyrics: LrcLine[]
  currentLyric: string
  showLyrics: boolean
  showEq: boolean
  showSettings: boolean
  showPlaylist: boolean
  showInfo: boolean
  showNowPlaying: boolean
  desktopLyric: boolean
  toast: string
  trackInfo: { artistBio?: string; albumName?: string; albumYear?: string } | null
  infoLoading: boolean
  pendingSeek: number | null
  // 已解析的曲目元数据（优先取音频内嵌标签，回退文件名解析），按 账号::路径 缓存，避免重复拉取
  trackMeta: Record<string, { artist?: string; album?: string; title?: string; year?: string; duration?: number }>
  // actions
  loadAccounts: () => Promise<void>
  addAccount: (acc: Account) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  openDir: (acct: string, dir: string) => Promise<void>
  playFile: (file: FileItem, acct: string) => Promise<void>
  addToQueue: (file: FileItem, acct: string) => void
  selectTrack: (i: number) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  setProgress: (t: number) => void
  isSeeking: boolean
  setSeeking: (v: boolean) => void
  setDuration: (d: number) => void
  setVolume: (v: number) => void
  setPlayMode: (m: Settings['playMode']) => void
  toggleFavorite: (t: TrackRef) => void
  isFavorite: (path: string) => boolean
  createPlaylist: (name: string) => void
  addToPlaylist: (plId: string, t: TrackRef) => void
  removeFromPlaylist: (plId: string, path: string) => void
  setPlaylistSort: (m: PlaylistSort) => void
  setTrackSort: (plId: string, m: TrackSort) => void
  movePlaylist: (dragId: string, targetId: string) => void
  moveTrack: (plId: string, dragPath: string, targetPath: string) => void
  importFolderAsPlaylist: (acct: string, dir: string) => Promise<void>
  playPlaylist: (plId: string) => void
  playAllPlaylists: (shuffle?: boolean) => void
  removePlaylist: (id: string) => void
  restorePlayback: () => Promise<void>
  setToast: (t: string) => void
  saveSettings: () => void
  doSearch: (kw: string) => Promise<void>
  clearSearch: () => void
  loadLyrics: (acct: string, path: string) => Promise<void>
  setLyric: (text: string) => void
  toggle: (k: 'showLyrics' | 'showEq' | 'showSettings' | 'showPlaylist' | 'desktopLyric' | 'showInfo') => void
  setShowNowPlaying: (v: boolean) => void
  seek: (v: number) => void
  copyTrackTo: (plId: string, path: string, targetId: string) => void
  moveTrackTo: (plId: string, path: string, targetId: string) => void
  setEq: (eq: number[]) => void
  fetchTrackInfo: (artist: string, album: string, title?: string, force?: boolean) => Promise<void>
  fetchOnlineLyrics: (silent?: boolean) => Promise<void>
  resolveMeta: (acct: string, path: string, force?: boolean) => Promise<{ artist?: string; album?: string; title?: string; year?: string; duration?: number }>
}

function fileToQueue(f: FileItem, acct: string): QueueTrack {
  const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
  return { accountId: acct, path: f.path, name: f.name, dir }
}

// 在队列里从 from 之后寻找下一首「可播放」曲目（跳过 WMA/APE 等无解码器的格式），
// 到队尾则绕回开头；找不到任何可播放曲目时返回 -1（避免对不可播放文件死循环）。
function nextPlayableIndex(queue: QueueTrack[], from: number, mode: Settings['playMode']): number {
  const n = queue.length
  if (n === 0) return -1
  const playable = queue.map((t, idx) => (isPlayable(t.name) ? idx : -1)).filter((x) => x >= 0)
  if (playable.length === 0) return -1
  if (mode === 'loop-one') {
    if (isPlayable(queue[from]?.name || '')) return from
    const k = playable.findIndex((x) => x > from)
    return k >= 0 ? playable[k] : playable[0]
  }
  if (mode === 'shuffle') {
    return playable[Math.floor(Math.random() * playable.length)]
  }
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n
    if (isPlayable(queue[cand].name)) return cand
  }
  return -1
}

export const useStore = create<State>((set, get) => ({
  accounts: [],
  activeAccount: null,
  currentDir: '',
  files: [],
  loading: false,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  settings: defaultSettings,
  favorites: [],
  playlists: [],
  searchResults: null,
  lyrics: [],
  currentLyric: '',
  showLyrics: true,
  showEq: false,
  showSettings: false,
  showPlaylist: false,
  showInfo: false,
  showNowPlaying: false,
  trackInfo: null,
  infoLoading: false,
  desktopLyric: false,
  trackMeta: {},
  toast: '',
  pendingSeek: null,
  isSeeking: false,

  loadAccounts: async () => {
    const accounts = await api.accounts.list()
    set({ accounts })
    const savedRaw: any = (await api.store.get('settings')) || {}
    // 兼容旧版：theme(dark/light) -> skin
    if (savedRaw.theme && !savedRaw.skin) {
      savedRaw.skin = savedRaw.theme === 'light' ? 'light' : 'midnight'
    }
    const fav = await api.store.get('favorites')
    const pls = await api.store.get('playlists')
    // 缓存版本不符（解析逻辑变过）→ 丢弃旧 trackMeta，重新解析，避免旧错误结果留存
    const tmetaVer = await api.store.get('trackMetaVer')
    const tmeta = tmetaVer === TRACKMETA_VER ? (await api.store.get('trackMeta')) || {} : {}
    // 恢复上次所在网盘与目录（仅当该账号仍存在），避免每次刷新都退回「账号管理」页，造成「数据没了」的错觉
    const savedActive = await api.store.get('activeAccount')
    const savedDir = await api.store.get('currentDir')
    const activeAccount = accounts.some((a) => a.id === savedActive) ? savedActive : null
    set({
      settings: { ...defaultSettings, ...savedRaw },
      favorites: fav || [],
      playlists: pls || [],
      trackMeta: tmeta,
      activeAccount,
      currentDir: activeAccount ? savedDir || '/' : '/'
    })
  },
  addAccount: async (acc) => {
    await api.accounts.save(acc)
    await get().loadAccounts()
  },
  removeAccount: async (id) => {
    await api.accounts.delete(id)
    await get().loadAccounts()
    // 删掉的是当前正在用的账号时，清空 activeAccount，否则 FileBrowser 会拿着已删除的 id 去列目录报错
    if (get().activeAccount === id) {
      set({ activeAccount: '', currentDir: '/', files: [], searchResults: null })
    }
  },
  openDir: async (acct, dir) => {
    set({ loading: true, searchResults: null })
    try {
      const files = await api.files.list(acct, dir)
      set({ activeAccount: acct, currentDir: dir, files, loading: false })
    } catch (e: any) {
      set({ files: [], loading: false })
      get().setToast(`无法打开目录「${dir}」：${e?.message || '连接失败，请检查网盘地址/账号'}`)
    }
  },
  playFile: async (file, acct) => {
    if (!isPlayable(file.name)) {
      const ext = (file.name.split('.').pop() || '').toUpperCase() || '该'
      get().setToast(`「${file.name}」是 ${ext} 格式，当前播放引擎不支持解码（WMA / APE 需专有解码器），请转换为 MP3 / FLAC 后播放`)
      return
    }
    const q = fileToQueue(file, acct)
    const queue = [...get().queue]
    const idx = queue.findIndex((t) => t.path === q.path)
    const currentIndex = idx >= 0 ? idx : queue.length
    if (idx < 0) queue.push(q)
    set({ queue, currentIndex, isPlaying: true, currentTime: 0 })
    // 显式播放一首歌时自动跳转到全屏播放主界面（自检模式不跳，避免干扰测试）
    const isSelftest = new URLSearchParams(location.search).get('selftest') === '1'
    if (!isSelftest && get().settings.autoFullscreen) set({ showNowPlaying: true })
    await get().loadLyrics(acct, file.path)
  },
  addToQueue: (file, acct) => {
    const q = fileToQueue(file, acct)
    if (get().queue.some((t) => t.path === q.path)) return
    set({ queue: [...get().queue, q] })
  },
  selectTrack: (i) => {
    if (i < 0 || i >= get().queue.length) return
    set({ currentIndex: i, isPlaying: true, currentTime: 0 })
    const t = get().queue[i]
    get().loadLyrics(t.accountId, t.path)
  },
  togglePlay: () => {
    const { queue, currentIndex } = get()
    if (!queue.length || currentIndex < 0) return
    set({ isPlaying: !get().isPlaying })
  },
  next: () => {
    const { queue, currentIndex, settings } = get()
    if (!queue.length) return
    let i = currentIndex
    if (settings.playMode === 'shuffle') {
      i = Math.floor(Math.random() * queue.length)
    } else if (settings.playMode === 'loop-one') {
      i = currentIndex
    } else {
      i = currentIndex + 1
      if (i >= queue.length) i = settings.playMode === 'order' ? 0 : 0
    }
    set({ currentIndex: i, isPlaying: true, currentTime: 0 })
    const t = queue[i]
    get().loadLyrics(t.accountId, t.path)
  },
  prev: () => {
    const { queue, currentIndex } = get()
    if (!queue.length) return
    let i = currentIndex - 1
    if (i < 0) i = queue.length - 1
    set({ currentIndex: i, isPlaying: true, currentTime: 0 })
    const t = queue[i]
    get().loadLyrics(t.accountId, t.path)
  },
  setProgress: (t) => set({ currentTime: t }),
  setSeeking: (v) => set({ isSeeking: v }),
  setShowNowPlaying: (v) => set({ showNowPlaying: v }),
  seek: (v) => {
    if (_audioEl) _audioEl.currentTime = v
    set({ currentTime: v })
  },
  setDuration: (d) => set({ duration: d }),
  setVolume: (v) => {
    set({ settings: { ...get().settings, volume: v } })
    get().saveSettings()
  },
  setPlayMode: (m) => {
    set({ settings: { ...get().settings, playMode: m } })
    get().saveSettings()
  },
  toggleFavorite: (t) => {
    const fav = get().favorites
    const exists = fav.some((f) => f.path === t.path)
    const favorites = exists ? fav.filter((f) => f.path !== t.path) : [...fav, t]
    set({ favorites })
    api.store.set('favorites', favorites)
  },
  isFavorite: (path) => get().favorites.some((f) => f.path === path),
  createPlaylist: (name) => {
    const pls = [...get().playlists, { id: Date.now().toString() + Math.random().toString().slice(2, 6), name, tracks: [], trackSort: 'added' as TrackSort, updatedAt: Date.now() }]
    set({ playlists: pls })
    api.store.set('playlists', pls)
  },
  addToPlaylist: (plId, t) => {
    const pls = get().playlists.map((p) =>
      p.id === plId && !p.tracks.some((x) => x.path === t.path)
        ? { ...p, tracks: [...p.tracks, t], updatedAt: Date.now() }
        : p
    )
    set({ playlists: pls })
    api.store.set('playlists', pls)
  },
  importFolderAsPlaylist: async (acct, dir) => {
    const items = await api.files.list(acct, dir)
    const subDirs = items.filter((i) => i.isDir)
    const mkTracks = (files: FileItem[]) => files.map((f) => ({ accountId: acct, path: f.path, name: f.name }))
    // 用「路径集合」生成指纹，判断目录内容是否一致（顺序无关）
    const sig = (tracks: { path: string }[]) => tracks.map((t) => t.path).sort().join('\u0000')
    let changed = 0 // 新增或内容有变动的歌单
    let skipped = 0 // 已存在且内容完全一致的歌单（直接跳过）
    let touched = false // 是否有过任何一次写入（用于提示）

    // 比对后写入：同名歌单已存在且曲目集合一致 → 跳过；否则整体替换为最新集合
    const upsert = (name: string, files: FileItem[]) => {
      if (!files.length) return
      const pls = [...get().playlists]
      const tracks = mkTracks(files)
      const existing = pls.find((p) => p.name === name)
      if (existing) {
        if (sig(existing.tracks) === sig(tracks)) {
          skipped++
          return // 无变动，不重写
        }
        existing.tracks = tracks // 有变动：整体替换（补新增 + 去掉已删除）
        existing.updatedAt = Date.now()
      } else {
        pls.push({ id: Date.now().toString() + Math.random().toString().slice(2, 6), name, tracks, trackSort: 'added' as TrackSort, updatedAt: Date.now() })
      }
      set({ playlists: pls })
      api.store.set('playlists', pls)
      touched = true
      changed++
    }

    if (subDirs.length) {
      // 总目录：每个子目录各自变成一个歌单（子目录内音频递归收集）
      for (const d of subDirs) {
        const audios = await api.files.collectAudio(acct, d.path)
        upsert(d.name, audios)
      }
      // 总目录根下直接散落的歌曲，也归到一个以总目录命名的歌单
      const direct = items.filter((i) => !i.isDir && isAudioName(i.name))
      if (direct.length) {
        const rootName = (dir.split('/').filter(Boolean).pop() || dir) + '（根目录歌曲）'
        upsert(rootName, direct)
      }
    } else {
      // 扁平专辑目录：整个目录变成一个歌单
      const audios = await api.files.collectAudio(acct, dir)
      const name = dir.split('/').filter(Boolean).pop() || dir
      upsert(name, audios)
    }

    if (!touched && !skipped) get().setToast('该文件夹内没有音乐文件')
    else if (!touched) get().setToast(`歌单无变动，已跳过 ${skipped} 个`)
    else get().setToast(`已更新/新增 ${changed} 个歌单${skipped ? `，跳过 ${skipped} 个未变动` : ''}`)
  },
  setPlaylistSort: (m) => {
    set({ settings: { ...get().settings, playlistSort: m } })
    get().saveSettings()
  },
  setTrackSort: (plId, m) => {
    const pls = get().playlists.map((p) => (p.id === plId ? { ...p, trackSort: m } : p))
    set({ playlists: pls })
    api.store.set('playlists', pls)
  },
  movePlaylist: (dragId, targetId) => {
    const pls = [...get().playlists]
    const from = pls.findIndex((p) => p.id === dragId)
    const to = pls.findIndex((p) => p.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const [m] = pls.splice(from, 1)
    pls.splice(to, 0, m)
    set({ playlists: pls, settings: { ...get().settings, playlistSort: 'custom' } })
    api.store.set('playlists', pls)
    get().saveSettings()
  },
  moveTrack: (plId, dragPath, targetPath) => {
    const pls = get().playlists.map((p) => {
      if (p.id !== plId) return p
      const tracks = [...p.tracks]
      const from = tracks.findIndex((t) => t.path === dragPath)
      const to = tracks.findIndex((t) => t.path === targetPath)
      if (from < 0 || to < 0 || from === to) return p
      const [mv] = tracks.splice(from, 1)
      tracks.splice(to, 0, mv)
      return { ...p, tracks, trackSort: 'custom' as TrackSort, updatedAt: Date.now() }
    })
    set({ playlists: pls })
    api.store.set('playlists', pls)
  },
  playPlaylist: (plId) => {
    const pl = get().playlists.find((p) => p.id === plId)
    if (!pl || !pl.tracks.length) return
    const ordered = orderedTracks(pl)
    const queue = ordered.map((t) => {
      const dir = t.path.includes('/') ? t.path.slice(0, t.path.lastIndexOf('/')) : ''
      return { accountId: t.accountId, path: t.path, name: t.name, dir }
    })
    set({ queue, currentIndex: 0, isPlaying: true, currentTime: 0 })
    const isSelftest = new URLSearchParams(location.search).get('selftest') === '1'
    if (!isSelftest && get().settings.autoFullscreen) set({ showNowPlaying: true })
    get().loadLyrics(queue[0].accountId, queue[0].path)
    get().setToast(`正在播放歌单《${pl.name}》`)
  },
  playAllPlaylists: (shuffle) => {
    // 汇总所有歌单的歌曲（按 path 去重），可随机打乱后整体放入播放队列
    const all = get().playlists.flatMap((p) => p.tracks)
    if (!all.length) {
      get().setToast('还没有任何歌曲，先导入或加入歌单吧')
      return
    }
    const seen = new Set<string>()
    let tracks = all.filter((t) => {
      if (seen.has(t.path)) return false
      seen.add(t.path)
      return true
    })
    if (shuffle) {
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
      }
    }
    const queue = tracks.map((t) => {
      const dir = t.path.includes('/') ? t.path.slice(0, t.path.lastIndexOf('/')) : ''
      return { accountId: t.accountId, path: t.path, name: t.name, dir }
    })
    set({
      queue,
      currentIndex: 0,
      isPlaying: true,
      currentTime: 0,
      settings: { ...get().settings, playMode: shuffle ? 'shuffle' : get().settings.playMode }
    })
    const isSelftest = new URLSearchParams(location.search).get('selftest') === '1'
    if (!isSelftest && get().settings.autoFullscreen) set({ showNowPlaying: true })
    get().loadLyrics(queue[0].accountId, queue[0].path)
    get().setToast(shuffle ? `🔀 随机播放全部歌单（${queue.length} 首）` : `▶ 播放全部歌单（${queue.length} 首）`)
  },
  removePlaylist: (id) => {
    const pls = get().playlists.filter((p) => p.id !== id)
    set({ playlists: pls })
    api.store.set('playlists', pls)
  },
  restorePlayback: async () => {
    try {
      const queue = await api.store.get('queue')
      const currentIndex = await api.store.get('currentIndex')
      const currentTime = (await api.store.get('currentTime')) || 0
      if (
        Array.isArray(queue) &&
        queue.length &&
        Number.isInteger(currentIndex) &&
        currentIndex >= 0 &&
        currentIndex < queue.length
      ) {
        // 恢复上次队列与位置，但不自动播放（停在原点，用户点播放即续播）
        set({ queue, currentIndex, currentTime, pendingSeek: currentTime, isPlaying: false })
      }
    } catch {
      /* 忽略：无记录时保持默认 */
    }
  },
  removeFromPlaylist: (plId, path) => {
    const pls = get().playlists.map((p) =>
      p.id === plId ? { ...p, tracks: p.tracks.filter((t) => t.path !== path), updatedAt: Date.now() } : p
    )
    set({ playlists: pls })
    api.store.set('playlists', pls)
  },
  copyTrackTo: (plId, path, targetId) => {
    if (plId === targetId) return
    const pls = get().playlists
    const src = pls.find((p) => p.id === plId)
    const target = pls.find((p) => p.id === targetId)
    const track = src?.tracks.find((t) => t.path === path)
    if (!track || !target) return
    const next = pls.map((p) =>
      p.id === targetId && !p.tracks.some((t) => t.path === track.path)
        ? { ...p, tracks: [...p.tracks, track], updatedAt: Date.now() }
        : p
    )
    set({ playlists: next })
    api.store.set('playlists', next)
    get().setToast(`已复制《${track.name}》到《${target.name}》`)
  },
  moveTrackTo: (plId, path, targetId) => {
    if (plId === targetId) return
    const pls = get().playlists
    const src = pls.find((p) => p.id === plId)
    const target = pls.find((p) => p.id === targetId)
    const track = src?.tracks.find((t) => t.path === path)
    if (!track || !target) return
    const next = pls.map((p) => {
      if (p.id === plId) return { ...p, tracks: p.tracks.filter((t) => t.path !== path), updatedAt: Date.now() }
      if (p.id === targetId && !p.tracks.some((t) => t.path === track.path))
        return { ...p, tracks: [...p.tracks, track], updatedAt: Date.now() }
      return p
    })
    set({ playlists: next })
    api.store.set('playlists', next)
    get().setToast(`已移动《${track.name}》到《${target.name}》`)
  },
  setToast: (t) => {
    set({ toast: t })
    if (t) setTimeout(() => { if (get().toast === t) set({ toast: '' }) }, 2600)
  },
  saveSettings: () => {
    api.store.set('settings', get().settings)
  },
  doSearch: async (kw) => {
    const { activeAccount, currentDir } = get()
    if (!activeAccount || !kw.trim()) {
      set({ searchResults: null, loading: false })
      return
    }
    set({ loading: true })
    try {
      const res = await api.files.search(activeAccount, currentDir || '/', kw.trim())
      set({ searchResults: res, loading: false })
    } catch {
      set({ searchResults: [], loading: false })
    }
  },
  clearSearch: () => set({ searchResults: null }),
  loadLyrics: async (acct, path) => {
    // 1) 先尝试本地同名 .lrc
    try {
      const url = await api.stream.lyricsUrl(acct, path)
      const res = await fetch(url)
      const text = await res.text()
      if (text && text.trim()) {
        set({ lyrics: parseLrc(text) })
        return
      }
    } catch {
      /* ignore */
    }
    // 2) 本地没有 → 在线获取（优先用音频内嵌标签的精确歌手/歌名，回退文件名解析）
    const m = await get().resolveMeta(acct, path)
    if (m.artist || m.title) {
      try {
        const online = await api.lyrics.online(m.artist || '', m.title || '')
        if (online) {
          set({ lyrics: parseLrc(online) })
          return
        }
      } catch {
        /* ignore */
      }
    }
    set({ lyrics: [] })
  },
  // 解析曲目元数据：优先读取音频文件内嵌标签（精确），失败/无标签时回退文件名解析。
  // 文件名/标题支持「横线」与「单个空格」两种两段分隔（用户库两种都有：
  // 「歌手-歌名」「歌名-歌手」用横线；「歌名 歌手」用空格，如「哭海 张惠妹」）。
  // 横线优先（横线极少出现在名字内部）；横线拆不开且恰好被单个空格分成两段时，再按空格拆。
  // 结果缓存到 trackMeta（落盘），同一首歌只联网读一次标签。
  resolveMeta: async (acct, path, force = false) => {
    const name = path.split('/').pop() || ''
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const key = `${acct}::${path}`
    const cached = get().trackMeta[key]
    // 缓存命中但标题疑似被旧逻辑错标成「歌手 歌名 / 歌手-歌名」整体 → 视为过期，重新解析
    const cachedLooksStale = !!cached?.title && splitNameParts(cached.title).length >= 2
    if (cached && !force && !cachedLooksStale) return cached
    const parts = splitNameParts(name.replace(/\.[^.]+$/, '').replace(/^\s*\d+[\s.\-_]+/, ''))
    // 文件名两段且目录未确认歌手时，用网易云歌曲搜索判定谁是歌手（仅当能明确对应才采用）。
    // force=true 时（无内嵌标签）即使已有文件名假设也用判定结果覆盖；否则只补缺失的歌手/歌名。
    const tryDisambiguate = async (artist?: string, title?: string, force = false) => {
      if (parts.length === 2 && api.meta.disambiguate && !fb.artistFromDir) {
        // 仅在有缺失、或强迫覆盖、或现有 title 疑似被错标成「歌手-歌名」整体（含横线/空格）时才联网判定，
        // 避免对正常内嵌标签多余请求；但整体化标签必须纠正，否则封面/歌词会按整串去搜而失败。
        const titleLooksSplit = !!title && splitNameParts(title).length >= 2
        if (force || !artist || !title || titleLooksSplit) {
          try {
            const ord = await api.meta.disambiguate(parts[0], parts[1])
            if (ord?.artist) {
              if (force || !artist) artist = ord.artist
              if (force || !title || titleLooksSplit) title = ord.title
            }
          } catch {
            /* 网络失败则回退文件名/目录解析 */
          }
        }
      }
      return { artist, title }
    }
    let tags: { artist?: string; album?: string; title?: string; year?: string; duration?: number } | null = null
    if (api.meta.tags) {
      try {
        tags = await api.meta.tags(acct, path)
      } catch {
        tags = null
      }
    }
    let resolved: { artist?: string; album?: string; title?: string; year?: string; duration?: number }
    const fb = parseMeta(name, dir)
    // 内嵌 title 若像「歌手-歌名」整体（可拆两段），说明被错标成整串。
    // 这种文件通常「内嵌歌手」是对的（如「哭海 张惠妹」artist=张惠妹），只有 title 错；
    // 故保留内嵌 artist，用「文件名分段中哪段 == 内嵌 artist」定序，无需联网即可正确。
    const titleLooksSplit = !!tags?.title && splitNameParts(tags.title).length >= 2
    const artistClean = tags?.artist && splitNameParts(tags.artist).length < 2 ? tags.artist : undefined
    if (tags && (tags.artist || tags.album || tags.title || tags.year || typeof tags.duration === 'number') && !titleLooksSplit) {
      const { artist, title } = await tryDisambiguate(tags.artist || undefined, tags.title || undefined)
      resolved = {
        artist: artist || fb.artist,
        album: tags.album || fb.album,
        title: title || fb.title,
        year: tags.year,
        duration: typeof tags.duration === 'number' ? tags.duration : undefined
      }
    } else if (titleLooksSplit && parts.length === 2) {
      // 标题错标成整体：以内嵌 artist 为锚，命中文件名哪段就是歌手，另一段是歌名
      let artist = artistClean
      let title: string | undefined
      if (artist) {
        if (nameMatch(parts[0], artist)) {
          artist = parts[0]
          title = parts[1]
        } else if (nameMatch(parts[1], artist)) {
          artist = parts[1]
          title = parts[0]
        }
      }
      // 内嵌 artist 无帮助（也被错标/缺失）→ 用消歧兜底
      if (!title && api.meta.disambiguate && !fb.artistFromDir) {
        try {
          const ord = await api.meta.disambiguate(parts[0], parts[1])
          if (ord?.artist) {
            artist = ord.artist
            title = ord.title
          }
        } catch {
          /* 网络失败则回退 */
        }
      }
      if (!title) title = parts.join(' ') // 仍无法确定：整串当歌名，至少不整反
      resolved = {
        artist: artist || fb.artist,
        album: tags?.album || fb.album,
        title,
        year: tags?.year,
        duration: typeof tags?.duration === 'number' ? tags.duration : undefined
      }
    } else {
      // 无标签，或无法分段：文件名解析（歌手-歌名格式天然正确）+ 消歧兜底
      const { artist, title } = await tryDisambiguate(fb.artist, fb.title, true)
      resolved = {
        artist: artist || fb.artist,
        album: tags?.album || fb.album,
        title: title || fb.title,
        year: tags?.year,
        duration: typeof tags?.duration === 'number' ? tags.duration : undefined
      }
    }
    set((s) => ({ trackMeta: { ...s.trackMeta, [key]: resolved } }))
    return resolved
  },

  fetchTrackInfo: async (artist, album, title, force) => {
    // 歌手/专辑/歌名 至少要有一个，才值得去网络查询（否则任何数据源都查不到）
    if (!artist && !album && !title) {
      set({ trackInfo: null })
      return
    }
    set({ infoLoading: true })
    try {
      const info = await api.meta.info(artist || '', album || '', title || '', force)
      set({ trackInfo: info })
    } catch {
      set({ trackInfo: null })
    } finally {
      set({ infoLoading: false })
    }
  },
  fetchOnlineLyrics: async () => {
    const cur = get().queue[get().currentIndex]
    if (!cur) return
    const m = await get().resolveMeta(cur.accountId, cur.path)
    try {
      const online = await api.lyrics.online(m.artist || '', m.title || '')
      if (online) {
        set({ lyrics: parseLrc(online) })
        get().setToast('已获取在线歌词')
        return
      }
    } catch {
      /* ignore */
    }
    get().setToast('未找到在线歌词')
  },
  setLyric: (text) => set({ currentLyric: text }),
  // 侧边面板（歌词/播放队列/歌曲信息/均衡器/设置）互斥：同一时间只显示一个右列面板。
  // 非侧边类（如 desktopLyric）仍按原逻辑独立切换。
  toggle: (k) =>
    set((st) => {
      const SIDE = ['showLyrics', 'showPlaylist', 'showInfo', 'showEq', 'showSettings'] as const
      if ((SIDE as readonly string[]).includes(k)) {
        const open = !(st as any)[k]
        const next: any = {}
        for (const f of SIDE) next[f] = false
        next[k] = open
        return next
      }
      return { [k]: !(st as any)[k] } as any
    }),
  setEq: (eq) => {
    set({ settings: { ...get().settings, eq } })
    get().saveSettings()
  }
}))

// 全局自动保存：任何状态变化（队列/进度/收藏/歌单/设置等）都防抖落盘，
// 避免某些操作忘记显式保存导致重启后记录丢失。
let saveTimer: any
useStore.subscribe((state) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      api.store.set('queue', state.queue)
      api.store.set('currentIndex', state.currentIndex)
      api.store.set('currentTime', state.currentTime)
      api.store.set('favorites', state.favorites)
      api.store.set('playlists', state.playlists)
      api.store.set('settings', state.settings)
      api.store.set('trackMeta', state.trackMeta)
      api.store.set('trackMetaVer', TRACKMETA_VER)
      api.store.set('activeAccount', state.activeAccount)
      api.store.set('currentDir', state.currentDir)
    } catch {
      /* 忽略写入异常 */
    }
  }, 500)
})

// 关闭前再强制落盘一次，确保最后的播放进度不丢
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const s = useStore.getState()
    try {
      api.store.set('queue', s.queue)
      api.store.set('currentIndex', s.currentIndex)
      api.store.set('currentTime', s.currentTime)
    } catch {
      /* ignore */
    }
  })
}
