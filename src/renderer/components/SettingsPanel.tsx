import { useStore } from '../store'
import { IconClose } from './Icons'

const ACCENTS = [
  { c: '#fa2d48', n: '音乐红' },
  { c: '#fc5c7d', n: '樱粉' },
  { c: '#bf5af2', n: '紫罗兰' },
  { c: '#4d9dfd', n: '天蓝' },
  { c: '#1db954', n: '森林绿' },
  { c: '#ffb340', n: '琥珀' }
]

const SKINS = [
  { id: 'midnight', name: '暗夜黑', bg: '#16161a', bg2: '#2c2c2e' },
  { id: 'charcoal', name: '深灰', bg: '#1b1b1f', bg2: '#313139' },
  { id: 'graphite', name: '蓝灰', bg: '#15181d', bg2: '#272d37' },
  { id: 'light', name: '纯白', bg: '#f2f2f4', bg2: '#ebebef' },
  { id: 'lightgray', name: '浅灰', bg: '#e4e4e9', bg2: '#e3e3e8' },
  { id: 'sky', name: '浅蓝', bg: '#dbe8f7', bg2: '#dceaf8' },
  { id: 'lavender', name: '浅紫', bg: '#e8e2f6', bg2: '#e8e0f8' },
  { id: 'mint', name: '浅绿', bg: '#ddefe6', bg2: '#ddeee6' },
  { id: 'rose', name: '浅粉', bg: '#fbe6ee', bg2: '#fbe4ed' }
]

const GRADIENTS = [
  { id: 'aurora', name: '极光', css: 'linear-gradient(135deg,#1f2a44,#3a1f4d,#163a3f)' },
  { id: 'sunset', name: '晚霞', css: 'linear-gradient(135deg,#ff9a9e,#fad0c4,#fbc2eb)' },
  { id: 'ocean', name: '海洋', css: 'linear-gradient(135deg,#2193b0,#6dd5ed)' },
  { id: 'purple', name: '紫罗兰', css: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { id: 'spring', name: '春樱', css: 'linear-gradient(135deg,#a8edea,#fed6e3)' },
  { id: 'graphite', name: '石墨', css: 'linear-gradient(135deg,#232526,#414345)' },
  { id: 'night', name: '夜幕', css: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)' },
  { id: 'peach', name: '蜜桃', css: 'linear-gradient(135deg,#ffecd2,#fcb69f)' }
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
  const { settings, setVolume, setPlayMode, toggle, patchSettings } = useStore()

  // 统一走 store 的 patchSettings（内部已负责落盘）
  const patch = (p: Partial<typeof settings>) => patchSettings(p)

  return (
    <div className="panel side-panel">
      <div className="panel-head">
        <h3>设置</h3>
        <button className="close" onClick={() => toggle('showSettings')} title="关闭">
          <IconClose size={16} />
        </button>
      </div>

      <div className="panel-body">
        {/* ---- 外观 ---- */}
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          外观
        </div>

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <b style={{ fontSize: 13 }}>主题皮肤</b>
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

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <b style={{ fontSize: 13 }}>强调色</b>
          <div className="inline">
            {ACCENTS.map((a) => (
              <div
                key={a.c}
                className={`swatch ${settings.accent === a.c ? 'active' : ''}`}
                style={{ background: a.c }}
                title={a.n}
                onClick={() => patch({ accent: a.c })}
              />
            ))}
            <input
              type="color"
              value={settings.accent}
              style={{ width: 30, height: 26, padding: 1, background: 'transparent', border: '1px solid var(--line-strong)', borderRadius: 6 }}
              onChange={(e) => patch({ accent: e.target.value })}
              title="自定义强调色"
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="sr-label">
            <b>玻璃虚化</b>
            <small>侧栏与播放条毛玻璃背景。建议配合背景图或渐变使用。</small>
          </div>
          <button className={`toggle ${settings.glass ? 'on' : ''}`} onClick={() => patch({ glass: !settings.glass })} />
        </div>

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div className="row">
            <span className="muted" style={{ fontSize: 12 }}>
              模糊强度
            </span>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>
              {settings.glassBlur}px
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={settings.glassBlur}
            style={{
              width: '100%',
              ['--track' as any]: `linear-gradient(to right, var(--accent) ${(settings.glassBlur / 30) * 100}%, var(--bg-4) ${
                (settings.glassBlur / 30) * 100
              }%)`
            }}
            onChange={(e) => patch({ glassBlur: parseInt(e.target.value, 10) })}
          />
        </div>

        <div className="divider" />

        {/* ---- 背景 ---- */}
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          背景
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            渐变预设
          </span>
          <span className="spacer" />
          {(settings.bgImage || settings.bgGradient) && (
            <button className="ghost" style={{ fontSize: 12, padding: '4px 9px' }} onClick={() => patch({ bgImage: null, bgGradient: null })}>
              清除
            </button>
          )}
        </div>
        <div className="grad-grid" style={{ marginBottom: 14 }}>
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
        <div className="inline" style={{ marginBottom: 6 }}>
          <label
            className="ghost"
            style={{
              padding: '7px 13px',
              borderRadius: 8,
              border: '1px solid var(--line-strong)',
              cursor: 'pointer',
              fontSize: 12.5,
              background: 'var(--bg-3)'
            }}
          >
            选择本地图片
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
          {settings.bgImage && <span className="muted" style={{ fontSize: 11.5 }}>已设置自定义背景图</span>}
        </div>

        <div className="divider" />

        {/* ---- 播放 ---- */}
        <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
          播放
        </div>

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div className="row">
            <span className="muted" style={{ fontSize: 12 }}>
              音量
            </span>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>
              {Math.round(settings.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            style={{
              width: '100%',
              ['--track' as any]: `linear-gradient(to right, var(--accent) ${settings.volume * 100}%, var(--bg-4) ${
                settings.volume * 100
              }%)`
            }}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </div>

        <div className="setting-row">
          <div className="sr-label">
            <b>默认播放模式</b>
          </div>
          <select value={settings.playMode} onChange={(e) => setPlayMode(e.target.value as any)} style={{ width: 116 }}>
            <option value="order">顺序播放</option>
            <option value="loop-list">列表循环</option>
            <option value="loop-one">单曲循环</option>
            <option value="shuffle">随机播放</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="sr-label">
            <b>点歌自动全屏</b>
            <small>关闭后，从列表点歌只会在底部播放条播放，需要全屏时手动点开。</small>
          </div>
          <button className={`toggle ${settings.autoFullscreen ? 'on' : ''}`} onClick={() => patch({ autoFullscreen: !settings.autoFullscreen })} />
        </div>

        <div className="divider" />

        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.8 }}>
          天剑音乐播放器 · 支持 WebDAV 网盘直连播放
          <br />
          主题、背景、音量、歌单等设置会自动保存到本地。
        </div>
      </div>
    </div>
  )
}
