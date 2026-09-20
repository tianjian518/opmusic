// 手机版全屏播放页。
// 与桌面版（NowPlaying）的差异：
//   · 顶部把手，支持「下滑收起」手势
//   · 封面区域支持「左右滑动切歌」（跟手位移 + 松手回弹/切歌）
//   · 歌词由右栏改为可上滑展开的全屏图层
//   · 底部一排大号触摸按钮（歌词/收藏/队列）
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api, formatTime } from '../api'
import { haptic } from '../device'
import {
  IconPlay,
  IconPause,
  IconPrev,
  IconNext,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconLyrics,
  IconHeart,
  IconHeartFilled,
  IconList,
  IconClose,
  IconInfo,
  IconSparkle,
  IconMusic
} from './Icons'

const MODE_LABEL: Record<string, string> = {
  order: '顺序播放',
  'loop-list': '列表循环',
  'loop-one': '单曲循环',
  shuffle: '随机播放'
}

// 手势判定阈值
const DISMISS_PX = 110 // 下滑超过此距离则收起
const SWIPE_PX = 62 // 左右滑超过此距离则切歌

export default function MobileNowPlaying() {
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
    setPlayMode,
    setShowNowPlaying,
    setSeeking,
    fetchOnlineLyrics,
    favorites,
    toggleFavorite
  } = useStore()

  const cur = currentIndex >= 0 ? queue[currentIndex] : null
  const [cover, setCover] = useState('')
  const [meta, setMeta] = useState<{ artist?: string; album?: string; title?: string } | null>(null)
  const [lyricOpen, setLyricOpen] = useState(false)
  // 手势位移状态
  const [offsetY, setOffsetY] = useState(0)
  const [offsetX, setOffsetX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; axis: 'none' | 'x' | 'y'; active: boolean }>({
    x: 0,
    y: 0,
    axis: 'none',
    active: false
  })

  const isFav = !!cur && favorites.some((f) => f.path === cur.path)

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

  let activeIdx = -1
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime + 0.2) activeIdx = i
    else break
  }

  // 歌词自动居中滚动
  useEffect(() => {
    const c = listRef.current
    if (!c || !lyricOpen) return
    const active = c.querySelector('.nl.active') as HTMLElement | null
    if (!active) return
    const target = active.offsetTop - c.clientHeight / 2 + active.offsetHeight / 2
    c.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIdx, lyrics, lyricOpen])

  // 安卓返回键 / Esc：先关歌词图层，再收起播放页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (lyricOpen) setLyricOpen(false)
      else setShowNowPlaying(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricOpen])

  /* ---------- 手势：下滑收起 / 左右滑切歌 ---------- */

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    gesture.current = { x: t.clientX, y: t.clientY, axis: 'none', active: true }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current
    if (!g.active || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y

    // 首次移动时锁定方向，避免斜滑时两个方向互相干扰
    if (g.axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      setDragging(true)
    }

    if (g.axis === 'y') {
      // 只允许向下拖拽收起；向上给一点阻尼回弹感
      setOffsetY(dy > 0 ? dy : dy * 0.25)
    } else {
      setOffsetX(dx)
    }
  }

  const onTouchEnd = () => {
    const g = gesture.current
    if (!g.active) return
    g.active = false
    setDragging(false)

    if (g.axis === 'y') {
      if (offsetY > DISMISS_PX) {
        haptic()
        setDismissing(true)
        setTimeout(() => {
          setShowNowPlaying(false)
          setDismissing(false)
          setOffsetY(0)
        }, 260)
      } else {
        setOffsetY(0)
      }
    } else if (g.axis === 'x') {
      if (offsetX > SWIPE_PX) {
        haptic(18)
        setOffsetX(0)
        prev()
      } else if (offsetX < -SWIPE_PX) {
        haptic(18)
        setOffsetX(0)
        next()
      } else {
        setOffsetX(0)
      }
    }
    g.axis = 'none'
  }

  const cycleMode = () => {
    const order: Array<typeof settings.playMode> = ['order', 'loop-list', 'loop-one', 'shuffle']
    const i = order.indexOf(settings.playMode)
    setPlayMode(order[(i + 1) % order.length])
    haptic()
  }

  if (!cur) return null

  const mode = settings.playMode
  const modeIcon =
    mode === 'shuffle' ? <IconShuffle size={20} /> : mode === 'loop-one' ? <IconRepeatOne size={20} /> : <IconRepeat size={20} />
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const title = meta?.title || cur.name
  const sub = meta ? [meta.artist, meta.album].filter(Boolean).join(' · ') : ''

  // 位移样式：纵向下滑 + 横向跟手（横向只做视觉提示，带轻微缩放）
  const style: React.CSSProperties = {
    transform: `translateY(${offsetY}px) translateX(${offsetX * 0.35}px)`,
    opacity: dismissing ? 0.4 : Math.max(0.35, 1 - offsetY / 520)
  }

  return (
    <div
      ref={rootRef}
      className={`nowplaying mobile-np ${dragging ? 'dragging' : ''} ${dismissing ? 'dismissing' : ''}`}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="np-bg" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />

      {/* 把手 + 小标题 */}
      <div className="np-grabber">
        <i />
      </div>
      <div className="np-head">
        <span className="np-kicker">正在播放</span>
      </div>

      <div className="np-left">
        <div className="np-center-block">
          <div
            className={`np-disc ${isPlaying ? 'playing' : ''} ${cover ? '' : 'empty'}`}
            style={{
              backgroundImage: cover
                ? `url("${cover}"), linear-gradient(135deg, #4a5170 0%, #2c3147 55%, #1c2032 100%)`
                : 'linear-gradient(135deg, #4a5170 0%, #2c3147 55%, #1c2032 100%)'
            }}
          >
            {!cover && <span className="np-disc-initial">{title.slice(0, 1)}</span>}
            <div className="np-disc-hole" />
          </div>

          <div className="np-meta">
            <div className="np-title" title={title}>
              {title}
            </div>
            <div className="np-sub" title={sub}>
              {sub || '未知歌手'}
            </div>
          </div>
        </div>

        <div className="np-lower">
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
                ['--track' as any]: `linear-gradient(to right, rgba(255,255,255,.92) ${pct}%, rgba(255,255,255,.22) ${pct}%)`
              }}
            />
            <span className="meta">{formatTime(duration)}</span>
          </div>

          <div className="np-controls">
            <button className="ctrl-btn" onClick={cycleMode} title={`播放模式：${MODE_LABEL[mode]}`}>
              {modeIcon}
            </button>
            <button className="ctrl-btn" onClick={() => { haptic(); prev() }} aria-label="上一首">
              <IconPrev size={24} />
            </button>
            <button className="play-btn" onClick={() => { haptic(); togglePlay() }} aria-label={isPlaying ? '暂停' : '播放'}>
              {isPlaying ? <IconPause size={26} /> : <IconPlay size={26} style={{ marginLeft: 4 }} />}
            </button>
            <button className="ctrl-btn" onClick={() => { haptic(); next() }} aria-label="下一首">
              <IconNext size={24} />
            </button>
            <button
              className="ctrl-btn"
              onClick={() => { haptic(); toggleFavorite({ accountId: cur.accountId, path: cur.path, name: cur.name }) }}
              aria-label={isFav ? '取消收藏' : '收藏'}
              style={{ color: isFav ? 'var(--accent)' : undefined }}
            >
              {isFav ? <IconHeartFilled size={22} /> : <IconHeart size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* 底部操作行 */}
      <div className="np-bottom">
        <button
          className={`ctrl-btn ${lyricOpen ? 'on' : ''}`}
          onClick={() => { haptic(); setLyricOpen((v) => !v) }}
          aria-label="歌词"
        >
          <IconLyrics size={21} />
        </button>
        <button
          className="ctrl-btn"
          onClick={() => {
            haptic()
            // 先收起全屏播放页再开抽屉，否则抽屉会被播放页盖住
            setShowNowPlaying(false)
            setTimeout(() => useStore.getState().toggle('showPlaylist'), 120)
          }}
          aria-label="播放队列"
        >
          <IconList size={21} />
        </button>
        <button
          className="ctrl-btn"
          onClick={() => { haptic(); useStore.getState().toggle('showInfo') }}
          aria-label="歌曲信息"
        >
          <IconInfo size={21} />
        </button>
      </div>

      {/* 歌词图层：可上滑展开 */}
      <div className={`np-right ${lyricOpen ? 'open' : ''}`}>
        <button className="ctrl-btn np-lyric-close" onClick={() => setLyricOpen(false)} aria-label="关闭歌词">
          <IconClose size={20} />
        </button>
        <div className="np-lyrics" ref={listRef}>
          {lyrics.length === 0 ? (
            <div className="np-nolyric">
              <IconMusic size={30} />
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
