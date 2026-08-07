import { useStore } from '../store'

export default function PlaylistPanel() {
  const { queue, currentIndex, selectTrack, toggle } = useStore() as any
  const remove = (i: number) => {
    const q = queue.filter((_: any, idx: number) => idx !== i)
    useStore.setState({
      queue: q,
      currentIndex: currentIndex === i ? -1 : currentIndex > i ? currentIndex - 1 : currentIndex
    })
  }
  return (
    <div className="panel side-panel">
      <button className="close" onClick={() => toggle('showPlaylist')}>
        ✕
      </button>
      <h3>播放队列（{queue.length}）</h3>
      <div className="list">
        {queue.length === 0 && <div className="hint">队列为空。在音乐库点 ＋ 加入队列。</div>}
        {queue.map((t: any, i: number) => (
          <div className={`item ${i === currentIndex ? 'active' : ''}`} key={i}>
            <span className="icon">{i === currentIndex ? '🔊' : '🎵'}</span>
            <span className="name" onClick={() => selectTrack(i)}>
              {t.name}
            </span>
            <button className="ghost" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
