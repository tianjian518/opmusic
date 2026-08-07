import { useStore } from '../store'

const ACCENTS = ['#1db954', '#e91e63', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4']

const SKINS = [
  { id: 'midnight', name: '暗夜黑', bg: '#0f0f12', bg2: '#202028' },
  { id: 'charcoal', name: '深灰', bg: '#1b1b1f', bg2: '#313139' },
  { id: 'graphite', name: '蓝灰', bg: '#16191f', bg2: '#2a313b' },
  { id: 'light', name: '纯白', bg: '#f4f4f6', bg2: '#ececf0' },
  { id: 'lightgray', name: '浅灰', bg: '#e9e9ee', bg2: '#dadade' },
  { id: 'sky', name: '浅蓝', bg: '#e6f0fb', bg2: '#d3e5f6' },
  { id: 'lavender', name: '浅紫', bg: '#efe9fb', bg2: '#e2d7f4' },
  { id: 'mint', name: '浅绿', bg: '#e6f7ee', bg2: '#d3ecdf' },
  { id: 'rose', name: '浅粉', bg: '#fdeef3', bg2: '#f6dbe4' }
]

const GRADIENTS = [
  { id: 'aurora', name: '极光', css: 'linear-gradient(135deg,#1f2a44,#3a1f4d,#163a3f)' },
  { id: 'sunset', name: '晚霞', css: 'linear-gradient(135deg,#ff9a9e,#fad0c4,#fbc2eb)' },
  { id: 'ocean', name: '海洋', css: 'linear-gradient(135deg,#2193b0,#6dd5ed)' },
  { id: 'purple', name: '紫罗兰', css: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { id: 'spring', name: '春樱', css: 'linear-gradient(135deg,#a8edea,#fed6e3)' },
  { id: 'graphite', name: '石墨', css: 'linear-gradient(135deg,#232526,#414345)' }
]

// 把用户选的图片压缩到合适尺寸，避免 config.json 过大
function pickImageAsDataUrl(file: File, cb: (url: string) => void) {
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const max = 1600
      let w = img.width
      let h = img.height
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h)
        w = Math.round(w * r)
        h = Math.round(h * r)
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d')!.drawImage(img, 0, 0, w, h)
      cb(c.toDataURL('image/jpeg', 0.85))
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
}

export default function SettingsPanel() {
  const { settings, setVolume, setPlayMode, toggle } = useStore()

  const patch = (p: Partial<typeof settings>) => {
    useStore.setState({ settings: { ...useStore.getState().settings, ...p } })
    useStore.getState().saveSettings()
  }

  return (
    <div className="panel side-panel">
      <button className="close" onClick={() => toggle('showSettings')}>
        ✕
      </button>
      <h3>设置</h3>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <b>皮肤</b>
        </div>
        <div className="skin-grid">
          {SKINS.map((s) => (
            <div
              key={s.id}
              className={`skin-chip ${settings.skin === s.id ? 'active' : ''}`}
              onClick={() => patch({ skin: s.id })}
            >
              <div className="skin-swatch" style={{ background: `linear-gradient(135deg, ${s.bg}, ${s.bg2})` }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <b>强调色</b>
        </div>
        <div className="inline" style={{ marginBottom: 8 }}>
          {ACCENTS.map((c) => (
            <div
              key={c}
              className={`swatch ${settings.accent === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => patch({ accent: c })}
            />
          ))}
          <input
            type="color"
            value={settings.accent}
            style={{ width: 32, height: 28, padding: 2, background: 'transparent', border: '1px solid var(--line)' }}
            onChange={(e) => patch({ accent: e.target.value })}
            title="自定义强调色"
          />
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <b>玻璃渐变虚化</b>
          <span className="spacer" />
          <button className="ghost" onClick={() => patch({ glass: !settings.glass })}>
            {settings.glass ? '✅ 已开启' : '⬜ 关闭'}
          </button>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="muted">模糊强度</span>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={settings.glassBlur}
            style={{ flex: 1 }}
            onChange={(e) => patch({ glassBlur: parseInt(e.target.value, 10) })}
          />
          <span className="muted">{settings.glassBlur}px</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          建议配合下方「背景图」或「渐变」使用，虚化效果更明显。
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <b>背景</b>
          <span className="spacer" />
          {(settings.bgImage || settings.bgGradient) && (
            <button className="ghost" onClick={() => patch({ bgImage: null, bgGradient: null })}>
              清除背景
            </button>
          )}
        </div>

        <div className="muted" style={{ marginBottom: 6 }}>渐变预设</div>
        <div className="grad-grid" style={{ marginBottom: 12 }}>
          {GRADIENTS.map((g) => (
            <div
              key={g.id}
              className={`grad-chip ${settings.bgGradient === g.css && !settings.bgImage ? 'active' : ''}`}
              style={{ background: g.css }}
              title={g.name}
              onClick={() => patch({ bgGradient: g.css, bgImage: null })}
            />
          ))}
        </div>

        <div className="muted" style={{ marginBottom: 6 }}>自定义背景图</div>
        <div className="inline">
          <label className="ghost" style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', cursor: 'pointer' }}>
            选择图片
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) pickImageAsDataUrl(f, (url) => patch({ bgImage: url, bgGradient: null }))
              }}
            />
          </label>
          {settings.bgImage && <span className="muted" style={{ fontSize: 12 }}>已设置背景图</span>}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <b>音量</b>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={settings.volume}
          style={{ width: '100%' }}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <b>默认播放模式</b>
        </div>
        <select value={settings.playMode} onChange={(e) => setPlayMode(e.target.value as any)} style={{ width: '100%' }}>
          <option value="order">顺序播放</option>
          <option value="loop-list">列表循环</option>
          <option value="loop-one">单曲循环</option>
          <option value="shuffle">随机播放</option>
        </select>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <b>播放时自动全屏</b>
          <span className="spacer" />
          <button className="ghost" onClick={() => patch({ autoFullscreen: !settings.autoFullscreen })}>
            {settings.autoFullscreen ? '✅ 已开启' : '⬜ 关闭'}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          关闭后，从歌单/列表点歌只会在底部播放条播放，不会自动跳到全屏；需要全屏时再点播放条上的「全屏播放」按钮。
        </div>
      </div>
    </div>
  )
}
