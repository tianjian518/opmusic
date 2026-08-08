// OpMusic —— 自托管 Web 后端
// 职责：
//   1) /api/accounts          账号 CRUD（WebDAV 凭据由服务端保管，供代理使用）
//   2) /stream                代理 WebDAV 音频，支持 Range 续传；WMA/APE 用 ffmpeg 实时转 MP3
//   3) /cover                 优先读目录内 folder.jpg/cover.jpg，缺失则在线刮削兜底
//   4) /lyrics                读同名 .lrc
//   5) /tags /duration        用 ffprobe / music-metadata 读内嵌标签与真实时长
//   6) /api/store             通用键值存储（歌单/收藏/设置 服务端持久化，跨设备共享）
//   7) 静态托管前端 dist/（SPA 回退）
// 直接用 `node server/index.mjs` 运行；Docker 中由镜像入口启动。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createClient } from 'webdav'
import * as mm from 'music-metadata'
import { getAccounts, getAccount, upsertAccount, deleteAccount, getKV, setKV } from './store.mjs'
import { coverBytesFor } from './cover.mjs'

// ---- 在线歌词（服务端代理抓取，绕开浏览器 CORS）----
// 网易云优先，lrclib / lyrics.ovh 兜底；与前端 webMeta.ts 逻辑一致，但由服务器发起请求。
async function srvFetchJson(url, timeout = 8000, headers) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'OpMusicPlayer/1.0', Accept: 'application/json', ...(headers || {}) },
      signal: ctrl.signal
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
async function srvNeteaseLyrics(artist, title) {
  const trySearch = async (q) => {
    const s = await srvFetchJson(
      `https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(q)}&limit=10`,
      8000,
      { Referer: 'https://music.163.com/' }
    )
    const songs = s?.result?.songs || []
    if (!songs.length) return null
    const fetched = await Promise.all(
      songs.slice(0, 8).map(async (song) => {
        if (!song.id) return null
        const l = await srvFetchJson(
          `https://music.163.com/api/song/lyric?id=${song.id}&lv=-1&kv=-1&tv=-1`,
          8000,
          { Referer: 'https://music.163.com/' }
        )
        const lyric = l?.lrc?.lyric || l?.tlyric?.lyric || ''
        if (!lyric.trim()) return null
        const artistHit = artist
          ? (song.artists || []).some((a) => a.name && (a.name === artist || a.name.includes(artist) || artist.includes(a.name)))
          : true
        return { lyric, len: lyric.length, artistHit }
      })
    )
    const ok = fetched.filter(Boolean)
    if (!ok.length) return null
    ok.sort((a, b) => (b.artistHit ? 1 : 0) - (a.artistHit ? 1 : 0) || b.len - a.len)
    return ok[0].lyric
  }
  if (artist) {
    const r = await trySearch(`${artist} ${title}`)
    if (r) return r
  }
  return trySearch(title)
}
const SRV_LYRIC_SOURCES = [
  srvNeteaseLyrics,
  async (artist, title) => {
    const d = await srvFetchJson(`https://lrclib.net/api/search?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}`)
    const list = Array.isArray(d) ? d : []
    const w = list.find((x) => x?.syncedLyrics) || list[0]
    return w?.syncedLyrics || w?.plainLyrics || null
  },
  async (artist, title) => {
    if (!artist) return null
    const p = await srvFetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`)
    return p?.lyrics || null
  }
]
async function onlineLyricsServer(artist, title) {
  if (!artist && !title) return null
  const combos = artist ? [[artist, title], ['', title]] : [['', title]]
  for (const [a, t] of combos) {
    let settled = false
    let result = null
    await new Promise((resolve) => {
      let remaining = SRV_LYRIC_SOURCES.length
      SRV_LYRIC_SOURCES.forEach((src) =>
        src(a, t)
          .then((r) => {
            if (!settled && r && r.trim()) { settled = true; result = r; resolve(r) }
            else { remaining--; if (remaining === 0) resolve(null) }
          })
          .catch(() => { remaining--; if (remaining === 0) resolve(null) })
      )
    })
    if (result) return result
  }
  return null
}

const PORT = parseInt(process.env.PORT || '8080', 10)
const DIST = process.env.DIST_DIR || path.join(process.cwd(), 'dist')
const TJ_USER = process.env.TJ_USER || ''
const TJ_PASSWORD = process.env.TJ_PASSWORD || ''

// ffmpeg / ffprobe 探测（WMA/APE 转码与标签读取需要）
let FFMPEG_OK = false
let FFMPEG_BIN = 'ffmpeg'
let FFPROBE_BIN = 'ffprobe'
try {
  execFileSync(FFMPEG_BIN, ['-version'], { stdio: 'ignore' })
  execFileSync(FFPROBE_BIN, ['-version'], { stdio: 'ignore' })
  FFMPEG_OK = true
} catch {
  FFMPEG_OK = false
}

// ---- WebDAV 客户端缓存 ----
const clientCache = new Map()
function getClient(accountId) {
  let c = clientCache.get(accountId)
  if (!c) {
    const acc = getAccount(accountId)
    if (!acc) throw new Error('账号不存在: ' + accountId)
    c = createClient(acc.url.replace(/\/$/, '') + '/', { username: acc.username, password: acc.password })
    clientCache.set(accountId, c)
  }
  return c
}

function contentType(name) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map = {
    mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg',
    m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', ape: 'audio/x-ape',
    wma: 'audio/x-ms-wma', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', lrc: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml', ico: 'image/x-icon', webmanifest: 'application/manifest+json'
  }
  return map[ext] || 'application/octet-stream'
}

function parseRange(req) {
  const h = req.headers.range
  if (!h) return null
  const m = /bytes=(\d+)-(\d*)/.exec(h)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = m[2] ? parseInt(m[2], 10) : undefined
  return { start, end }
}

async function getFileSize(client, p) {
  const idx = p.lastIndexOf('/')
  const parent = idx <= 0 ? '/' : p.slice(0, idx)
  const base = p.slice(idx + 1)
  try {
    const listing = await client.getDirectoryContents(parent)
    const arr = Array.isArray(listing) ? listing : listing.data || []
    const item = arr.find((i) => i.basename === base)
    return item?.size || 0
  } catch {
    return 0
  }
}

async function fetchBytes(client, p, rangeHeader) {
  const resp = await client.customRequest(p, { method: 'GET', headers: rangeHeader ? { Range: rangeHeader } : {} })
  const buf = Buffer.from(await resp.arrayBuffer())
  const cr = resp.headers?.get?.('content-range')
  const cl = resp.headers?.get?.('content-length')
  return {
    status: resp.status || (rangeHeader ? 206 : 200),
    contentRange: cr || undefined,
    contentLength: cl ? parseInt(cl, 10) : undefined,
    buf
  }
}

function transcodeToMp3(input, req, res) {
  const ffmpeg = spawn(FFMPEG_BIN, ['-i', 'pipe:0', '-f', 'mp3', '-ab', '320k', '-map', '0:a:0', '-y', 'pipe:1'])
  ffmpeg.stdin.on('error', () => {})
  res.on('error', () => {})
  ffmpeg.stdin.write(input)
  ffmpeg.stdin.end()
  ffmpeg.stdout.pipe(res)
  ffmpeg.stderr.on('data', () => {})
  ffmpeg.on('error', () => { try { res.statusCode = 500; res.end('transcode failed') } catch {} })
  ffmpeg.on('close', () => { try { if (!res.writableEnded) res.end() } catch {} })
  req.on('close', () => { try { ffmpeg.kill('SIGKILL') } catch {} })
}

// ---- 标签 / 时长 ----
async function readFull(client, p) {
  const resp = await client.customRequest(p, { method: 'GET' })
  return Buffer.from(await resp.arrayBuffer())
}
function ffprobeTags(buf) {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn(FFPROBE_BIN, ['-v', 'error', '-show_format', '-show_entries', 'format=tags', '-of', 'json', 'pipe:0'])
    p.stdin.on('error', () => {})
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', () => {
      try {
        const j = JSON.parse(out)
        const tg = j?.format?.tags || {}
        const g = (k) => { const v = tg[k] ?? tg[k.toUpperCase()]; return typeof v === 'string' && v.trim() ? v.trim() : undefined }
        const rawYear = g('date') || g('year')
        const y = rawYear ? rawYear.replace(/\D/g, '').slice(0, 4) : undefined
        const dur = j?.format?.duration
        resolve({
          artist: g('artist'), album: g('album'), title: g('title'),
          year: y && /^\d{4}$/.test(y) ? y : undefined,
          duration: typeof dur === 'number' && isFinite(dur) && dur > 0 ? dur : undefined
        })
      } catch { resolve(null) }
    })
    try { p.stdin.write(buf); p.stdin.end() } catch { resolve(null) }
  })
}
async function getTrackTags(accountId, filePath) {
  if (!FFMPEG_OK) return null
  const client = getClient(accountId)
  let buf
  try { buf = await readFull(client, filePath) } catch { return null }
  const t = await ffprobeTags(buf)
  if (t && (t.artist || t.album || t.title || t.year || t.duration)) return t
  try {
    const meta = await mm.parseBuffer(buf, { path: filePath })
    const c = meta.common
    const artist = c.artist || (Array.isArray(c.artists) && c.artists.length ? c.artists.join('/') : undefined)
    const tags = {}
    if (artist) tags.artist = artist
    if (c.album) tags.album = c.album
    if (c.title) tags.title = c.title
    if (c.year) tags.year = String(c.year)
    else if (c.date) { const y = String(c.date).slice(0, 4); if (/^\d{4}$/.test(y)) tags.year = y }
    if (c.track?.no) tags.track = Number(c.track.no)
    if (typeof meta.format.duration === 'number' && isFinite(meta.format.duration)) tags.duration = meta.format.duration
    if (!tags.artist && !tags.album && !tags.title && !tags.year && tags.duration === undefined) return null
    return tags
  } catch { return null }
}
async function getTrackDuration(accountId, filePath) {
  if (!FFMPEG_OK) return null
  const client = getClient(accountId)
  let buf
  try { buf = await readFull(client, filePath) } catch { return null }
  const d = await new Promise((resolve) => {
    let out = ''
    const p = spawn(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', 'pipe:0'])
    p.stdin.on('error', () => {})
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', () => { const v = parseFloat(out.trim()); resolve(isFinite(v) && v > 0 ? v : null) })
    try { p.stdin.write(buf); p.stdin.end() } catch { resolve(null) }
  })
  if (d != null) return d
  try {
    const meta = await mm.parseBuffer(buf, { path: filePath })
    if (typeof meta.format.duration === 'number' && isFinite(meta.format.duration)) return meta.format.duration
  } catch {}
  return null
}

// ---- API 路由 ----
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

async function handleApi(req, res, url) {
  // /api/accounts
  if (url.pathname === '/api/accounts' && req.method === 'GET') {
    return sendJson(res, 200, getAccounts())
  }
  if (url.pathname === '/api/accounts' && req.method === 'POST') {
    const body = await readBody(req)
    const acc = body && body.id ? body : null
    if (!acc) return sendJson(res, 400, { error: 'invalid account' })
    // 至少要有 url；用户名/密码可空（匿名 WebDAV）
    if (!acc.url) return sendJson(res, 400, { error: 'url required' })
    upsertAccount(acc)
    clientCache.delete(acc.id)
    return sendJson(res, 200, { ok: true })
  }
  const delMatch = /^\/api\/accounts\/(.+)$/.exec(url.pathname)
  if (delMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(delMatch[1])
    deleteAccount(id)
    clientCache.delete(id)
    return sendJson(res, 200, { ok: true })
  }
  // /api/lyrics-online —— 服务端代理获取在线歌词（绕开浏览器 CORS）
  if (url.pathname === '/api/lyrics-online' && req.method === 'GET') {
    const artist = url.searchParams.get('artist') || ''
    const title = url.searchParams.get('title') || ''
    const lrc = await onlineLyricsServer(artist, title)
    return sendJson(res, 200, { lyrics: lrc || '' })
  }
  // /api/store —— 通用键值存储（歌单/收藏/设置 等用户数据，服务端持久化到 /data/store.json）
  if (url.pathname === '/api/store' && req.method === 'GET') {
    const key = url.searchParams.get('key') || ''
    return sendJson(res, 200, { value: getKV(key) })
  }
  if (url.pathname === '/api/store' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body || !body.key) return sendJson(res, 400, { error: 'key required' })
    setKV(body.key, body.value)
    return sendJson(res, 200, { ok: true })
  }
  // /api/list —— 服务端代理列目录（后端用服务端凭据连 WebDAV，彻底绕开浏览器 CORS）
  if (url.pathname === '/api/list') {
    const acct = url.searchParams.get('acct') || ''
    const p = decodeURIComponent(url.searchParams.get('path') || '/')
    try {
      const client = getClient(acct)
      const items = await client.getDirectoryContents(p, { includeSelf: false })
      const arr = Array.isArray(items) ? items : (items?.data || [])
      const out = arr
        .map((it) => ({
          name: it.basename,
          path: it.filename,
          isDir: it.type === 'directory',
          size: it.size || 0,
          lastmod: it.lastmod || ''
        }))
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh') : a.isDir ? -1 : 1))
      return sendJson(res, 200, { items: out })
    } catch (e) {
      return sendJson(res, 500, { error: String(e?.message || e) })
    }
  }
  // /api/tags
  if (url.pathname === '/api/tags') {
    const acct = url.searchParams.get('acct') || ''
    const p = decodeURIComponent(url.searchParams.get('path') || '')
    try {
      const t = await getTrackTags(acct, p)
      return sendJson(res, t ? 200 : 404, t || { error: 'no tags' })
    } catch (e) { return sendJson(res, 500, { error: String(e?.message || e) }) }
  }
  // /api/duration
  if (url.pathname === '/api/duration') {
    const acct = url.searchParams.get('acct') || ''
    const p = decodeURIComponent(url.searchParams.get('path') || '')
    try {
      const d = await getTrackDuration(acct, p)
      return sendJson(res, d != null ? 200 : 404, d != null ? { duration: d } : { error: 'no duration' })
    } catch (e) { return sendJson(res, 500, { error: String(e?.message || e) }) }
  }
  return sendJson(res, 404, { error: 'not found' })
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : null) } catch { resolve(null) } })
    req.on('error', () => resolve(null))
  })
}

// ---- 静态文件 ----
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const filePath = path.join(DIST, pathname)
  // 防目录穿越
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end('forbidden') }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA 回退：非资源请求交给 index.html
      const idx = path.join(DIST, 'index.html')
      fs.readFile(idx, (e2, buf) => {
        if (e2) { res.writeHead(404); return res.end('not found') }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(buf)
      })
      return
    }
    const ext = pathname.split('.').pop()?.toLowerCase() || ''
    res.writeHead(200, { 'Content-Type': contentType(pathname), 'Cache-Control': ext === 'html' ? 'no-cache' : 'public, max-age=3600' })
    fs.createReadStream(filePath).pipe(res)
  })
}

// ---- 鉴权（可选）----
function checkBasicAuth(req, res) {
  if (!TJ_USER) return true
  const auth = req.headers['authorization'] || ''
  const m = /^Basic\s+(.+)$/i.exec(auth)
  if (!m) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="OpMusic"' }); res.end('Unauthorized'); return false }
  const [u, p] = Buffer.from(m[1], 'base64').toString().split(':')
  if (u === TJ_USER && p === TJ_PASSWORD) return true
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="OpMusic"' }); res.end('Unauthorized'); return false
}

// ---- 主服务器 ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '', 'http://localhost')
    if (!checkBasicAuth(req, res)) return

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url)
    }

    if (url.pathname === '/stream' || url.pathname === '/cover' || url.pathname === '/lyrics') {
      const acct = url.searchParams.get('acct') || ''
      const p = decodeURIComponent(url.searchParams.get('path') || '')
      const client = getClient(acct)

      if (url.pathname === '/stream') {
        const wantTranscode = /\.(wma|ape)$/i.test(p)
        if (wantTranscode) {
          if (!FFMPEG_OK) { res.writeHead(415); return res.end('本服务未安装 ffmpeg，无法转码 WMA / APE') }
          const buf = await readFull(client, p)
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Accept-Ranges', 'none')
          return transcodeToMp3(buf, req, res)
        }
        const total = await getFileSize(client, p)
        const range = parseRange(req)
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Type', contentType(p))
        if (range) {
          const rHeader = `bytes=${range.start}-${range.end ?? ''}`
          const r = await fetchBytes(client, p, rHeader)
          const end = range.end ?? (r.contentLength ? range.start + r.contentLength - 1 : total - 1)
          res.statusCode = r.status
          if (r.contentRange) res.setHeader('Content-Range', r.contentRange)
          else if (total) res.setHeader('Content-Range', `bytes ${range.start}-${end}/${total}`)
          res.setHeader('Content-Length', String(r.contentLength ?? (total ? end - range.start + 1 : r.buf.length)))
          return res.end(r.buf)
        } else {
          const r = await fetchBytes(client, p)
          res.statusCode = r.status
          if (r.contentLength) res.setHeader('Content-Length', String(r.contentLength))
          else if (total) res.setHeader('Content-Length', String(total))
          return res.end(r.buf)
        }
      }

      if (url.pathname === '/cover') {
        const dir = p.endsWith('/') ? p : p + '/'
        const cands = ['folder.jpg', 'cover.jpg', 'album.jpg', 'Album.jpg', 'folder.png', 'cover.png', 'folder.jpeg', 'cover.jpeg']
        for (const c of cands) {
          try {
            const r = await fetchBytes(client, dir + c)
            res.setHeader('Content-Type', contentType(c))
            if (r.contentLength) res.setHeader('Content-Length', String(r.contentLength))
            res.statusCode = 200
            return res.end(r.buf)
          } catch {}
        }
        const artist = url.searchParams.get('artist') || ''
        const album = url.searchParams.get('album') || ''
        const title = url.searchParams.get('title') || ''
        if (artist || album || title) {
          try {
            const cb = await coverBytesFor(artist, album, title)
            if (cb) { res.setHeader('Content-Type', cb.type); res.statusCode = 200; return res.end(cb.buf) }
          } catch {}
        }
        res.statusCode = 404
        return res.end('no cover')
      }

      if (url.pathname === '/lyrics') {
        const lrc = p.replace(/\.[^.]+$/, '.lrc')
        try {
          const text = await client.getFileContents(lrc, { format: 'text' })
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          return res.end(text || '')
        } catch {
          res.statusCode = 404
          return res.end('')
        }
      }
    }

    // 其余：静态资源 / SPA
    return serveStatic(req, res, url)
  } catch (e) {
    res.statusCode = 500
    res.end('error: ' + (e?.message || e))
  }
})

server.listen(PORT, () => {
  console.log(`OpMusic Web 服务已启动: http://0.0.0.0:${PORT}`)
  if (!FFMPEG_OK) console.log('提示: 未检测到 ffmpeg/ffprobe，WMA/APE 将无法转码，内嵌标签/时长读取也将不可用。')
  if (TJ_USER) console.log('已启用 Basic Auth 鉴权。')
})
