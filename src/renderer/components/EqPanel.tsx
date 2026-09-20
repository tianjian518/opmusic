import { useStore } from '../store'
import { IconClose, IconSliders } from './Icons'

const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

// 常用预设（增益 dB）
const PRESETS: Array<{ name: string; eq: number[] }> = [
  { name: '原声', eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '流行', eq: [-1, 0, 2, 4, 4, 2, 0, -1, -1, -2] },
  { name: '摇滚', eq: [4, 3, 1, -1, -2, -1, 2, 4, 5, 5] },
  { name: '爵士', eq: [3, 2, 1, 1, -1, -1, 1, 2, 3, 4] },
  { name: '古典', eq: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { name: '低音增强', eq: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: '高音增强', eq: [0, 0, 0, 0, 0, 2, 4, 5, 6, 7] },
  { name: '人声', eq: [-3, -2, 0, 2, 4, 4, 3, 1, 0, -1] }
]

export default function EqPanel() {
  const { settings, setEq, toggle } = useStore()
  const eq = settings.eq

  const update = (i: number, v: number) => {
    const next = [...eq]
    next[i] = v
    setEq(next)
  }

  const isPreset = (p: number[]) => p.every((v, i) => v === (eq[i] || 0))

  return (
    <div className="panel side-panel">
      <div className="panel-head">
        <h3>均衡器</h3>
        <button className="close" onClick={() => toggle('showEq')} title="关闭">
          <IconClose size={16} />
        </button>
      </div>

      <div className="panel-body">
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          预设
        </div>
        <div className="inline" style={{ marginBottom: 18, gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className={isPreset(p.eq) ? 'primary' : 'ghost'}
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => setEq([...p.eq])}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="row" style={{ marginBottom: 14, gap: 8 }}>
          <span className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconSliders size={14} /> 10 段均衡
          </span>
          <span className="spacer" />
          <button
            className="ghost"
            style={{ fontSize: 12, padding: '5px 10px' }}
            onClick={() => setEq([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])}
          >
            重置
          </button>
        </div>

        {FREQS.map((f, i) => {
          const v = eq[i] || 0
          const pct = ((v + 12) / 24) * 100
          return (
            <div className="eq-row" key={f}>
              <label>{f >= 1000 ? f / 1000 + 'k' : f}</label>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={v}
                onChange={(e) => update(i, parseFloat(e.target.value))}
                style={{
                  ['--track' as any]: `linear-gradient(to right, var(--bg-4) ${pct}%, var(--bg-4) ${pct}%)`
                }}
              />
              <span className="val" style={{ color: v !== 0 ? 'var(--accent)' : undefined }}>
                {v > 0 ? '+' : ''}
                {v}dB
              </span>
            </div>
          )
        })}

        <div className="muted" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.7 }}>
          均衡器基于 Web Audio BiquadFilter 实现，调整即时生效。负值衰减、正值增益，范围 ±12dB。
        </div>
      </div>
    </div>
  )
}
