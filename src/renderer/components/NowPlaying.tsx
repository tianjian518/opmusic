import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api, formatTime } from '../api'
import {
  IconClose,
  IconPlay,
  IconPause,
  IconPrev,
  IconNext,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconVolume,
  IconVolumeMute,
  IconSparkle,
  IconChevronDown
} from './Icons'

type ResolvedMeta = { artist?: string; album?: string; title?: string; year?: string }

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

  // 元数据 + 封面：优先读取音频内嵌标签，失败/无标签时回退文件名解析
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

  // 歌词实时滚动：把高亮行平滑滚到容器垂直中心
  useEffect(() => {
    const c = listRef.current
    if (!c) return
    const active = c.querySelector('.nl.active') as HTMLElement | null
    if (!active) return
    const target = active.offsetTop - c.clientHeight / 2 + active.offsetHeight / 2
    c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIdx, lyrics])

  // Esc 收起全屏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNowPlaying(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cycleMode = () => {
    const order: Array<typeof settings.playMode> = ['order', 'loop-list', 'loop-one', 'shuffle']
    const i = order.indexOf(settings.playMode)
    setPlayMode(order[(i + 1) % order.length])
  }

  const mode = settings.playMode
  const modeIcon =
    mode === 'shuffle' ? <IconShuffle size={20} /> : mode === 'loop-one' ? <IconRepeatOne size={20} /> : <IconRepeat size={20} />
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const title = meta?.title || (cur ? cur.name : '未播放')
  const sub = meta
    ? [meta.artist, meta.album].filter(Boolean).join(' · ') + (meta.year ? ` (${meta.year})` : '') || '未知'
    : '—'

  return (
    <div className="nowplaying">
      {/* 模糊背景层：用当前封面做毛玻璃背景 */}
      <div className="np-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />

      {/* 顶部栏 */}
      <div className="np-top">
        <button className="icon-btn" onClick={() => setShowNowPlaying(false)} title="收起（Esc）" style={{ color: 'rgba(255,255,255,.8)' }}>
          <IconChevronDown size={19} />
        </button>
        <span
          style={{
            fontSize: 12,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,.5)',
            fontWeight: 600
          }}
        >
          正在播放
        </span>
      </div>

      {/* 左：唱片 + 控制 */}
      <div className="np-left">
        <div
          className={`np-disc ${isPlaying ? 'playing' : ''} ${cover ? '' : 'empty'}`}
          style={{
            backgroundImage: cover
              ? `url("${cover}"), linear-gradient(135deg, #4a5170 0%, #2c3147 55%, #1c2032 100%)`
              : 'linear-gradient(135deg, #4a5170 0%, #2c3147 55%, #1c2032 100%)'
          }}
        >
          {!cover && <span className="np-disc-initial">{(meta?.title || cur?.name || '♪').slice(0, 1)}</span>}
          <div className="np-disc-hole" />
        </div>

        <div className="np-meta">
          <div className="np-title" title={title}>
            {title}
          </div>
          <div className="np-sub" title={sub}>
            {sub}
          </div>
        </div>

        <div className="np-controls">
          <button className={`ctrl-btn ${mode !== 'order' ? 'on' : ''}`} onClick={cycleMode} title={`播放模式：${MODE_LABEL[mode] || '顺序播放'}`}>
            {modeIcon}
          </button>
          <button className="ctrl-btn" onClick={prev} title="上一首">
            <IconPrev size={21} />
          </button>
          <button className="play-btn" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <IconPause size={22} /> : <IconPlay size={22} style={{ marginLeft: 3 }} />}
          </button>
          <button className="ctrl-btn" onClick={next} title="下一首">
            <IconNext size={21} />
          </button>
          <button className="ctrl-btn" onClick={cycleMode} title={`播放模式：${MODE_LABEL[mode] || '顺序播放'}`} style={{ opacity: 0.35 }}>
            <IconShuffle size={20} />
          </button>
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
            style={{
              ['--track' as any]: `linear-gradient(to right, rgba(255,255,255,.9) ${pct}%, rgba(255,255,255,.22) ${pct}%)`
            }}
          />
          <span className="meta">{formatTime(duration)}</span>
        </div>

        <div className="np-volrow">
          <button
            className="ctrl-btn"
            onClick={() => setVolume(settings.volume > 0 ? 0 : 0.8)}
            title={settings.volume > 0 ? '静音' : '取消静音'}
          >
            {settings.volume > 0 ? <IconVolume size={18} /> : <IconVolumeMute size={18} />}
          </button>
          <input
            className="vol"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            title="音量"
            style={{
              ['--track' as any]: `linear-gradient(to right, rgba(255,255,255,.8) ${settings.volume * 100}%, rgba(255,255,255,.22) ${
                settings.volume * 100
              }%)`
            }}
          />
          <span className="spacer" />
          <button className="ghost" style={{ color: 'rgba(255,255,255,.6)' }} onClick={() => setShowNowPlaying(false)}>
            收起
          </button>
        </div>
      </div>

      {/* 右：歌词 */}
      <div className="np-right">
        <div className="np-lyrics" ref={listRef}>
          {lyrics.length === 0 ? (
            <div className="np-nolyric">
              未找到歌词（同名 .lrc 会自动加载）
              <button className="ghost" style={{ color: 'rgba(255,255,255,.75)' }} onClick={() => fetchOnlineLyrics()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconSparkle size={14} /> 获取在线歌词
                </span>
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
    </div>
  )
}
