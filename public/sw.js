// 极简 Service Worker：缓存应用外壳，使 PWA 可“添加到主屏幕”安装并离线打开。
// 注意：媒体/封面走运行时网络缓存，不预存大文件。
const CACHE = 'tianjian-shell-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 仅处理同源资源；跨域（WebDAV / 刮削接口）直接走网络
  if (url.origin !== self.location.origin) return

  // 导航请求：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')))
    return
  }
  // 静态资源：缓存优先，缺失则网络并写入缓存
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
    })
  )
})
