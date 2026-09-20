import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api, parseMeta } from '../api'
import { IconClose, IconMusic, IconSparkle } from './Icons'

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
    useStore
      .getState()
      .resolveMeta(cur.accountId, cur.path)
      .then((m) => {
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
  const album = m?.album || trackInfo?.albumName
  const year = mYear || trackInfo?.albumYear

  return (
    <div className="panel side-panel">
      <div className="panel-head">
        <h3>歌曲信息</h3>
        <button className="close" onClick={() => toggle('showInfo')} title="关闭">
          <IconClose size={16} />
        </button>
      </div>

      <div className="panel-body">
        {!cur || !m ? (
          <div className="empty" style={{ padding: '50px 10px' }}>
            <div className="empty-icon">
              <IconMusic size={24} />
            </div>
            <div className="empty-title" style={{ fontSize: 14 }}>
              当前没有播放的歌曲
            </div>
          </div>
        ) : (
          <div>
            {cover ? (
              <img className="info-cover" src={cover} alt="封面" />
            ) : (
              <div className="info-cover" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
                <IconMusic size={40} />
              </div>
            )}

            <div className="info-title">{m.title}</div>
            <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
              {m.artist || '未知歌手'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div className="info-kv">
                <span className="k">专辑</span>
                <span className="v">{album || '—'}</span>
              </div>
              <div className="info-kv">
                <span className="k">年份</span>
                <span className="v">{year || '—'}</span>
              </div>
              <div className="info-kv" style={{ borderBottom: 'none' }}>
                <span className="k">文件</span>
                <span className="v">{cur.name}</span>
              </div>
            </div>

            <button
              className="ghost"
              style={{ width: '100%', marginBottom: 14 }}
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconSparkle size={14} /> {infoLoading ? '获取中…' : '重新获取封面与简介'}
              </span>
            </button>

            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              首次获取后会缓存到本地，离线也能显示。
            </div>

            {infoLoading && !trackInfo ? (
              <div className="muted" style={{ fontSize: 12.5 }}>
                正在从网络获取封面与简介…
              </div>
            ) : trackInfo?.artistBio ? (
              <>
                <div className="divider" />
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  歌手简介
                </div>
                <div className="info-bio">{trackInfo.artistBio}</div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                未找到该歌手的在线简介（需要联网，且数据库以流行艺人为主）。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
