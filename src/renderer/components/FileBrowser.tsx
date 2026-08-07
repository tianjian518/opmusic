import { useState } from 'react'
import { useStore } from '../store'
import { isAudioName, formatSize } from '../api'

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
    importFolderAsPlaylist
  } = useStore()
  const [kw, setKw] = useState('')
  const [plFor, setPlFor] = useState<string | null>(null)

  const acct = activeAccount!

  const crumbs = currentDir.split('/').filter(Boolean)
  const goCrumb = (i: number) => {
    const dir = '/' + crumbs.slice(0, i + 1).join('/')
    openDir(acct, dir)
  }

  const list = searchResults ?? files

  return (
    <div>
      <div className="toolbar">
        <select value={acct} onChange={(e) => openDir(e.target.value, '/')}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <input
          placeholder="搜索当前目录及子目录…"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(kw)}
        />
        <button onClick={() => doSearch(kw)}>搜索</button>
        <button className="ghost" title="将当前所在文件夹（含子目录）的音乐导入为一个歌单" onClick={() => importFolderAsPlaylist(acct, currentDir)}>
          导入当前目录
        </button>
        {searchResults && (
          <button className="ghost" onClick={() => (clearSearch(), setKw(''))}>
            返回目录
          </button>
        )}
      </div>

      <div className="crumbs">
        <span onClick={() => openDir(acct, '/')}>根目录</span>
        {crumbs.map((c, i) => (
          <span key={i}>
            {' / '}
            <span onClick={() => goCrumb(i)}>{c}</span>
          </span>
        ))}
      </div>

      {!searchResults && currentDir !== '/' && (
        <div className="item" onClick={() => openDir(acct, currentDir.slice(0, currentDir.lastIndexOf('/')) || '/')}>
          <span className="icon">↩️</span>
          <span className="name">返回上级</span>
        </div>
      )}

      <div className="list">
        {list.map((f) => (
          <div className="item" key={f.path}>
            <span className="icon">{f.isDir ? '📁' : isAudioName(f.name) ? '🎵' : '📄'}</span>
            <span
              className="name"
              onClick={() => (f.isDir ? openDir(acct, f.path) : playFile(f, acct))}
            >
              {f.name}
            </span>
            {!f.isDir && isAudioName(f.name) && (
              <>
                <span className="meta">{formatSize(f.size)}</span>
                <button className="ghost" title="加入队列" onClick={() => addToQueue(f, acct)}>
                  ＋
                </button>
                <button
                  className="ghost"
                  title="收藏"
                  onClick={() => toggleFavorite({ accountId: acct, path: f.path, name: f.name })}
                >
                  {isFavorite(f.path) ? '❤️' : '♡'}
                </button>
                <button className="ghost" title="加入歌单" onClick={() => setPlFor(plFor === f.path ? null : f.path)}>
                  📋
                </button>
                {plFor === f.path && (
                  <select
                    defaultValue=""
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
            {f.isDir && (
              <button
                className="ghost"
                title="将本文件夹及子目录的音乐导入为一个歌单"
                onClick={(e) => {
                  e.stopPropagation()
                  importFolderAsPlaylist(acct, f.path)
                }}
              >
                导入歌单
              </button>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="hint">这个目录没有内容。</div>}
      </div>
    </div>
  )
}
