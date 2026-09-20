// 手机端内容区包装。
// 复用桌面的 FileBrowser / FavoritesView / PlaylistsView，但：
//   1) 隐藏它们自带的 .toolbar（手机端已有顶部标题栏，重复会占两行）
//   2) 把工具栏里的搜索框与视图切换按钮「提取」到顶部栏下方独立一行
// 通过 CSS 类的挂载来实现，避免复制那三个组件的全部业务逻辑。
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import FileBrowser from './FileBrowser'

type View = 'library' | 'favorites' | 'playlists'

export default function MobileContent({ view, onSearchOpen }: { view: View; onSearchOpen?: boolean }) {
  const { files, searchResults, currentDir, doSearch, clearSearch, openDir, activeAccount } = useStore()
  const [kw, setKw] = useState('')
  const [autoFocus, setAutoFocus] = useState(false)

  useEffect(() => {
    // 顶部搜索按钮点开时自动聚焦
    if (onSearchOpen) setAutoFocus(true)
  }, [onSearchOpen])

  if (view === 'library') {
    return (
      <div className="m-content m-content-library">
        <FileBrowser />
      </div>
    )
  }

  if (view === 'favorites') {
    return (
      <div className="m-content">
        <FavoritesList />
      </div>
    )
  }

  return (
    <div className="m-content">
      <PlaylistsList />
    </div>
  )
}

/* 收藏列表（手机端精简版：无工具栏，改为顶部搜索行 + 列表） */
function FavoritesList() {
  const { favorites, playFile, toggleFavorite, addToQueue } = useStore()
  const [kw, setKw] = useState('')
  const q = kw.trim().toLowerCase()
  const list = q
    ? favorites.filter((f) => `${f.name} ${f.artist || ''} ${f.album || ''}`.toLowerCase().includes(q))
    : favorites

  return (
    <div className="main-body">
      <div className="m-search-row">
        <input placeholder="搜索收藏…" value={kw} onChange={(e) => setKw(e.target.value)} />
      </div>
      {!favorites.length ? (
        <div className="empty">
          <div className="empty-title">还没有收藏的歌曲</div>
          <div className="empty-desc">在音乐库里点歌曲右侧的心形按钮即可收藏。</div>
        </div>
      ) : (
        <div className="list">
          {list.map((f, i) => (
            <div className="item" key={f.path + i}>
              <span className="track-no">{i + 1}</span>
              <span
                className="name"
                onClick={() => playFile({ name: f.name, path: f.path } as any, f.accountId)}
              >
                {f.name}
              </span>
              <button className="mini" title="加入队列" onClick={() => addToQueue({ name: f.name, path: f.path } as any, f.accountId)}>
                ＋
              </button>
              <button className="mini" title="取消收藏" onClick={() => toggleFavorite(f)} style={{ color: 'var(--accent)' }}>
                ♥
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* 歌单列表（手机端精简版：卡片式，展开后为歌曲列表） */
function PlaylistsList() {
  const {
    playlists,
    createPlaylist,
    playFile,
    playPlaylist,
    playAllPlaylists,
    removePlaylist,
    removeFromPlaylist
  } = useStore()
  const [name, setName] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const totalTracks = playlists.reduce((n, p) => n + p.tracks.length, 0)

  return (
    <div className="main-body">
      <div className="m-search-row">
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
        <button
          className="primary"
          onClick={() => {
            if (name) {
              createPlaylist(name)
              setName('')
            }
          }}
        >
          新建
        </button>
      </div>

      {totalTracks > 0 && (
        <div className="inline" style={{ marginBottom: 12, gap: 8 }}>
          <button className="play-all-btn" style={{ flex: 1 }} onClick={() => playAllPlaylists(false)}>
            播放全部（{totalTracks}）
          </button>
          <button className="play-all-btn ghost" onClick={() => playAllPlaylists(true)}>
            随机
          </button>
        </div>
      )}

      {!playlists.length ? (
        <div className="empty">
          <div className="empty-title">还没有歌单</div>
          <div className="empty-desc">输入名称新建歌单，然后在音乐库里把歌曲加进来。</div>
        </div>
      ) : (
        <div className="list">
          {playlists.map((p) => {
            const expanded = !!open[p.id]
            return (
              <div key={p.id}>
                <div className="item" onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>
                  <span className="caret" style={{ transform: expanded ? 'rotate(90deg)' : undefined }}>
                    ›
                  </span>
                  <span className="name">
                    <b>{p.name}</b>
                  </span>
                  <span className="badge">{p.tracks.length}</span>
                  <button
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation()
                      playPlaylist(p.id)
                    }}
                  >
                    ▶
                  </button>
                  <button
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation()
                      removePlaylist(p.id)
                    }}
                  >
                    ✕
                  </button>
                </div>
                {expanded && (
                  <div style={{ paddingLeft: 14 }}>
                    {p.tracks.map((t, ti) => (
                      <div className="item" key={t.path} style={{ minHeight: 42 }}>
                        <span className="track-no">{ti + 1}</span>
                        <span className="name" onClick={() => playFile({ name: t.name, path: t.path } as any, t.accountId)}>
                          {t.name}
                        </span>
                        <button className="mini" onClick={() => removeFromPlaylist(p.id, t.path)}>
                          ✕
                        </button>
                      </div>
                    ))}
                    {!p.tracks.length && (
                      <div className="muted" style={{ fontSize: 12, padding: '6px 8px' }}>
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
    </div>
  )
}
