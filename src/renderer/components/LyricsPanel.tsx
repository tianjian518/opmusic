import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { currentLrc } from '../api'

export default function LyricsPanel() {
  const { lyrics, currentTime, toggle, desktopLyric, fetchOnlineLyrics } = useStore()
  const boxRef = useRef<HTMLDivElement>(null)
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
      <button className="close" onClick={() => toggle('showLyrics')}>
        ✕
      </button>
      <h3>歌词</h3>
      <div className="row" style={{ marginBottom: 10, gap: 8 }}>
        <span className="muted">桌面歌词</span>
        <button className={desktopLyric ? 'primary' : 'ghost'} onClick={() => toggle('desktopLyric')}>
          {desktopLyric ? '已开启' : '未开启'}
        </button>
        <span className="spacer" />
        <button className="ghost" onClick={() => fetchOnlineLyrics()}>获取在线歌词</button>
      </div>
      <div className="lyrics-box" ref={boxRef}>
        {lyrics.length === 0 && (
          <div className="muted">
            未找到歌词文件（同名 .lrc 会自动加载）。可点「获取在线歌词」从网络搜索。
          </div>
        )}
        {lyrics.map((l, i) => (
          <div key={i} className={`l ${i === activeIdx ? 'active' : ''}`}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  )
}
