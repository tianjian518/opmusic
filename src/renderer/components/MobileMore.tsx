// 手机端「更多」页：把桌面侧栏里的播放入口与设置集中于此。
// 侧边面板在手机端是底部抽屉，这里只做入口按钮。
import { useStore } from '../store'
import { haptic } from '../device'
import { IconLyrics, IconMusic, IconSliders, IconInfo, IconMonitor, IconSettings, IconArrowLeft, IconPlay } from './Icons'

export default function MobileMore() {
  const { toggle, settings, queue, currentIndex, desktopLyric } = useStore()
  const s = useStore()
  const cur = currentIndex >= 0 ? queue[currentIndex] : null

  const entries: Array<{
    key: 'showPlaylist' | 'showLyrics' | 'showEq' | 'showInfo' | 'desktopLyric' | 'showSettings'
    icon: JSX.Element
    title: string
    desc: string
    on?: boolean
  }> = [
    { key: 'showPlaylist', icon: <IconMusic size={20} />, title: '播放队列', desc: queue.length ? `${queue.length} 首` : '空', on: s.showPlaylist },
    { key: 'showLyrics', icon: <IconLyrics size={20} />, title: '歌词', desc: '查看当前歌曲歌词', on: s.showLyrics },
    { key: 'showInfo', icon: <IconInfo size={20} />, title: '歌曲信息', desc: '封面、专辑与歌手简介', on: s.showInfo },
    { key: 'showEq', icon: <IconSliders size={20} />, title: '均衡器', desc: '10 段音效调节', on: s.showEq },
    { key: 'desktopLyric', icon: <IconMonitor size={20} />, title: '桌面歌词', desc: '悬浮歌词窗（桌面端）', on: desktopLyric },
    { key: 'showSettings', icon: <IconSettings size={20} />, title: '设置', desc: '主题、背景与播放偏好', on: s.showSettings }
  ]

  return (
    <div className="main">
      <div className="main-body">
        <div className="page-head">
          <div>
            <h1 className="page-title">更多</h1>
            <div className="page-sub">{cur ? `正在播放：${cur.name}` : '未在播放'}</div>
          </div>
        </div>

        <div className="list">
          {entries.map((e) => (
            <div
              key={e.key}
              className="item"
              onClick={() => {
                haptic()
                toggle(e.key)
              }}
            >
              <span className={`nav-icon ${e.on ? 'ic-red' : 'ic-gray'}`} style={{ width: 30, height: 30, borderRadius: 8 }}>
                {e.icon}
              </span>
              <span className="name" style={{ textDecoration: 'none' }}>
                <b style={{ fontSize: 14 }}>{e.title}</b>
                <div className="muted" style={{ fontSize: 11.5, fontWeight: 400, marginTop: 1 }}>
                  {e.desc}
                </div>
              </span>
              <IconArrowLeft size={16} style={{ transform: 'rotate(180deg)', color: 'var(--text-3)' }} />
            </div>
          ))}
        </div>

        <div className="hint" style={{ marginTop: 16, textAlign: 'left', lineHeight: 1.9 }}>
          <b style={{ color: 'var(--text)' }}>手机端小技巧</b>
          <br />
          · 看歌词：播放页底部点「歌词」，或用鼠标/手指上滑
          <br />
          · 切歌：播放页封面区域左右滑动
          <br />
          · 收起播放页：向下滑动，或按手机返回键
          <br />
          · 装到桌面：浏览器菜单选「添加到主屏幕」
        </div>
      </div>
    </div>
  )
}
