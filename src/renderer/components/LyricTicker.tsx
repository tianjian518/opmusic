import { useStore } from '../store'

// 手机版迷你播放条上方的「实时歌词滚动条」：常驻显示当前 2~3 行，
// 当前行高亮居中、上下行半透明，随播放平滑上滚；点击展开全屏歌词面板。
const LINE_H = 22 // 单行高度（px），需与 styles.css 中 .mlt-line 一致

export default function LyricTicker() {
  const lyrics = useStore((s) => s.lyrics)
  const currentTime = useStore((s) => s.currentTime)
  const setShowNowPlaying = useStore((s) => s.setShowNowPlaying)

  // 没有歌词就不占地方
  if (!lyrics || !lyrics.length) return null

  // 当前行：最后一个 time <= currentTime 的歌词行
  let idx = 0
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime + 0.25) idx = i
    else break
  }

  // 让当前行(idx)落在 3 行容器中间（容器高 3*LINE_H，中心在第 1 行位置）
  const offset = (LINE_H - idx * LINE_H)

  return (
    <div className="m-lyric-ticker" onClick={() => setShowNowPlaying(true)} title="点击展开歌词">
      <div
        className="mlt-inner"
        style={{ transform: `translateY(${offset}px)`, transition: 'transform .45s cubic-bezier(.22,.61,.36,1)' }}
      >
        {lyrics.map((l, i) => (
          <div key={i} className={`mlt-line ${i === idx ? 'cur' : i < idx ? 'past' : 'future'}`}>
            {l.text || '♪'}
          </div>
        ))}
      </div>
    </div>
  )
}
