import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useStore, orderedTracks, type TrackSort, type PlaylistSort } from './store'
import { api, isAudioName, parseMeta } from './api'
import { isMobileApp } from './device'
import Connections from './components/Connections'
import FileBrowser from './components/FileBrowser'
import PlayerBar from './components/PlayerBar'
import LyricsPanel from './components/LyricsPanel'
import EqPanel from './components/EqPanel'
import SettingsPanel from './components/SettingsPanel'
import PlaylistPanel from './components/PlaylistPanel'
import InfoPanel from './components/InfoPanel'
import NowPlaying from './components/NowPlaying'
import { MobileTopBar, MobileBottomBar, type MobileTab } from './components/MobileShell'
import MobileNowPlaying from './components/MobileNowPlaying'
import MobileMore from './components/MobileMore'
import MobileContent from './components/MobileContent'
import {
  IconLibrary,
  IconHeart,
  IconList,
  IconDisc,
  IconLyrics,
  IconSliders,
  IconSettings,
  IconMusic,
  IconFolder,
  IconPlay,
  IconShuffle,
  IconPlus,
  IconSearch,
  IconClose,
  IconExpand,
  IconMonitor,
  IconInfo,
  IconDrag,
  IconChevronRight,
  IconTrash,
  IconHeartFilled
} from './components/Icons'

export type View = 'library' | 'favorites' | 'playlists' | 'queue'

export default function App() {
  const { loadAccounts, restorePlayback, settings, toggle, toast, showNowPlaying, setShowNowPlaying } = useStore()
  const [view, setView] = useState<View>('library')
  const [mobileTab, setMobileTab] = useState<MobileTab>('library')
  const [mobileSearch, setMobileSearch] = useState(false)
  const [mobile, setMobile] = useState(() => isMobileApp())
  const s = useStore()
  // 手机端是否处于「搜索结果」状态（用于显示返回按钮）
  const showSearch = !!s.searchResults
  const withSide = s.showLyrics || s.showPlaylist || s.showInfo || s.showEq || s.showSettings

  useEffect(() => {
    loadAccounts().then(() => restorePlayback())
  }, [])

  // 设备形态跟随视口变化（手机横竖屏切换、桌面窗口缩放）
  useEffect(() => {
    const onResize = () => setMobile(isMobileApp())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  // 手机端：把 <html> 挂上 .mobile，样式与安全区变量一并生效
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('mobile', mobile)
    // 手机上没有常驻播放条，点歌的预期就是直接进入全屏播放页。
    // 仅在用户从未手动改过该设置时套用（用户显式关掉过就不覆盖）。
    if (mobile) {
      const cur = useStore.getState().settings.autoFullscreen
      if (!cur) useStore.getState().patchSettings({ autoFullscreen: true })
    }
    // 安全区像素值注入 CSS 变量，供 calc() 使用
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);'
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    root.style.setProperty('--sa-top', `${parseFloat(cs.paddingTop) || 0}px`)
    root.style.setProperty('--sa-bottom', `${parseFloat(cs.paddingBottom) || 0}px`)
    document.body.removeChild(probe)
    // 手机浏览器地址栏会动态改变视口高度，用 dvh 变量兜底
    root.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
  }, [mobile])

  // 自检模式：?selftest=1 —— 自动连接本地测试 WebDAV 并播放第一首，结果由 PlayerBar 上报
  useEffect(() => {
    if (new URLSearchParams(location.search).get('selftest') !== '1') return
    ;(async () => {
      try {
        await api.accounts.save({ id: 'selftest', name: '自检', url: 'http://127.0.0.1:7777/dav', username: '', password: '' })
        await loadAccounts()
        await s.openDir('selftest', '/')
        const files = useStore.getState().files
        const f = files.find((x) => isAudioName(x.name))
        if (f) await s.playFile(f, 'selftest')
        else api.selftest.result({ done: true, error: '未找到音频文件', files })
      } catch (e: any) {
        api.selftest.result({ done: true, error: String(e?.message || e) })
      }
    })()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = settings.skin
    root.style.setProperty('--accent', settings.accent)
    root.dataset.glass = settings.glass ? 'on' : 'off'
    root.style.setProperty('--glass-blur', (settings.glassBlur || 14) + 'px')
  }, [settings.skin, settings.accent, settings.glass, settings.glassBlur])

  // 背景图层：优先背景图，其次渐变，否则透明（露出皮肤纯色）
  const bgStyle: CSSProperties = settings.bgImage
    ? { backgroundImage: `url(${settings.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : settings.bgGradient
    ? { background: settings.bgGradient }
    : {}

  const favCount = s.favorites.length
  const trackTotal = s.playlists.reduce((n, p) => n + p.tracks.length, 0)

  const navItems: Array<{ key: View | 'np'; icon: JSX.Element; cls: string; label: string; count?: number; onClick: () => void }> = [
    { key: 'library', icon: <IconLibrary size={13} />, cls: 'ic-red', label: '音乐库', onClick: () => setView('library') },
    { key: 'favorites', icon: <IconHeart size={13} />, cls: 'ic-purple', label: '我的收藏', count: favCount || undefined, onClick: () => setView('favorites') },
    { key: 'playlists', icon: <IconList size={13} />, cls: 'ic-blue', label: '歌单', count: trackTotal || undefined, onClick: () => setView('playlists') },
    { key: 'np', icon: <IconDisc size={13} />, cls: 'ic-pink', label: '正在播放', onClick: () => setShowNowPlaying(true) }
  ]

  const sideItems: Array<{ key: 'showPlaylist' | 'showLyrics' | 'showEq' | 'showSettings'; icon: JSX.Element; label: string; on: boolean }> = [
    { key: 'showPlaylist', icon: <IconMusic size={16} />, label: '播放队列', on: s.showPlaylist },
    { key: 'showLyrics', icon: <IconLyrics size={16} />, label: '歌词', on: s.showLyrics },
    { key: 'showEq', icon: <IconSliders size={16} />, label: '均衡器', on: s.showEq },
    { key: 'showSettings', icon: <IconSettings size={16} />, label: '设置', on: s.showSettings }
  ]

  /* ==================== 手机端布局 ==================== */
  if (mobile) {
    // 「音乐库」内部有两态：未连接任何网盘时展示连接页，否则展示目录浏览
    const needConnect = !s.activeAccount || !s.accounts.length
    const mobileTitle = showSearch
      ? '搜索结果'
      : mobileTab === 'library'
      ? needConnect
        ? '连接网盘'
        : s.currentDir === '/'
        ? '音乐库'
        : s.currentDir.split('/').filter(Boolean).pop() || '音乐库'
      : mobileTab === 'favorites'
      ? '我的收藏'
      : mobileTab === 'playlists'
      ? '歌单'
      : '更多'

    return (
      <>
        <div className="app-bg" style={bgStyle} />
        <div className="app mobile-app">
          {/* 顺序必须是：顶部栏 → 滚动内容 → 底部栏，否则内容会被挤到 Tab 栏下面 */}
          <MobileTopBar
            title={mobileTitle}
            onSearch={mobileTab === 'library' && !needConnect ? () => setMobileSearch((v) => !v) : undefined}
            onSettings={mobileTab !== 'more' ? () => toggle('showSettings') : undefined}
            showBack={showSearch && mobileTab === 'library'}
            onBack={() => {
              useStore.getState().clearSearch()
              setMobileSearch(false)
            }}
          />

          <div className="top">
            <div className="main">
              <div className="m-content-wrap">
                {(mobileTab === 'library' || mobileTab === 'favorites' || mobileTab === 'playlists') && (
                  <MobileContent view={mobileTab} onSearchOpen={mobileSearch} />
                )}
                {mobileTab === 'more' && <MobileMore />}
              </div>
            </div>
          </div>

          <MobileBottomBar tab={mobileTab} onTab={setMobileTab} />

          {/* 侧边面板在手机端是底部抽屉 */}
          {withSide && <div className="m-scrim" onClick={() => useStore.getState().closeAllPanels()} />}
          {s.showPlaylist && <PlaylistPanel />}
          {s.showLyrics && <LyricsPanel />}
          {s.showInfo && <InfoPanel />}
          {s.showEq && <EqPanel />}
          {s.showSettings && <SettingsPanel />}

          {showNowPlaying && <MobileNowPlaying />}
          {toast && <div className="toast">{toast}</div>}
        </div>
      </>
    )
  }

  /* ==================== 桌面端布局 ==================== */
  return (
    <>
      <div className="app-bg" style={bgStyle} />
      <div className={`app${withSide ? ' with-side' : ''}`}>
        <div className="top">
          <aside className="sidebar">
            <div className="sidebar-head">
              <div className="brand">
                <span className="brand-mark">
                  <IconMusic size={14} />
                </span>
                <span className="brand-text">天剑音乐</span>
              </div>
            </div>

            <div className="sidebar-scroll">
              <div className="nav-section">资料库</div>
              {navItems.map((it) => (
                <div
                  key={it.key}
                  className={`nav-item ${
                    it.key === 'np' ? (showNowPlaying ? 'active' : '') : view === it.key ? 'active' : ''
                  }`}
                  onClick={it.onClick}
                >
                  <span className={`nav-icon ${it.cls}`}>{it.icon}</span>
                  <span className="nav-label">{it.label}</span>
                  {it.count ? <span className="nav-count">{it.count}</span> : null}
                </div>
              ))}

              <div className="nav-section">播放</div>
              {sideItems.map((it) => (
                <div
                  key={it.key}
                  className={`nav-item nav-plain ${it.on ? 'on' : ''}`}
                  onClick={() => toggle(it.key)}
                >
                  <span className="nav-icon">{it.icon}</span>
                  <span className="nav-label">{it.label}</span>
                </div>
              ))}
            </div>

            <div className="sidebar-foot">
              <span className="dot" />
              {s.queue.length ? `队列 ${s.currentIndex + 1}/${s.queue.length}` : '未在播放'}
            </div>
          </aside>

          <main className="main">
            {view === 'library' && (
              <>
                {!s.activeAccount || !s.accounts.length ? (
                  <Connections />
                ) : (
                  <FileBrowser />
                )}
              </>
            )}
            {view === 'favorites' && <FavoritesView />}
            {view === 'playlists' && <PlaylistsView />}
          </main>

          {s.showPlaylist && <PlaylistPanel />}
          {s.showLyrics && <LyricsPanel />}
          {s.showInfo && <InfoPanel />}
          {s.showEq && <EqPanel />}
          {s.showSettings && <SettingsPanel />}
        </div>

        <PlayerBar />

        {s.showNowPlaying && <NowPlaying />}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  )
}

/* ============================ 我的收藏 ============================ */

function FavoritesView() {
  const { favorites, playFile, toggleFavorite, addToQueue } = useStore()
  const [kw, setKw] = useState('')

  const list = useMemo(() => {
    const q = kw.trim().toLowerCase()
    if (!q) return favorites
    return favorites.filter((f) =>
      `${f.name} ${f.artist || ''} ${f.album || ''}`.toLowerCase().includes(q)
    )
  }, [favorites, kw])

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-title">我的收藏</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {favorites.length} 首
        </span>
        <span className="spacer" />
        <div className="search-box">
          <IconSearch size={16} />
          <input placeholder="搜索收藏…" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
      </div>
      <div className="main-body">
        {!favorites.length ? (
          <div className="empty">
            <div className="empty-icon">
              <IconHeart size={26} />
            </div>
            <div className="empty-title">还没有收藏的歌曲</div>
            <div className="empty-desc">在音乐库里把鼠标移到歌曲上，点击心形按钮即可收藏。</div>
          </div>
        ) : (
          <>
            <div className="page-head">
              <div>
                <h1 className="page-title">我的收藏</h1>
                <div className="page-sub">{favorites.length} 首歌曲</div>
              </div>
              <span className="spacer" />
              <div className="page-actions">
                <button
                  className="play-all-btn"
                  onClick={() => {
                    const first = list[0]
                    if (first) playFile({ name: first.name, path: first.path } as any, first.accountId)
                  }}
                >
                  <IconPlay size={14} /> 播放
                </button>
              </div>
            </div>

            <div className="list">
              {list.map((f, i) => (
                <div className="item" key={f.path + i}>
                  <span className="track-no">{i + 1}</span>
                  <span className="icon">
                    <IconMusic size={17} />
                  </span>
                  <span
                    className="name"
                    onClick={() => playFile({ name: f.name, path: f.path } as any, f.accountId)}
                  >
                    {f.name}
                  </span>
                  <span className="meta" style={{ width: 110, textAlign: 'right' }}>
                    {f.artist || ''}
                  </span>
                  <div className="row-actions">
                    <button
                      className="mini"
                      title="加入队列"
                      onClick={() => addToQueue({ name: f.name, path: f.path } as any, f.accountId)}
                    >
                      <IconPlus size={16} />
                    </button>
                    <button className="mini" title="取消收藏" onClick={() => toggleFavorite(f)}>
                      <IconHeartFilled size={16} style={{ color: 'var(--accent)' }} />
                    </button>
                  </div>
                </div>
              ))}
              {list.length === 0 && <div className="hint">没有匹配的收藏。</div>}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ============================ 歌单 ============================ */

function PlaylistsView() {
  const {
    playlists,
    settings,
    createPlaylist,
    playFile,
    playPlaylist,
    playAllPlaylists,
    removePlaylist,
    removeFromPlaylist,
    setPlaylistSort,
    setTrackSort,
    movePlaylist,
    moveTrack,
    copyTrackTo,
    moveTrackTo
  } = useStore()
  const [name, setName] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [dragPl, setDragPl] = useState<string | null>(null)
  const [dragTrack, setDragTrack] = useState<{ plId: string; path: string } | null>(null)
  const [kw, setKw] = useState('')
  const [picker, setPicker] = useState<null | { mode: 'copy' | 'move'; plId: string; path: string }>(null)
  const toggleOpen = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))
  const expandAll = () => setOpen(Object.fromEntries(playlists.map((p) => [p.id, true])))
  const collapseAll = () => setOpen({})

  // 跨所有歌单的模糊搜索：匹配 歌名/歌手/专辑（忽略大小写、忽略开头序号）
  const q = kw.trim().toLowerCase()
  const results = q
    ? playlists.flatMap((p) =>
        p.tracks
          .filter((t) => {
            const dir = t.path.includes('/') ? t.path.slice(0, t.path.lastIndexOf('/')) : ''
            const m = parseMeta(t.name, dir)
            const hay = `${t.name} ${m.artist || ''} ${m.album || ''} ${m.cleanTitle}`.toLowerCase()
            return hay.includes(q)
          })
          .map((t) => ({ plId: p.id, plName: p.name, track: t }))
      )
    : []

  const openPicker = (mode: 'copy' | 'move', plId: string, path: string) => setPicker({ mode, plId, path })
  const applyPicker = (targetId: string) => {
    if (!picker) return
    if (picker.mode === 'copy') copyTrackTo(picker.plId, picker.path, targetId)
    else moveTrackTo(picker.plId, picker.path, targetId)
    setPicker(null)
  }

  const sortMode = settings.playlistSort
  const ordered =
    sortMode === 'custom'
      ? playlists
      : [...playlists].sort((a, b) => {
          if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh')
          if (sortMode === 'count') return b.tracks.length - a.tracks.length
          if (sortMode === 'recent') return (b.updatedAt || 0) - (a.updatedAt || 0)
          return 0
        })

  const totalTracks = playlists.reduce((n, p) => n + p.tracks.length, 0)

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-title">歌单</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {playlists.length} 个 · {totalTracks} 首
        </span>
        <span className="spacer" />
        <div className="search-box">
          <IconSearch size={16} />
          <input
            placeholder="搜索歌单里的歌曲…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          {kw && (
            <button className="mini" style={{ width: 20, height: 20 }} onClick={() => setKw('')} title="清除">
              <IconClose size={13} />
            </button>
          )}
        </div>
        <select value={sortMode} onChange={(e) => setPlaylistSort(e.target.value as PlaylistSort)} title="歌单排序">
          <option value="custom">自定义拖拽</option>
          <option value="name">名称</option>
          <option value="count">歌曲数</option>
          <option value="recent">最近更新</option>
        </select>
        <button className="icon-btn" onClick={expandAll} title="展开全部">
          <IconChevronRight size={16} />
        </button>
        <button className="icon-btn" onClick={collapseAll} title="折叠全部">
          <IconChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
        </button>
      </div>

      <div className="main-body">
        {/* 搜索结果 */}
        {q ? (
          <>
            <div className="page-head">
              <div>
                <h1 className="page-title">搜索结果</h1>
                <div className="page-sub">「{kw}」匹配到 {results.length} 首</div>
              </div>
            </div>
            {results.length === 0 ? (
              <div className="hint">没有匹配的歌曲。</div>
            ) : (
              <div className="list">
                {results.map((r) => (
                  <div className="item" key={r.plId + r.track.path}>
                    <span className="icon">
                      <IconMusic size={17} />
                    </span>
                    <span
                      className="name"
                      onClick={() =>
                        playFile({ name: r.track.name, path: r.track.path } as any, r.track.accountId)
                      }
                    >
                      {r.track.name}
                    </span>
                    <span className="meta" style={{ width: 130, textAlign: 'right' }}>
                      {r.plName}
                    </span>
                    <div className="row-actions">
                      <button className="mini" title="复制到其他歌单" onClick={() => openPicker('copy', r.plId, r.track.path)}>
                        <IconPlus size={16} />
                      </button>
                      <button className="mini" title="移动到其他歌单" onClick={() => openPicker('move', r.plId, r.track.path)}>
                        <IconChevronRight size={16} />
                      </button>
                      <button className="mini" title="从歌单移出" onClick={() => removeFromPlaylist(r.plId, r.track.path)}>
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="page-head">
              <div>
                <h1 className="page-title">歌单</h1>
                <div className="page-sub">
                  {playlists.length} 个歌单 · 共 {totalTracks} 首（去重后可整体播放）
                </div>
              </div>
              <span className="spacer" />
              <div className="page-actions">
                <div className="search-box" style={{ minWidth: 170 }}>
                  <input
                    placeholder="新歌单名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && name) {
                        createPlaylist(name)
                        setName('')
                      }
                    }}
                  />
                </div>
                <button
                  className="play-all-btn ghost"
                  onClick={() => {
                    if (name) {
                      createPlaylist(name)
                      setName('')
                    }
                  }}
                >
                  <IconPlus size={15} /> 新建歌单
                </button>
                {totalTracks > 0 && (
                  <>
                    <button className="play-all-btn" onClick={() => playAllPlaylists(false)}>
                      <IconPlay size={14} /> 播放全部
                    </button>
                    <button className="play-all-btn ghost" onClick={() => playAllPlaylists(true)}>
                      <IconShuffle size={15} /> 随机
                    </button>
                  </>
                )}
              </div>
            </div>

            {!playlists.length ? (
              <div className="empty">
                <div className="empty-icon">
                  <IconList size={26} />
                </div>
                <div className="empty-title">还没有歌单</div>
                <div className="empty-desc">
                  在音乐库里点歌曲行的「＋」把歌加入歌单；或点文件夹的「导入歌单」把整张专辑 / 整个歌手目录一键导入。
                </div>
              </div>
            ) : (
              <div className="playlist-grid">
                {ordered.map((p) => {
                  const expanded = !!open[p.id]
                  const tracks = orderedTracks(p)
                  return (
                    <div
                      className={`card${expanded ? ' expanded' : ''}`}
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        const t = e.target as HTMLElement
                        if (t.closest('.item')) return
                        if (t.closest('button, input, select')) {
                          e.preventDefault()
                          return
                        }
                        setDragPl(p.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dragTrack) return
                        if (dragPl && dragPl !== p.id) movePlaylist(dragPl, p.id)
                        setDragPl(null)
                      }}
                      style={{ cursor: expanded ? 'default' : 'grab' }}
                    >
                      <div
                        className="row"
                        style={{ gap: 9, cursor: 'pointer' }}
                        onClick={() => toggleOpen(p.id)}
                      >
                        <span className="drag-handle" onClick={(e) => e.stopPropagation()}>
                          <IconDrag size={13} />
                        </span>
                        <span className={`caret ${expanded ? 'open' : ''}`}>
                          <IconChevronRight size={14} />
                        </span>
                        <b style={{ fontSize: 14 }}>{p.name}</b>
                        <span className="badge">{p.tracks.length}</span>
                        <span className="spacer" />
                        <button
                          className="icon-btn"
                          title="播放歌单"
                          onClick={(e) => {
                            e.stopPropagation()
                            playPlaylist(p.id)
                          }}
                        >
                          <IconPlay size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="删除歌单"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePlaylist(p.id)
                          }}
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>

                      {expanded && (
                        <div style={{ marginTop: 10 }}>
                          <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                            <span className="muted" style={{ fontSize: 12 }}>
                              排序
                            </span>
                            <select
                              value={p.trackSort || 'added'}
                              onChange={(e) => setTrackSort(p.id, e.target.value as TrackSort)}
                              style={{ flex: 1 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="added">添加顺序</option>
                              <option value="name">曲名</option>
                              <option value="artist">歌手</option>
                              <option value="album">专辑</option>
                              <option value="custom">自定义拖拽</option>
                            </select>
                          </div>
                          {tracks.map((t, ti) => (
                            <div
                              className="item"
                              key={t.path}
                              draggable
                              onDragStart={(e) => {
                                if ((e.target as HTMLElement).closest('button')) {
                                  e.preventDefault()
                                  return
                                }
                                setDragTrack({ plId: p.id, path: t.path })
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault()
                                if (dragTrack && dragTrack.plId === p.id && dragTrack.path !== t.path) {
                                  moveTrack(p.id, dragTrack.path, t.path)
                                }
                                setDragTrack(null)
                              }}
                            >
                              <span className="track-no">{ti + 1}</span>
                              <span
                                className="name"
                                onClick={() =>
                                  playFile({ name: t.name, path: t.path } as any, t.accountId)
                                }
                              >
                                {t.name}
                              </span>
                              <div className="row-actions">
                                <button className="mini" title="复制到其他歌单" onClick={() => openPicker('copy', p.id, t.path)}>
                                  <IconPlus size={16} />
                                </button>
                                <button className="mini" title="移动到其他歌单" onClick={() => openPicker('move', p.id, t.path)}>
                                  <IconChevronRight size={16} />
                                </button>
                                <button className="mini" title="移出歌单" onClick={() => removeFromPlaylist(p.id, t.path)}>
                                  <IconTrash size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {tracks.length === 0 && (
                            <div className="muted" style={{ fontSize: 12, padding: '8px 6px' }}>
                              这个歌单还没有歌曲。
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* 复制/移动 目标歌单选择弹窗 */}
      {picker && (
        <div className="overlay" onClick={() => setPicker(null)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <h3>{picker.mode === 'copy' ? '复制到歌单' : '移动到歌单'}</h3>
            <div className="picker-list">
              {playlists.filter((p) => p.id !== picker.plId).length === 0 && (
                <div className="muted">没有其他歌单了，先去新建一个吧。</div>
              )}
              {playlists
                .filter((p) => p.id !== picker.plId)
                .map((p) => (
                  <button key={p.id} className="picker-item" onClick={() => applyPicker(p.id)}>
                    <IconList size={15} /> {p.name}（{p.tracks.length}）
                  </button>
                ))}
            </div>
            <button className="ghost" style={{ width: '100%' }} onClick={() => setPicker(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </>
  )
}
