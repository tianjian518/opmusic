import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api, formatTime } from '../api'

type ResolvedMeta = { artist?: string; album?: string; title?: string; year?: string }

const MODE_ICON: Record<string, string> = {
  order: '🔁',
  'loop-list': '🔂',
  'loop-one': '🔂①',
  shuffle: '🔀'
}
const MODE_LABEL: Record<string, string> = {
  order: '顺序播放',
  'loop-list': '列表循环',
  'loop-one': '单曲循环',
  shuffle: '随机播放'
}

export default function NowPlaying() {
  const {
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    lyrics,
    settings,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    setPlayMode,
    setShowNowPlaying,
    setSeeking,
    fetchOnlineLyrics
  } = useStore()

  const cur = currentIndex >= 0 ? queue[currentIndex] : null
  const [cover, setCover] = useState('')
  const [meta, setMeta] = useState<ResolvedMeta | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 元数据 + 封面：优先读取音频内嵌标签（与侧栏信息面板、歌词同源），
  // 失败/无标签时回退文件名解析。这样 WMA 等内嵌了歌手/专辑的文件也能正确刮削封面。
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

  // 当前高亮歌词行
  let activeIdx = -1
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime + 0.2) activeIdx = i
    else break
  }

  // 歌词实时滚动：与侧边歌词面板一致，把高亮行平滑滚到容器垂直中心
  useEffect(() => {
    const c = listRef.current
    if (!c) return
    const active = c.querySelector('.nl.active') as HTMLElement | null
    if (!active) return
    const target = active.offsetTop - c.clientHeight / 2 + active.offsetHeight / 2
    c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIdx, lyrics])

  const cycleMode = () => {
    const order: Array<typeof settings.playMode> = ['order', 'loop-list', 'loop-one', 'shuffle']
    const i = order.indexOf(settings.playMode)
    setPlayMode(order[(i + 1) % order.length])
  }

  return (
    <div className="nowplaying">
      {/* 模糊背景层：用当前封面做毛玻璃背景，参照 QQ 音乐 */}
      <div className="np-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />

      <div className="np-left">
        <div
          className={`np-disc ${isPlaying ? 'playing' : ''} ${cover ? '' : 'empty'}`}
          style={{
            // 底层永远垫一层不透明渐变作为兜底：封面加载失败/无封面时唱片也不会变透明"消失"
            backgroundImage: cover
              ? `url("${cover}"), linear-gradient(135deg, #4a5170 0%, #2c3147 55%, #1c2032 100%)`
              : 'linear-gradient(135deg, #4a5170 0%, #2c3147 55%, #1c2032 100%)'
          }}
        >
          {!cover && <span className="np-disc-initial">{(meta?.title || cur?.name || '♪').slice(0, 1)}</span>}
          <div className="np-disc-hole" />
        </div>
        <div className="np-title">{meta?.title || (cur ? cur.name : '未播放')}</div>
        <div className="np-sub">
          {meta
            ? [meta.artist, meta.album].filter(Boolean).join(' · ') + (meta.year ? ` (${meta.year})` : '') || '未知'
            : '—'}
        </div>

        <div className="np-controls">
          <button onClick={prev} title="上一首">⏮</button>
          <button className="primary" onClick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
          <button onClick={next} title="下一首">⏭</button>
          <button onClick={cycleMode} title={`播放模式：${MODE_LABEL[settings.playMode] || '顺序播放'}（点击切换）`}>{MODE_ICON[settings.playMode]}</button>
        </div>

        <div className="np-progress">
          <span className="meta">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onPointerDown={() => setSeeking(true)}
            onPointerUp={() => setSeeking(false)}
            onPointerCancel={() => setSeeking(false)}
            onChange={(e) => seek(parseFloat(e.target.value))}
          />
          <span className="meta">{formatTime(duration)}</span>
        </div>
        <div className="np-volrow">
          <input
            className="vol"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            title="音量"
          />
          <button className="np-close" onClick={() => setShowNowPlaying(false)} title="收起全屏">
            返回
          </button>
        </div>
      </div>

      <div className="np-right">
        <div className="np-lyrics" ref={listRef}>
          {lyrics.length === 0 ? (
            <div className="np-nolyric">
              未找到歌词（同名 .lrc 会自动加载）
              <button className="ghost" onClick={() => fetchOnlineLyrics()}>
                获取在线歌词
              </button>
            </div>
          ) : (
            lyrics.map((l, i) => (
              <div key={i} className={`nl ${i === activeIdx ? 'active' : ''}`} onClick={() => seek(l.time)}>
                {l.text}
              </div>
            ))
          )}
        </div>
      </div>

      <button className="np-exit" onClick={() => setShowNowPlaying(false)} title="收起全屏">
        ▾ 收起
      </button>
    </div>
  )
}
