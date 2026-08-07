import { useState } from 'react'
import { useStore } from '../store'
import { Account } from '../api'

export default function Connections() {
  const { accounts, addAccount, removeAccount, openDir } = useStore()
  const [form, setForm] = useState({ name: '', url: '', username: '', password: '' })

  const submit = async () => {
    if (!form.name || !form.url) return
    const acc: Account = {
      id: Date.now().toString(),
      name: form.name,
      url: form.url.replace(/\/$/, ''),
      username: form.username,
      password: form.password
    }
    await addAccount(acc)
    await openDir(acc.id, '/')
  }

  return (
    <div>
      <h3>WebDAV 网盘连接</h3>
      {accounts.length === 0 && (
        <div className="hint">还没有连接任何网盘。添加一个 WebDAV 账号，即可浏览并播放网盘里的音乐。</div>
      )}
      {accounts.map((a) => (
        <div className="card row" key={a.id}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{a.name}</div>
            <div className="muted">{a.url}</div>
          </div>
          <button className="primary" onClick={() => openDir(a.id, '/')}>
            进入
          </button>
          <button className="ghost" onClick={() => removeAccount(a.id)}>
            删除
          </button>
        </div>
      ))}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>添加连接</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <input placeholder="名称（如：我的坚果云）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="WebDAV 地址（如 https://dav.jianguoyun.com/dav）" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input placeholder="用户名" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input placeholder="密码 / 授权码" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className="primary" onClick={submit}>
            保存并连接
          </button>
        </div>
      </div>
    </div>
  )
}
