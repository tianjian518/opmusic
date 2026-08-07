import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api, parseMeta } from '../api'

export default function InfoPanel() {
  const { queue, currentIndex, trackInfo, infoLoading, fetchTrackInfo, toggle } = useStore()
  const cur = currentIndex >= 0 ? queue[currentIndex] : null
  const [cover, setCover] = useState('')
  const [meta, setMeta] = useState<{ artist?: string; album?: string; title?: string; year?: string } | null>(null)

  // 用音频内嵌标签（与歌词同源的精确元数据）显示与查询
  useEffect(() => {
    if (!cur) {
      setCover('')
      setMeta(null)
      return
    }
    let cancelled = false
    useStore.getState().resolveMeta(cur.accountId, cur.path).then((m) => {
      if (cancelled) return
      setMeta(m)
      api.stream
        .coverUrl(cur.accountId, cur.dir, m.artist, m.album, m.title)
        .then((u) => !cancelled && setCover(u))
        .catch(() => !cancelled && setCover(''))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  const m = meta || (cur ? parseMeta(cur.name, cur.dir) : null)
  const mYear = meta?.year

  return (
    <div className="panel side-panel">
      <button className="close" onClick={() => toggle('showInfo')}>
        ✕
      </button>
      <h3>歌曲信息</h3>
      {!cur || !m ? (
        <div className="hint">当前没有播放的歌曲。</div>
      ) : (
        <div>
          <img className="info-cover" src={cover} alt="封面" />
          <div className="info-title">{m.title}</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            {m.artist || '未知歌手'}
            {(m.album || trackInfo?.albumName) ? ` · ${m.album || trackInfo?.albumName}` : ''}
            {(mYear || trackInfo?.albumYear) ? ` (${mYear || trackInfo?.albumYear})` : ''}
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className="ghost"
              disabled={infoLoading}
              onClick={async () => {
                // 强制重解析元数据（清掉旧缓存里被错标成整串的歌名），再用正确歌名重新获取信息
                const fresh = await useStore.getState().resolveMeta(cur.accountId, cur.path, true)
                setMeta(fresh)
                api.stream
                  .coverUrl(cur.accountId, cur.dir, fresh.artist, fresh.album, fresh.title)
                  .then((u) => setCover(u))
                  .catch(() => setCover(''))
                fetchTrackInfo(fresh.artist || '', fresh.album || '', fresh.title, true)
              }}
            >
              {infoLoading ? '获取中…' : '重新获取'}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              首次获取后会被缓存，离线也能显示
            </span>
          </div>
          {infoLoading && !trackInfo ? (
            <div className="muted">正在从网络获取封面与简介…</div>
          ) : trackInfo?.artistBio ? (
            <div className="info-bio">{trackInfo.artistBio}</div>
          ) : (
            <div className="muted">未找到该歌手的在线简介（需要联网，且数据库以流行艺人为主）。</div>
          )}
        </div>
      )}
    </div>
  )
}
