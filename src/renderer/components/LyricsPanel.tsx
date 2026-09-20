import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { IconClose, IconMonitor, IconSparkle } from './Icons'

export default function LyricsPanel() {
  const { lyrics, currentTime, toggle, desktopLyric, fetchOnlineLyrics, queue, currentIndex } = useStore()
  const boxRef = useRef<HTMLDivElement>(null)
  const cur = currentIndex >= 0 ? queue[currentIndex] : null

  const activeIdx = (() => {
    let idx = -1
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime + 0.2) idx = i
      else break
    }
    return idx
  })()

  // 自动滚动：让高亮行保持在歌词框中央
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const active = box.querySelector('.l.active') as HTMLElement | null
    if (!active) return
    const target = active.offsetTop - box.clientHeight / 2 + active.clientHeight / 2
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIdx, lyrics])

  return (
    <div className="panel side-panel">
      <div className="panel-head">
        <h3>歌词</h3>
        <button className="close" onClick={() => toggle('showLyrics')} title="关闭">
          <IconClose size={16} />
        </button>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-tools">
          <button
            className={`toggle ${desktopLyric ? 'on' : ''}`}
            onClick={() => toggle('desktopLyric')}
            title="桌面歌词悬浮窗"
          />
          <span className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <IconMonitor size={14} /> 桌面歌词
          </span>
          <span className="spacer" />
          <button className="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => fetchOnlineLyrics()}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <IconSparkle size={13} /> 在线歌词
            </span>
          </button>
        </div>

        {cur && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 10, textAlign: 'center' }}>
            {cur.name}
          </div>
        )}

        <div className="lyrics-box" ref={boxRef}>
          {lyrics.length === 0 && (
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.9 }}>
              未找到歌词文件（同名 .lrc 会自动加载）
              <br />
              可点上方「在线歌词」从网络搜索
            </div>
          )}
          {lyrics.map((l, i) => (
            <div
              key={i}
              className={`l ${i === activeIdx ? 'active' : ''}`}
              onClick={() => useStore.getState().seek(l.time)}
            >
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
