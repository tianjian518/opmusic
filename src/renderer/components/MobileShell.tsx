// 手机端外壳：顶部标题栏 + 底部（迷你播放条 + Tab 栏）。
// 拆成三个具名导出（TopBar / BottomBar / MiniPlayer），由 App 按
// 「顶部栏 → 滚动内容 → 底部栏」的顺序组装，避免内容被挤到 Tab 栏下面。
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { haptic } from '../device'
import {
  IconLibrary,
  IconHeart,
  IconList,
  IconPlay,
  IconPause,
  IconChevronRight,
  IconNext,
  IconSearch,
  IconSettings,
  IconMusic,
  IconSliders
} from './Icons'

export type MobileTab = 'library' | 'favorites' | 'playlists' | 'more'

/* ============================ 顶部标题栏 ============================ */

export function MobileTopBar({
  title,
  onSearch,
  onSettings,
  showBack,
  onBack
}: {
  title: string
  onSearch?: () => void
  onSettings?: () => void
  showBack?: boolean
  onBack?: () => void
}) {
  return (
    <div className="m-topbar">
      {showBack && (
        <button className="m-btn" onClick={onBack} aria-label="返回" style={{ transform: 'rotate(180deg)' }}>
          <IconChevronRight size={20} />
        </button>
      )}
      <span className="m-title">{title}</span>
      {onSearch && (
        <button className="m-btn" onClick={onSearch} aria-label="搜索">
          <IconSearch size={19} />
        </button>
      )}
      {onSettings && (
        <button className="m-btn" onClick={onSettings} aria-label="设置">
          <IconSettings size={19} />
        </button>
      )}
    </div>
  )
}

/* ============================ 迷你播放条 ============================ */

export function MiniPlayer() {
  const { queue, currentIndex, isPlaying, currentTime, duration, togglePlay, next, setShowNowPlaying } = useStore()
  const cur = currentIndex >= 0 ? queue[currentIndex] : null
  const [cover, setCover] = useState('')
  const [sub, setSub] = useState('')
  // 切歌瞬间 duration 可能还是 0，此时保留上一次进度，避免进度条闪回 0%
  const lastPctRef = useRef(0)

  useEffect(() => {
    if (!cur) {
      setCover('')
      setSub('')
      return
    }
    let cancelled = false
    useStore
      .getState()
      .resolveMeta(cur.accountId, cur.path)
      .then((m) => {
        if (cancelled) return
        setSub(m.artist || m.album || '')
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

  if (!cur) return null

  let pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  if (duration <= 0) pct = lastPctRef.current
  else lastPctRef.current = pct

  return (
    <div className="m-mini" onClick={() => setShowNowPlaying(true)}>
      <div className="m-mini-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {!cover && <IconMusic size={17} />}
      </div>
      <div className="m-mini-info">
        <div className="m-mini-title">{cur.name}</div>
        <div className="m-mini-sub">{sub || (isPlaying ? '正在播放' : '已暂停')}</div>
      </div>
      <button
        className="m-btn"
        style={{ color: 'var(--text)' }}
        onClick={(e) => {
          e.stopPropagation()
          haptic()
          togglePlay()
        }}
        aria-label={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying ? <IconPause size={22} /> : <IconPlay size={22} />}
      </button>
      <button
        className="m-btn"
        style={{ color: 'var(--text-2)' }}
        onClick={(e) => {
          e.stopPropagation()
          haptic()
          next()
        }}
        aria-label="下一首"
      >
        <IconNext size={20} />
      </button>
      <div className="m-mini-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ============================ 底部栏（迷你条 + Tab） ============================ */

export function MobileBottomBar({
  tab,
  onTab,
  onMore
}: {
  tab: MobileTab
  onTab: (t: MobileTab) => void
  onMore?: () => void
}) {
  const { queue, currentIndex, favorites, playlists } = useStore()
  const trackCount = playlists.reduce((n, p) => n + p.tracks.length, 0)

  const tabs: Array<{ key: MobileTab; label: string; icon: JSX.Element; badge?: number }> = [
    { key: 'library', label: '音乐库', icon: <IconLibrary size={21} /> },
    { key: 'favorites', label: '收藏', icon: <IconHeart size={21} />, badge: favorites.length },
    { key: 'playlists', label: '歌单', icon: <IconList size={21} />, badge: trackCount },
    { key: 'more', label: '更多', icon: <IconSliders size={21} /> }
  ]

  return (
    <div className="m-bottom">
      <MiniPlayer />
      <div className="m-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`m-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => {
              haptic()
              onTab(t.key)
            }}
          >
            <span className="m-tab-icon">
              {t.icon}
              {t.badge ? <span className="m-tab-badge">{t.badge > 99 ? '99+' : t.badge}</span> : null}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* 兼容旧用法：默认导出一个组合体（App 已改用上面三个具名导出） */
export default function MobileShell(props: {
  tab: MobileTab
  onTab: (t: MobileTab) => void
  title: string
  onSearch?: () => void
  onSettings?: () => void
  showBack?: boolean
  onBack?: () => void
}) {
  return (
    <>
      <MobileTopBar
        title={props.title}
        onSearch={props.onSearch}
        onSettings={props.onSettings}
        showBack={props.showBack}
        onBack={props.onBack}
      />
      <MobileBottomBar tab={props.tab} onTab={props.onTab} />
    </>
  )
}
