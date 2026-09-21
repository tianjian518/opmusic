import { useEffect, useRef, useState } from 'react'
import { useStore, registerAudioEl } from '../store'
import { api, formatTime, currentLrc, needsTranscode } from '../api'
import {
  IconPlay,
  IconPause,
  IconPrev,
  IconNext,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconVolume,
  IconVolumeMute,
  IconLyrics,
  IconSliders,
  IconMonitor,
  IconInfo,
  IconExpand,
  IconHeart,
  IconHeartFilled,
  IconMusic,
  IconDisc
} from './Icons'

const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

const MODE_LABEL: Record<string, string> = {
  order: '顺序播放',
  'loop-list': '列表循环',
  'loop-one': '单曲循环',
  shuffle: '随机播放'
}

export default function PlayerBar() {
  const {
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    settings,
    lyrics,
    desktopLyric,
    togglePlay,
    next,
    prev,
    setProgress,
    setDuration,
    setVolume,
    setPlayMode,
    setLyric,
    setShowNowPlaying,
    toggle,
    favorites,
    toggleFavorite
  } = useStore()

  const audioRef = useRef<HTMLAudioElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const durationRef = useRef<number | null>(null)
  const [cover, setCover] = useState('')
  const [meta, setMeta] = useState<{ artist?: string; album?: string; title?: string } | null>(null)

  const cur = currentIndex >= 0 ? queue[currentIndex] : null
  const isFav = !!cur && favorites.some((f) => f.path === cur.path)

  function ensureGraph() {
    const a = audioRef.current
    if (!a || ctxRef.current) return
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx: AudioContext = new Ctx()
    const src = ctx.createMediaElementSource(a)
    let node: AudioNode = src
    const filters: BiquadFilterNode[] = []
    FREQS.forEach((f, i) => {
      const bq = ctx.createBiquadFilter()
      bq.type = 'peaking'
      bq.frequency.value = f
      bq.Q.value = 1
      bq.gain.value = settings.eq[i] || 0
      node.connect(bq)
      node = bq
      filters.push(bq)
    })
    node.connect(ctx.destination)
    ctxRef.current = ctx
    filtersRef.current = filters
  }

  function applyEq() {
    filtersRef.current.forEach((bq, i) => {
      bq.gain.value = settings.eq[i] || 0
    })
  }

  // 切换曲目时设置音频源
  useEffect(() => {
    if (!cur) return
    let cancelled = false
    const a = audioRef.current
    if (!a) return
    const transcode = needsTranscode(cur.name, cur.path)
    // 关键：先「立即」设置音频源并开始播放，不要等标签/封面（否则大文件经 WebDAV 读取 +
    // ffprobe 要数秒，造成切歌卡 7~8 秒才响应）。标签、封面、时长改为并行获取、不阻塞播放。
    api.stream.url(cur.accountId, cur.path).then((u) => {
      if (cancelled || !audioRef.current) return
      audioRef.current!.src = transcode ? `${u}&transcode=1` : u
      if (desktopLyric) api.lyric.set('')
      if (isPlaying) audioRef.current!.play().catch(() => {})
    })
    // 内嵌标签（歌手/专辑/时长）并行获取，用于封面、歌曲信息与转码时长补正
    useStore
      .getState()
      .resolveMeta(cur.accountId, cur.path)
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        // 封面：本地优先，缺失时按歌手/专辑在线刮削
        api.stream
          .coverUrl(cur.accountId, cur.dir, m.artist, m.album, m.title)
          .then(setCover)
          .catch(() => setCover(''))
        // 拉取歌手/专辑简介
        useStore.getState().fetchTrackInfo(m.artist || '', m.album || '', m.title)
        // 转码流没有 Content-Length，浏览器拿不到真实时长：拿到时长后直接写 store，
        // 进度条稍后补正（不再重新加载音频，避免再次卡顿）。
        if (transcode) {
          let dur = m.duration
          const applyDur = (d?: number) => {
            if (d && isFinite(d) && !cancelled) {
              durationRef.current = d
              setDuration(d)
            }
          }
          if (dur && isFinite(dur)) applyDur(dur)
          else if (api.meta.duration) {
            api.meta.duration(cur.accountId, cur.path).then(applyDur).catch(() => {})
          }
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // 播放/暂停
  useEffect(() => {
    const a = audioRef.current
    if (!a || !cur) return
    if (isPlaying) {
      ensureGraph()
      ctxRef.current?.resume()
      if (a.src) a.play().catch(() => {})
    } else {
      a.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = settings.volume
  }, [settings.volume])

  useEffect(() => {
    applyEq()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.eq])

  useEffect(() => {
    if (!desktopLyric) api.lyric.hide()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopLyric])

  // 自检模式：采样真实 <audio> 状态并上报，验证“点击能播放”
  useEffect(() => {
    if (new URLSearchParams(location.search).get('selftest') !== '1') return
    const t0 = Date.now()
    const id = setInterval(() => {
      const a = audioRef.current
      const state = a
        ? {
            readyState: a.readyState,
            currentTime: +a.currentTime.toFixed(2),
            paused: a.paused,
            duration: isFinite(a.duration) ? +a.duration.toFixed(2) : null,
            error: a.error ? { code: a.error.code, message: a.error.message } : null
          }
        : null
      if (Date.now() - t0 > 5000) {
        clearInterval(id)
        api.selftest.result({ done: true, state, playedSeconds: a ? +a.currentTime.toFixed(2) : 0 })
      }
    }, 500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onTime = () => {
    const a = audioRef.current
    if (!a) return
    // 拖动进度条时，timeupdate 会抢回旧播放位置，导致歌词/滑块“跟不住”甚至跳空。
    if (useStore.getState().isSeeking || a.seeking) return
    setProgress(a.currentTime)
    const text = currentLrc(lyrics, a.currentTime)
    setLyric(text)
    if (desktopLyric) api.lyric.set(text)
  }

  const cycleMode = () => {
    const order: Array<typeof settings.playMode> = ['order', 'loop-list', 'loop-one', 'shuffle']
    const i = order.indexOf(settings.playMode)
    setPlayMode(order[(i + 1) % order.length])
  }

  const seek = (v: number) => {
    if (audioRef.current) audioRef.current.currentTime = v
    setProgress(v)
  }

  // 一曲播完：单曲循环需手动回到开头重播（currentIndex 不变，切歌副作用不会重跑）
  const onEnded = () => {
    const st = useStore.getState()
    if (st.settings.playMode === 'loop-one') {
      const a = audioRef.current
      if (a) {
        a.currentTime = 0
        setProgress(0)
        setLyric('')
        if (desktopLyric) api.lyric.set('')
        a.play().catch(() => {})
      }
      return
    }
    next()
  }

  const mode = settings.playMode
  const modeIcon =
    mode === 'shuffle' ? <IconShuffle size={17} /> : mode === 'loop-one' ? <IconRepeatOne size={17} /> : <IconRepeat size={17} />
  const modeOn = mode !== 'order'
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  const title = meta?.title || (cur ? cur.name : '未播放')
  const sub = meta?.artist
    ? [meta.artist, meta.album].filter(Boolean).join(' — ')
    : cur
    ? queue.length
      ? `队列 ${currentIndex + 1}/${queue.length}`
      : '从音乐库选一首歌吧'
    : '从音乐库选一首歌吧'

  return (
    <div className="player">
      <audio
        ref={(el) => {
          audioRef.current = el
          registerAudioEl(el)
        }}
        onTimeUpdate={onTime}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget
          let dur = a.duration
          // 转码流没有 Content-Length，浏览器拿不到时长（duration=Infinity）；用 URL 上的 &dur= 或预取时长兜底
          if (!isFinite(dur)) {
            const param = new URL(a.src, location.href).searchParams.get('dur')
            dur = param ? parseFloat(param) : durationRef.current || 0
          }
          setDuration(dur || 0)
          // 恢复上次播放进度（仅定位，不自动播放）
          const pending = useStore.getState().pendingSeek
          if (pending != null) {
            try {
              a.currentTime = pending
              setProgress(pending)
            } catch {
              /* ignore */
            }
            useStore.setState({ pendingSeek: null })
          }
        }}
        onError={(e) => {
          const el = e.currentTarget
          const code = el.error?.code
          if (code === 3 || code === 4) {
            const c = useStore.getState().queue[useStore.getState().currentIndex]
            const name = c?.name || ''
            if (needsTranscode(name, c?.path)) {
              useStore
                .getState()
                .setToast(
                  `「${name}」需转码：请确认本机已安装 ffmpeg（桌面端用其实时转码为 MP3）；否则请转换为 MP3 / FLAC 后播放`
                )
            } else {
              useStore
                .getState()
                .setToast(`「${name}」无法播放：音频解码失败，可能是文件损坏或服务器不支持 Range 续传`)
            }
            // 编码判定兜底：扩展名看不出问题（如装成 AAC 的 .m4a）但实际解不了时，
            // 强制走一次转码重试，避免整首歌完全放不出来。
            if (!el.src.includes('transcode=1')) {
              el.src = el.src + (el.src.includes('?') ? '&' : '?') + 'transcode=1'
              if (useStore.getState().isPlaying) el.play().catch(() => {})
            }
          } else {
            console.error('[audio] 播放出错:', code, el.error?.message, el.src)
          }
          useStore.setState({ isPlaying: false })
        }}
        onEnded={onEnded}
      />

      {/* ---------- 左：封面 + 曲名 ---------- */}
      <div className="player-left">
        <div
          className="cover cover-click"
          style={cover ? { backgroundImage: `url(${cover})` } : undefined}
          onClick={() => setShowNowPlaying(true)}
          title="点击进入全屏播放"
          role="button"
        >
          {!cover && <IconMusic size={20} />}
        </div>
        <div className="now">
          <div className="t" title={title}>
            {title}
          </div>
          <div className="s" onClick={() => setShowNowPlaying(true)} title="点击进入全屏播放">
            {sub}
          </div>
        </div>
        <button
          className={`ctrl-btn heart-btn ${isFav ? 'on' : ''}`}
          title={isFav ? '取消收藏' : '收藏'}
          onClick={() => cur && toggleFavorite({ accountId: cur.accountId, path: cur.path, name: cur.name })}
        >
          {isFav ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
        </button>
      </div>

      {/* ---------- 中：控制 + 进度 ---------- */}
      <div className="player-center">
        <div className="controls">
          <button
            className={`ctrl-btn ${modeOn ? 'on' : ''}`}
            onClick={cycleMode}
            title={`播放模式：${MODE_LABEL[mode] || '顺序播放'}（点击切换）`}
          >
            {modeIcon}
          </button>
          <button className="ctrl-btn" onClick={prev} title="上一首">
            <IconPrev size={19} />
          </button>
          <button className="play-btn" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <IconPause size={19} /> : <IconPlay size={19} style={{ marginLeft: 2 }} />}
          </button>
          <button className="ctrl-btn" onClick={next} title="下一首">
            <IconNext size={19} />
          </button>
          <button
            className="ctrl-btn"
            onClick={() => setShowNowPlaying(true)}
            title="全屏播放"
          >
            <IconDisc size={18} />
          </button>
        </div>

        <div className="progress">
          <span className="meta">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onPointerDown={() => useStore.getState().setSeeking(true)}
            onPointerUp={() => useStore.getState().setSeeking(false)}
            onPointerCancel={() => useStore.getState().setSeeking(false)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            style={{ ['--track' as any]: `linear-gradient(to right, var(--accent) ${pct}%, var(--bg-4) ${pct}%)` }}
          />
          <span className="meta">{formatTime(duration)}</span>
        </div>
      </div>

      {/* ---------- 右：音量 + 功能 ---------- */}
      <div className="player-right">
        <button
          className="ctrl-btn opt"
          onClick={() => setVolume(settings.volume > 0 ? 0 : 0.8)}
          title={settings.volume > 0 ? '静音' : '取消静音'}
        >
          {settings.volume > 0 ? <IconVolume size={17} /> : <IconVolumeMute size={17} />}
        </button>
        <div className="vol-wrap">
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
              ['--track' as any]: `linear-gradient(to right, var(--accent) ${settings.volume * 100}%, var(--bg-4) ${
                settings.volume * 100
              }%)`
            }}
          />
        </div>
        <button
          className={`ctrl-btn ${useStore.getState().showLyrics ? 'on' : ''}`}
          onClick={() => toggle('showLyrics')}
          title="歌词"
        >
          <IconLyrics size={17} />
        </button>
        <button
          className={`ctrl-btn ${useStore.getState().showInfo ? 'on' : ''}`}
          onClick={() => toggle('showInfo')}
          title="歌曲信息"
        >
          <IconInfo size={17} />
        </button>
        <button
          className={`ctrl-btn opt ${useStore.getState().showEq ? 'on' : ''}`}
          onClick={() => toggle('showEq')}
          title="均衡器"
        >
          <IconSliders size={17} />
        </button>
        <button
          className={`ctrl-btn opt ${desktopLyric ? 'on' : ''}`}
          onClick={() => toggle('desktopLyric')}
          title="桌面歌词"
        >
          <IconMonitor size={17} />
        </button>
        <button className="ctrl-btn" onClick={() => setShowNowPlaying(true)} title="全屏播放">
          <IconExpand size={17} />
        </button>
      </div>
    </div>
  )
}
