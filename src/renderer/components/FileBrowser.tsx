import { useState } from 'react'
import { useStore } from '../store'
import { isAudioName, formatSize, api } from '../api'
import {
  IconMusic,
  IconFolder,
  IconPlay,
  IconPlus,
  IconHeart,
  IconHeartFilled,
  IconList,
  IconSearch,
  IconClose,
  IconArrowLeft,
  IconChevronRight,
  IconDisc,
  IconTrash
} from './Icons'

type Layout = 'list' | 'grid'

export default function FileBrowser() {
  const {
    accounts,
    activeAccount,
    currentDir,
    files,
    searchResults,
    openDir,
    playFile,
    addToQueue,
    toggleFavorite,
    isFavorite,
    doSearch,
    clearSearch,
    playlists,
    addToPlaylist,
    importFolderAsPlaylist,
    queue,
    currentIndex
  } = useStore()

  const [kw, setKw] = useState('')
  const [plFor, setPlFor] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>('list')
  const [loading, setLoading] = useState(false)

  const acct = activeAccount!
  const crumbs = currentDir.split('/').filter(Boolean)
  const list = searchResults ?? files

  const nowPlayingPath = currentIndex >= 0 ? queue[currentIndex]?.path : null

  const goCrumb = (i: number) => {
    const dir = '/' + crumbs.slice(0, i + 1).join('/')
    openDir(acct, dir)
  }

  const wrapOpen = async (dir: string) => {
    setLoading(true)
    try {
      await openDir(acct, dir)
    } finally {
      setLoading(false)
    }
  }

  const dirs = list.filter((f) => f.isDir)
  const audios = list.filter((f) => !f.isDir && isAudioName(f.name))
  const others = list.filter((f) => !f.isDir && !isAudioName(f.name))
  const shown = searchResults ? list : [...dirs, ...audios, ...others]
  const audioTotal = audios.length
  const totalSize = audios.reduce((n, f) => n + (f.size || 0), 0)

  const curName = crumbs.length ? crumbs[crumbs.length - 1] : '根目录'

  return (
    <>
      {/* ---------- 工具栏 ---------- */}
      <div className="toolbar">
        {currentDir !== '/' && !searchResults && (
          <button
            className="icon-btn"
            title="返回上级"
            onClick={() => wrapOpen(currentDir.slice(0, currentDir.lastIndexOf('/')) || '/')}
          >
            <IconArrowLeft size={17} />
          </button>
        )}
        <select
          value={acct}
          onChange={(e) => {
            clearSearch()
            setKw('')
            openDir(e.target.value, '/')
          }}
          title="切换网盘"
          style={{ maxWidth: 190 }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <span className="spacer" />

        <div className="search-box">
          <IconSearch size={16} />
          <input
            placeholder="搜索当前目录及子目录…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch(kw)}
          />
          {(kw || searchResults) && (
            <button
              className="mini"
              style={{ width: 20, height: 20 }}
              title="清除"
              onClick={() => {
                setKw('')
                clearSearch()
              }}
            >
              <IconClose size={13} />
            </button>
          )}
        </div>
        <button className="icon-btn" title="搜索" onClick={() => doSearch(kw)}>
          <IconSearch size={17} />
        </button>

        <div className="segmented">
          <button className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} title="列表视图">
            <IconList size={14} /> 列表
          </button>
          <button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} title="网格视图">
            <IconDisc size={14} /> 网格
          </button>
        </div>

        <button
          className="icon-btn"
          title="将当前文件夹（含子目录）的音乐导入为一个歌单"
          onClick={() => importFolderAsPlaylist(acct, currentDir)}
        >
          <IconPlus size={17} />
        </button>
      </div>

      {/* ---------- 内容 ---------- */}
      <div className="main-body">
        {searchResults ? (
          <>
            <div className="page-head">
              <div>
                <h1 className="page-title">搜索结果</h1>
                <div className="page-sub">
                  「{kw}」在 {currentDir === '/' ? '根目录' : currentDir} 及子目录匹配到 {searchResults.length} 项
                </div>
              </div>
              <span className="spacer" />
              <div className="page-actions">
                <button className="play-all-btn ghost" onClick={() => (clearSearch(), setKw(''))}>
                  <IconArrowLeft size={15} /> 返回目录
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="page-head">
              <div style={{ minWidth: 0 }}>
                <h1 className="page-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {curName}
                </h1>
                <div className="page-sub">
                  {dirs.length > 0 && `${dirs.length} 个文件夹`}
                  {dirs.length > 0 && audioTotal > 0 && ' · '}
                  {audioTotal > 0 && `${audioTotal} 首音乐 · ${formatSize(totalSize)}`}
                  {dirs.length === 0 && audioTotal === 0 && '空目录'}
                </div>
              </div>
              <span className="spacer" />
              <div className="page-actions">
                {currentDir !== '/' && (
                  <button
                    className="play-all-btn ghost"
                    onClick={() => wrapOpen(currentDir.slice(0, currentDir.lastIndexOf('/')) || '/')}
                  >
                    <IconArrowLeft size={15} /> 上级
                  </button>
                )}
                {audioTotal > 0 && (
                  <button
                    className="play-all-btn"
                    onClick={() => {
                      const first = audios[0]
                      if (first) playFile(first, acct)
                    }}
                  >
                    <IconPlay size={14} /> 播放本目录
                  </button>
                )}
              </div>
            </div>

            <div className="crumbs">
              <span onClick={() => wrapOpen('/')}>根目录</span>
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="sep">/</span>
                  <span onClick={() => goCrumb(i)}>{c}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {/* 骨架屏 */}
        {loading ? (
          layout === 'grid' ? (
            <div className="skel-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div className="skel-album" key={i}>
                  <div className="skeleton skel-art" />
                  <div className="skeleton" style={{ height: 12, width: '76%' }} />
                  <div className="skeleton" style={{ height: 10, width: '48%' }} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {Array.from({ length: 10 }).map((_, i) => (
                <div className="skeleton skel-row" key={i} />
              ))}
            </div>
          )
        ) : shown.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconMusic size={26} />
            </div>
            <div className="empty-title">这个目录没有内容</div>
            <div className="empty-desc">换一个目录，或者用上方搜索框在当前目录及子目录里递归搜索音乐。</div>
          </div>
        ) : layout === 'grid' && !searchResults ? (
          /* ================= 网格视图（专辑墙） ================= */
          <div className="grid">
            {shown.map((f) => {
              const audio = !f.isDir && isAudioName(f.name)
              const isNow = audio && f.path === nowPlayingPath
              return (
                <div className="album-card" key={f.path}>
                  <div
                    className={`album-art${isNow ? ' now-playing' : ''}`}
                    onClick={() => (f.isDir ? wrapOpen(f.path) : audio ? playFile(f, acct) : null)}
                  >
                    {f.isDir ? (
                      <IconFolder size={46} style={{ color: 'var(--text-3)', opacity: 0.7 }} />
                    ) : audio ? (
                      <IconMusic size={42} style={{ color: 'var(--text-3)', opacity: 0.7 }} />
                    ) : (
                      <IconList size={38} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
                    )}
                    {(f.isDir || audio) && (
                      <button
                        className="art-play"
                        title={f.isDir ? '打开' : '播放'}
                        onClick={(e) => {
                          e.stopPropagation()
                          f.isDir ? wrapOpen(f.path) : playFile(f, acct)
                        }}
                      >
                        <IconPlay size={15} style={{ marginLeft: 2 }} />
                      </button>
                    )}
                  </div>
                  <div className="album-title" title={f.name}>
                    {f.name}
                  </div>
                  <div className="album-sub">
                    {f.isDir ? '文件夹' : audio ? formatSize(f.size) : '文件'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ================= 列表视图 ================= */
          <div className="list">
            {shown.map((f) => {
              const audio = !f.isDir && isAudioName(f.name)
              const isNow = audio && f.path === nowPlayingPath
              return (
                <div className={`item${isNow ? ' active' : ''}${plFor === f.path ? ' pinned' : ''}`} key={f.path}>
                  <span className="icon">
                    {f.isDir ? <IconFolder size={18} /> : audio ? <IconMusic size={18} /> : <IconList size={18} />}
                  </span>
                  <span
                    className="name"
                    onClick={() => (f.isDir ? wrapOpen(f.path) : audio ? playFile(f, acct) : null)}
                    title={f.name}
                  >
                    {f.name}
                  </span>

                  {audio && <span className="meta" style={{ width: 74, textAlign: 'right' }}>{formatSize(f.size)}</span>}

                  {f.isDir && (
                    <div className="row-actions">
                      <button
                        className="mini"
                        title="将本文件夹及子目录的音乐导入为一个歌单"
                        onClick={(e) => {
                          e.stopPropagation()
                          importFolderAsPlaylist(acct, f.path)
                        }}
                      >
                        <IconPlus size={16} />
                      </button>
                    </div>
                  )}

                  {audio && (
                    <>
                      <div className="row-actions">
                        <button className="mini" title="加入队列" onClick={() => addToQueue(f, acct)}>
                          <IconPlus size={16} />
                        </button>
                        <button
                          className="mini"
                          title={isFavorite(f.path) ? '取消收藏' : '收藏'}
                          onClick={() => toggleFavorite({ accountId: acct, path: f.path, name: f.name })}
                        >
                          {isFavorite(f.path) ? (
                            <IconHeartFilled size={16} style={{ color: 'var(--accent)' }} />
                          ) : (
                            <IconHeart size={16} />
                          )}
                        </button>
                        <button
                          className="mini"
                          title="加入歌单"
                          onClick={() => setPlFor(plFor === f.path ? null : f.path)}
                        >
                          <IconList size={16} />
                        </button>
                      </div>
                      {plFor === f.path && (
                        <select
                          defaultValue=""
                          style={{ width: 150 }}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value) {
                              addToPlaylist(e.target.value, { accountId: acct, path: f.path, name: f.name })
                              setPlFor(null)
                            }
                          }}
                        >
                          <option value="">选择歌单…</option>
                          {playlists.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
