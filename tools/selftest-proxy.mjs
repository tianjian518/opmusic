// 真实链路自检：用真实的 webdav.customRequest + Range（修复方案 B）
import http from 'node:http'
import fs from 'node:fs'
import { createClient } from 'webdav'

const DAV = 'http://127.0.0.1:7777/dav'
const client = createClient(DAV + '/', { username: '', password: '' })
const log = []
const P = (...a) => { const s = a.join(' '); log.push(s); console.log(s) }

function contentType(name) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return { wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac' }[ext] || 'application/octet-stream'
}
async function getFileSize(client, path) {
  const idx = path.lastIndexOf('/'); const parent = idx <= 0 ? '/' : path.slice(0, idx); const base = path.slice(idx + 1)
  try { const listing = await client.getDirectoryContents(parent); const arr = Array.isArray(listing) ? listing : listing.data || []
    const item = arr.find((i) => i.basename === base); return item?.size || 0 } catch { return 0 }
}

// 修复方案：customRequest 发带 Range 的 GET，webdav 把分片整体返回在 resp.data
function startProxy() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const path = decodeURIComponent(url.searchParams.get('path') || '')
        if (url.pathname !== '/stream') { res.statusCode = 404; return res.end() }
        const total = await getFileSize(client, path)
        const rangeH = req.headers.range
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Type', contentType(path))
        const readBody = async (resp) => Buffer.from(await resp.arrayBuffer())
        if (rangeH) {
          const resp = await client.customRequest(path, { method: 'GET', headers: { Range: rangeH } })
          const cr = resp.headers.get('content-range')
          const cl = resp.headers.get('content-length')
          const buf = await readBody(resp)
          res.statusCode = resp.status || 206
          if (cr) res.setHeader('Content-Range', cr)
          res.setHeader('Content-Length', String(cl || buf.length))
          P(`  [RESP] status=${res.statusCode} cr=${cr} len=${buf.length}`)
          return res.end(buf)
        } else {
          const resp = await client.customRequest(path, { method: 'GET' })
          const cl = resp.headers.get('content-length')
          const buf = await readBody(resp)
          res.statusCode = resp.status || 200
          if (cl) res.setHeader('Content-Length', String(cl))
          else if (total) res.setHeader('Content-Length', String(total))
          P(`  [RESP full] status=${res.statusCode} len=${buf.length}`)
          return res.end(buf)
        }
      } catch (e) {
        P(`  [RESP ERROR] ${e.message}`)
        if (!res.headersSent) { res.statusCode = 500; res.end('err') }
      }
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}
function fetchRange(port, path, rangeHeader) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: `/stream?path=${encodeURIComponent(path)}`, headers: rangeHeader ? { range: rangeHeader } : {} },
      (res) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })) })
    req.on('error', (e) => resolve({ status: 0, error: e.message }))
  })
}
;(async () => {
  P('=== 真实 customRequest(Range) 链路自检 ===')
  const { server, port } = await startProxy()
  const total = await getFileSize(client, '/test.wav')
  P(`getFileSize(/test.wav) = ${total}`)
  const r1 = await fetchRange(port, '/test.wav', 'bytes=0-')
  P(`R1 status=${r1.status} cr=${r1.headers['content-range']} len=${r1.headers['content-length']} bytes=${r1.body.length} head=${r1.body.slice(0,4).toString('latin1')}`)
  const r2 = await fetchRange(port, '/test.wav', 'bytes=1000-2000')
  P(`R2 status=${r2.status} cr=${r2.headers['content-range']} len=${r2.headers['content-length']} bytes=${r2.body.length}`)
  const r3 = await fetchRange(port, '/test.wav', null)
  P(`R3 status=${r3.status} len=${r3.headers['content-length']} bytes=${r3.body.length} head=${r3.body.slice(0,4).toString('latin1')}`)
  server.close()
  const ok = r1.status===206 && r1.body.slice(0,4).toString('latin1')==='RIFF' && r1.body.length>0 &&
             r2.status===206 && r2.body.length===1001 && r3.status===200 && r3.body.slice(0,4).toString('latin1')==='RIFF'
  P(ok ? '✅ 全部通过：customRequest+Range 可正确流式分片，浏览器可播放。' : '❌ 仍有问题。')
  fs.writeFileSync('/tmp/selftest.log', log.join('\n'))
  process.exit(ok ? 0 : 1)
})()
