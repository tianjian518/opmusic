// 本地 WebDAV 测试服务：仅用于自检播放链路，非应用代码
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'tools', 'dav-test')
fs.mkdirSync(ROOT, { recursive: true })
const wav = path.join(ROOT, 'test.wav')
if (!fs.existsSync(wav)) fs.writeFileSync(wav, makeWav(3, 440))

function makeWav(seconds, freq) {
  const sr = 44100
  const n = sr * seconds
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * freq * i) / sr)
    data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 30000, i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sr, 24)
  header.writeUInt32LE(sr * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const p = decodeURIComponent(u.pathname)
  if (req.method === 'OPTIONS') {
    res.setHeader('DAV', '1')
    res.setHeader('Allow', 'GET, HEAD, PROPFIND, OPTIONS')
    res.statusCode = 200
    res.end()
    return
  }
  if (req.method === 'PROPFIND') {
    const base = p.endsWith('/') ? p : p + '/'
    const files = fs.readdirSync(ROOT)
    let body = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'
    for (const f of files) {
      const stat = fs.statSync(path.join(ROOT, f))
      body +=
        `<d:response><d:href>${base + f}</d:href><d:propstat><d:prop>` +
        `<d:resourcetype>${stat.isDirectory() ? '<d:collection/>' : ''}</d:resourcetype>` +
        `<d:getcontentlength>${stat.size}</d:getcontentlength>` +
        `<d:getlastmodified>${stat.mtime.toUTCString()}</d:getlastmodified>` +
        `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
    }
    body += '</d:multistatus>'
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.statusCode = 207
    res.end(body)
    return
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const rel = p.replace(/^\/dav\//, '')
    const fp = path.join(ROOT, rel)
    if (!fs.existsSync(fp)) {
      res.statusCode = 404
      res.end('nf')
      return
    }
    const stat = fs.statSync(fp)
    const range = req.headers.range
    const ct = fp.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream'
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      const start = parseInt(m[1], 10)
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
      res.setHeader('Content-Length', String(end - start + 1))
      res.setHeader('Content-Type', ct)
      if (req.method === 'HEAD') return res.end()
      fs.createReadStream(fp, { start, end }).pipe(res)
      return
    }
    res.setHeader('Content-Length', String(stat.size))
    res.setHeader('Content-Type', ct)
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(fp).pipe(res)
    return
  }
  res.statusCode = 405
  res.end()
})

server.listen(7777, '127.0.0.1', () => console.log('[TEST-DAV] listening on 127.0.0.1:7777/dav'))
