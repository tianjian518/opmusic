import { useStore } from '../store'

const FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export default function EqPanel() {
  const { settings, setEq, toggle } = useStore()
  const eq = settings.eq

  const update = (i: number, v: number) => {
    const next = [...eq]
    next[i] = v
    setEq(next)
  }

  return (
    <div className="panel side-panel">
      <button className="close" onClick={() => toggle('showEq')}>
        ✕
      </button>
      <h3>均衡器</h3>
      <button
        className="ghost"
        onClick={() => setEq([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])}
        style={{ marginBottom: 12 }}
      >
        重置
      </button>
      {FREQS.map((f, i) => (
        <div className="eq-row" key={f}>
          <label>{f >= 1000 ? f / 1000 + 'k' : f}</label>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={eq[i] || 0}
            onChange={(e) => update(i, parseFloat(e.target.value))}
          />
          <span className="meta" style={{ width: 34, textAlign: 'right' }}>
            {eq[i] || 0}dB
          </span>
        </div>
      ))}
    </div>
  )
}
