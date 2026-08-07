import { useEffect, useRef, useState } from 'react'
import { useStore, registerAudioEl } from '../store'
import { api, formatTime, currentLrc, needsTranscode } from '../api'

const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
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
    showNowPlaying,
    fetchTrackInfo,
    setSeeking,
    toggle
  } = useStore()

  const audioRef = useRef<HTMLAudioElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const durationRef = useRef<number | null>(null)
  const [cover, setCover] = useState('')

  const cur = currentIndex >= 0 ? queue[currentIndex] : null

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
    const transcode = needsTranscode(cur.name)
    // 关键：先「立即」设置音频源并开始播放，不要等标签/封面（否则大文件经 WebDAV 读取 +
    // ffprobe 要数秒，造成切歌卡 7~8 秒才响应）。标签、封面、时长改为并行获取、不阻塞播放。
    api.stream.url(cur.accountId, cur.path).then((u) => {
      if (cancelled || !audioRef.current) return
      audioRef.current!.src = transcode ? `${u}&transcode=1` : u
      if (desktopLyric) api.lyric.set('')
      if (isPlaying) audioRef.current!.play().catch(() => {})
    })
    // 内嵌标签（歌手/专辑/时长）并行获取，用于封面、歌曲信息与转码时长补正
    useStore.getState().resolveMeta(cur.accountId, cur.path).then((m) => {
      if (cancelled) return
      // 封面：本地优先，缺失时按歌手/专辑在线刮削
      api.stream
        .coverUrl(cur.accountId, cur.dir, m.artist, m.album, m.title)
        .then(setCover)
        .catch(() => setCover(''))
      // 拉取歌手/专辑简介（即便只有歌名也尝试：按歌名在网易云搜出对应歌手）
      fetchTrackInfo(m.artist || '', m.album || '', m.title)
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
      // 首次切歌时 src 由 currentIndex 副作用异步设置；此处等 src 就绪再播，
      // 避免对空 src 调用 play() 被浏览器拒绝（静默失败 → 点了不响）。
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
    // 拖动期间（指针按下）及音频真正 seek 完成前，暂停用 timeupdate 覆盖 currentTime，
    // 完全由拖动值驱动，松手并 seek 完成后再恢复正常同步。
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
        const text = ''
        setLyric(text)
        if (desktopLyric) api.lyric.set(text)
        a.play().catch(() => {})
      }
      return
    }
    next()
  }

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
            dur = param ? parseFloat(param) : (durationRef.current || 0)
          }
          setDuration(dur || 0)
          // 恢复上次播放进度（仅定位，不自动播放）
          const seek = useStore.getState().pendingSeek
          if (seek != null) {
            try {
              a.currentTime = seek
              setProgress(seek)
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
            const cur = useStore.getState().queue[useStore.getState().currentIndex]
            const name = cur?.name || ''
            if (needsTranscode(name)) {
              useStore.getState().setToast(`「${name}」需转码：请确认本机已安装 ffmpeg（桌面端用其实时转码为 MP3）；否则请转换为 MP3 / FLAC 后播放`)
            } else {
              useStore.getState().setToast(`「${name}」无法播放：音频解码失败，可能是文件损坏或服务器不支持 Range 续传`)
            }
          } else {
            console.error('[audio] 播放出错:', code, el.error?.message, el.src)
          }
          useStore.setState({ isPlaying: false })
        }}
        onEnded={onEnded}
      />
      <div
        className="cover cover-click"
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
        onClick={() => setShowNowPlaying(true)}
        title="点击进入全屏播放"
      />
      <div className="now">
        <div className="t">{cur ? cur.name : '未播放'}</div>
        <div className="s">
          {queue.length ? `队列 ${currentIndex + 1}/${queue.length}` : '从音乐库选一首歌吧'}
        </div>
      </div>
      <div className="controls">
        <button onClick={prev} title="上一首">⏮</button>
        <button className="primary" onClick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
        <button onClick={next} title="下一首">⏭</button>
        <button onClick={cycleMode} title={`播放模式：${MODE_LABEL[settings.playMode] || '顺序播放'}（点击切换）`}>{MODE_ICON[settings.playMode]}</button>
      </div>
      <div className="progress">
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
      <button className="ghost" onClick={() => toggle('showInfo')} title="歌曲信息" style={{ color: useStore.getState().showInfo ? 'var(--accent)' : undefined }}>
        ℹ️
      </button>
      <button className="now-btn" onClick={() => setShowNowPlaying(true)} title="全屏播放">
        🎴 全屏
      </button>
      <button className="ghost" onClick={() => toggle('showLyrics')} title="歌词">📝</button>
      <button className="ghost" onClick={() => toggle('showEq')} title="均衡器">🎛️</button>
      <button className="ghost" onClick={() => toggle('desktopLyric')} title="桌面歌词" style={{ color: desktopLyric ? 'var(--accent)' : undefined }}>
        🖥️
      </button>
    </div>
  )
}
