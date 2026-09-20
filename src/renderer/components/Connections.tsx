import { useState } from 'react'
import { useStore } from '../store'
import { Account } from '../api'
import { IconMusic, IconPlus, IconFolder, IconTrash, IconPlay, IconDisc } from './Icons'

export default function Connections() {
  const { accounts, addAccount, removeAccount, openDir } = useStore()
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '' })
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!form.name || !form.url) return
    setBusy(true)
    try {
      const acc: Account = {
        id: Date.now().toString(),
        name: form.name,
        url: form.url.replace(/\/$/, ''),
        username: form.username,
        password: form.password
      }
      await addAccount(acc)
      setForm({ name: '', url: '', username: '', password: '' })
      await openDir(acc.id, '/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-title">音乐库</span>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {accounts.length ? `${accounts.length} 个网盘连接` : '尚未连接网盘'}
        </span>
      </div>

      <div className="main-body">
        {accounts.length === 0 ? (
          <div className="empty" style={{ paddingTop: 60 }}>
            <div className="empty-icon">
              <IconMusic size={28} />
            </div>
            <div className="empty-title">连接你的第一个 WebDAV 网盘</div>
            <div className="empty-desc">
              支持坚果云、Nextcloud、群晖、自建 WebDAV 等。连接后即可浏览并播放网盘里的音乐文件，
              播放请求由本机发起，不受浏览器跨域限制。
            </div>
          </div>
        ) : (
          <>
            <div className="page-head">
              <div>
                <h1 className="page-title">音乐库</h1>
                <div className="page-sub">{accounts.length} 个网盘连接</div>
              </div>
            </div>
            <div className="grid grid-sm" style={{ marginBottom: 30 }}>
              {accounts.map((a) => (
                <div className="album-card" key={a.id}>
                  <div
                    className="album-art no-art"
                    onClick={() => openDir(a.id, '/')}
                    style={{ backgroundImage: `linear-gradient(145deg, color-mix(in srgb, var(--accent) 55%, #2a2a33), #1d1d24)` }}
                  >
                    <IconDisc size={44} style={{ color: 'rgba(255,255,255,.85)' }} />
                    <button
                      className="art-play"
                      title="进入"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDir(a.id, '/')
                      }}
                    >
                      <IconPlay size={15} style={{ marginLeft: 2 }} />
                    </button>
                  </div>
                  <div className="album-title" title={a.name}>
                    {a.name}
                  </div>
                  <div className="album-sub" title={a.url}>
                    {a.url}
                  </div>
                  <button
                    className="ghost"
                    style={{ marginTop: 6, fontSize: 11.5, padding: '3px 8px', width: '100%' }}
                    onClick={() => removeAccount(a.id)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <IconTrash size={13} /> 删除
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 添加连接 */}
        <div className="card" style={{ maxWidth: 620 }}>
          <div className="row" style={{ marginBottom: 14 }}>
            <IconFolder size={18} style={{ color: 'var(--accent)' }} />
            <b style={{ fontSize: 15 }}>添加 WebDAV 连接</b>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <input
              placeholder="名称（如：我的坚果云）"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="WebDAV 地址（如 https://dav.jianguoyun.com/dav）"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <div className="row" style={{ gap: 10 }}>
              <input
                placeholder="用户名"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                placeholder="密码 / 授权码"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
            <button className="primary" disabled={busy || !form.name || !form.url} onClick={submit} style={{ height: 36 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconPlus size={15} /> {busy ? '连接中…' : '保存并连接'}
              </span>
            </button>
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
              提示：坚果云使用「第三方应用密码」而非登录密码；群晖需开启 WebDAV Server 套件；
              自建服务器地址通常以 <code>/dav</code> 或 <code>/webdav</code> 结尾。
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
