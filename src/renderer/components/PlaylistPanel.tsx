import { useStore } from '../store'
import { IconClose, IconMusic, IconClose as IconX, IconVolume, IconTrash } from './Icons'

export default function PlaylistPanel() {
  const { queue, currentIndex, selectTrack, toggle } = useStore() as any

  const remove = (i: number) => {
    const q = queue.filter((_: any, idx: number) => idx !== i)
    useStore.setState({
      queue: q,
      currentIndex: currentIndex === i ? -1 : currentIndex > i ? currentIndex - 1 : currentIndex
    })
  }

  const clearAll = () => useStore.setState({ queue: [], currentIndex: -1, isPlaying: false })

  return (
    <div className="panel side-panel">
      <div className="panel-head">
        <h3>播放队列</h3>
        <span className="badge">{queue.length}</span>
        <button className="close" onClick={() => toggle('showPlaylist')} title="关闭">
          <IconClose size={16} />
        </button>
      </div>

      <div className="panel-body">
        {queue.length > 1 && (
          <div className="panel-tools">
            <span className="muted" style={{ fontSize: 12 }}>
              接下来 {queue.length - currentIndex - 1} 首
            </span>
            <span className="spacer" />
            <button className="ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={clearAll}>
              清空队列
            </button>
          </div>
        )}

        {queue.length === 0 ? (
          <div className="empty" style={{ padding: '50px 10px' }}>
            <div className="empty-icon">
              <IconMusic size={24} />
            </div>
            <div className="empty-title" style={{ fontSize: 14 }}>
              队列是空的
            </div>
            <div className="empty-desc" style={{ fontSize: 12 }}>
              在音乐库里点歌曲行的「＋」加入队列，或直接点歌播放。
            </div>
          </div>
        ) : (
          <div className="list">
            {queue.map((t: any, i: number) => (
              <div className={`queue-item ${i === currentIndex ? 'active' : ''}`} key={i}>
                <span className="q-idx">
                  {i === currentIndex ? <IconVolume size={14} /> : i + 1}
                </span>
                <span className="q-name" onClick={() => selectTrack(i)} title={t.name}>
                  {t.name}
                </span>
                <button className="mini" title="从队列移除" onClick={() => remove(i)}>
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
