import { useEffect, useState, type CSSProperties } from 'react'
import { useStore, orderedTracks, type TrackSort, type PlaylistSort } from './store'
import { api, isAudioName, parseMeta } from './api'
import Connections from './components/Connections'
import FileBrowser from './components/FileBrowser'
import PlayerBar from './components/PlayerBar'
import LyricsPanel from './components/LyricsPanel'
import EqPanel from './components/EqPanel'
import SettingsPanel from './components/SettingsPanel'
import PlaylistPanel from './components/PlaylistPanel'
import InfoPanel from './components/InfoPanel'
import NowPlaying from './components/NowPlaying'

type View = 'library' | 'favorites' | 'playlists'

// 窄屏（手机）检测：命中时在根容器加 .mobile 类，触发手机版布局；桌面版完全不受影响。
function useIsMobile(): boolean {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)')
    const handler = () => setM(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return m
}

export default function App() {
  const { loadAccounts, restorePlayback, settings, toggle, toast, showNowPlaying, setShowNowPlaying } = useStore()
  const [view, setView] = useState<View>('library')
  const [mtab, setMtab] = useState<'library' | 'mine' | 'settings'>('library')
  const isMobile = useIsMobile()
  const s = useStore()
  const withSide = s.showLyrics || s.showPlaylist || s.showInfo || s.showEq || s.showSettings

  useEffect(() => {
    loadAccounts().then(() => restorePlayback())
  }, [])

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
    ? { backgroundImage: `url(${settings.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
    : settings.bgGradient
    ? { background: settings.bgGradient }
    : {}

  if (isMobile) {
    const hasLib = !!s.accounts.length && !!s.activeAccount
    return (
      <>
        <div className="app-bg" style={bgStyle} />
        <div className="app mobile">
          <header className="m-top">
            <div className="m-brand">🎵 OpMusic</div>
            <div className="m-spacer" />
          </header>

          <main className="m-main">
            {mtab === 'library' && (hasLib ? <FileBrowser /> : <Connections />)}
            {mtab === 'mine' && (
              <div className="m-mine">
                <FavoritesView />
                <PlaylistsView />
              </div>
            )}
            {mtab === 'settings' && (
              <>
                <SettingsPanel />
                <Connections />
              </>
            )}
          </main>

          {/* 复用同一个 PlayerBar（它持有唯一的 <audio>），在手机上被压成迷你条 */}
          <PlayerBar />

          <nav className="m-tabbar">
            <button className={mtab === 'library' ? 'active' : ''} onClick={() => setMtab('library')}>
              音乐库
            </button>
            <button className={mtab === 'mine' ? 'active' : ''} onClick={() => setMtab('mine')}>
              我的
            </button>
            <button className={showNowPlaying ? 'active' : ''} onClick={() => setShowNowPlaying(true)}>
              播放中
            </button>
            <button className={mtab === 'settings' ? 'active' : ''} onClick={() => setMtab('settings')}>
              设置
            </button>
          </nav>

          {showNowPlaying && <NowPlaying />}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  return (
    <>
      <div className="app-bg" style={bgStyle} />
      <div className={`app${withSide ? ' with-side' : ''}`}>
      <div className="top">
      <aside className="sidebar">
        <div className="brand">🎵 OpMusic</div>
        <div className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}>
          📁 音乐库
        </div>
        <div className={`nav-item ${view === 'favorites' ? 'active' : ''}`} onClick={() => setView('favorites')}>
          ❤️ 我的收藏
        </div>
        <div className={`nav-item ${view === 'playlists' ? 'active' : ''}`} onClick={() => setView('playlists')}>
          📃 歌单
        </div>
        <div
          className={`nav-item ${showNowPlaying ? 'active' : ''}`}
          onClick={() => setShowNowPlaying(true)}
        >
          🎴 正在播放
        </div>
        <div style={{ height: 18 }} />
        <div className="nav-item" onClick={() => toggle('showPlaylist')}>
          🎚️ 播放队列
        </div>
        <div className="nav-item" onClick={() => toggle('showLyrics')}>
          📝 歌词
        </div>
        <div className="nav-item" onClick={() => toggle('showEq')}>
          🎛️ 均衡器
        </div>
        <div className="nav-item" onClick={() => toggle('showSettings')}>
          ⚙️ 设置
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

function FavoritesView() {
  const { favorites, playFile, toggleFavorite, addToQueue } = useStore()
  if (!favorites.length) return <div className="hint">还没有收藏。在音乐库里点 ♥ 即可收藏。</div>
  return (
    <div>
      <h3>我的收藏（{favorites.length}）</h3>
      <div className="list">
        {favorites.map((f) => (
          <div className="item" key={f.path}>
            <span className="icon">🎵</span>
            <span className="name" onClick={() => playFile({ name: f.name, path: f.path } as any, f.accountId)}>
              {f.name}
            </span>
            <span className="meta">{f.artist || ''}</span>
            <button className="ghost" onClick={() => addToQueue({ name: f.name, path: f.path } as any, f.accountId)}>
              ＋
            </button>
            <button className="ghost" onClick={() => toggleFavorite(f)}>
              💔
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const [kw, setKw] = useState('') // 模糊搜索关键词
  const [picker, setPicker] = useState<null | { mode: 'copy' | 'move'; plId: string; path: string }>(null)
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))
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

  const openPicker = (mode: 'copy' | 'move', plId: string, path: string) =>
    setPicker({ mode, plId, path })
  const applyPicker = (targetId: string) => {
    if (!picker) return
    if (picker.mode === 'copy') copyTrackTo(picker.plId, picker.path, targetId)
    else moveTrackTo(picker.plId, picker.path, targetId)
    setPicker(null)
  }

  // 歌单列表排序
  const sortMode = settings.playlistSort
  const ordered = sortMode === 'custom'
    ? playlists
    : [...playlists].sort((a, b) => {
        if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh')
        if (sortMode === 'count') return b.tracks.length - a.tracks.length
        if (sortMode === 'recent') return (b.updatedAt || 0) - (a.updatedAt || 0)
        return 0
      })

  return (
    <div className="playlists-view">
      <div className="toolbar">
        <input placeholder="新歌单名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={() => name && (createPlaylist(name), setName(''))}>
          新建歌单
        </button>
        <span className="spacer" />
        <input
          className="search"
          placeholder="🔍 搜索歌单里的歌曲…"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          style={{ width: 230 }}
        />
        {q && (
          <button className="ghost" onClick={() => setKw('')} title="清除搜索">
            ✕
          </button>
        )}
        <span className="muted">排序</span>
        <select value={sortMode} onChange={(e) => setPlaylistSort(e.target.value as PlaylistSort)}>
          <option value="custom">自定义拖拽</option>
          <option value="name">名称</option>
          <option value="count">歌曲数</option>
          <option value="recent">最近更新</option>
        </select>
        <button className="ghost" onClick={expandAll}>展开全部</button>
        <button className="ghost" onClick={collapseAll}>折叠全部</button>
      </div>

      {/* 全部歌单：顺序 / 随机 一键播放 */}
      {!q && (
        <div className="row" style={{ margin: '10px 0 4px', gap: 8 }}>
          <button className="primary" onClick={() => playAllPlaylists(false)}>▶ 播放全部歌单</button>
          <button className="primary" onClick={() => playAllPlaylists(true)}>🔀 随机播放全部歌单</button>
          <span className="muted">
            共 {playlists.reduce((n, p) => n + p.tracks.length, 0)} 首（去重后）
          </span>
        </div>
      )}

      <div className="playlists-body">
      {/* 模糊搜索结果 */}
      {q && (
        <div>
          <h3>搜索结果（{results.length}）</h3>
          {results.length === 0 && <div className="hint">没有匹配的歌曲。</div>}
          {results.map((r) => (
            <div className="item" key={r.plId + r.track.path}>
              <span className="icon">🎵</span>
              <span className="name" onClick={() => playFile({ name: r.track.name, path: r.track.path } as any, r.track.accountId)}>
                {r.track.name}
              </span>
              <span className="meta">{r.plName}</span>
              <button className="ghost" onClick={() => openPicker('copy', r.plId, r.track.path)}>复制</button>
              <button className="ghost" onClick={() => openPicker('move', r.plId, r.track.path)}>移动</button>
              <button className="ghost" onClick={() => removeFromPlaylist(r.plId, r.track.path)}>移出</button>
            </div>
          ))}
        </div>
      )}

      {!playlists.length && !q && (
        <div className="hint">
          还没有歌单。在音乐库里：点歌曲的 📋 加入歌单；或点文件夹的「导入歌单」把整张专辑/整个歌手目录一键导入。
        </div>
      )}

      {/* 常规歌单列表（搜索时隐藏，避免与结果重复），响应式网格铺满宽度 */}
      {!q && (
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
                if (t.closest('.item')) return // 歌曲拖拽交给子项处理
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
                if (dragTrack) return // 正在拖歌曲
                if (dragPl && dragPl !== p.id) movePlaylist(dragPl, p.id)
                setDragPl(null)
              }}
            >
              <div className="row playlist-head" style={{ cursor: 'grab' }} onClick={() => toggle(p.id)}>
                <span className="drag-handle">⠿</span>
                <span className="caret">{expanded ? '▾' : '▸'}</span>
                <b>{p.name}</b>
                <span className="muted">（{p.tracks.length} 首）</span>
                <span className="spacer" />
                <button
                  className="primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    playPlaylist(p.id)
                  }}
                >
                  ▶ 播放
                </button>
                <button
                  className="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    removePlaylist(p.id)
                  }}
                >
                  删除
                </button>
              </div>
              {expanded && (
                <div style={{ marginTop: 8 }}>
                  <div className="row" style={{ marginBottom: 6, gap: 8 }}>
                    <span className="muted">歌曲排序</span>
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
                  {tracks.map((t) => (
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
                      <span className="drag-handle">⠿</span>
                      <span className="icon">🎵</span>
                      <span className="name" onClick={() => playFile({ name: t.name, path: t.path } as any, t.accountId)}>
                        {t.name}
                      </span>
                      <button className="ghost" onClick={() => openPicker('copy', p.id, t.path)}>复制</button>
                      <button className="ghost" onClick={() => openPicker('move', p.id, t.path)}>移动</button>
                      <button className="ghost" onClick={() => removeFromPlaylist(p.id, t.path)}>移出</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        </div>
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
                    📃 {p.name}（{p.tracks.length}）
                  </button>
                ))}
            </div>
            <button className="ghost" onClick={() => setPicker(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
