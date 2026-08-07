import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { getClient, getAccount, isAudio } from './webdav'
import { coverBytesFor } from './meta'
import { FFMPEG_BIN } from './ffmpeg'

// 探测本机 ffmpeg 是否可用（用于 WMA/APE 等浏览器原生不支持的格式实时转码）
let FFMPEG_OK = false
try {
  execFileSync(FFMPEG_BIN, ['-version'], { stdio: 'ignore' })
  FFMPEG_OK = true
} catch {
  FFMPEG_OK = false
}

// 把 WebDAV 上的音频整文件读入内存（转码需完整输入）
async function fetchFull(client: any, path: string): Promise<Buffer> {
  const resp: any = await client.customRequest(path, { method: 'GET' })
  return Buffer.from(await resp.arrayBuffer())
}

// 用 ffmpeg 把（内存中的）音频转码为 MP3，流式输出到 HTTP 响应。
// 浏览器原生不支持的 WMA / APE 借此变成可播放的 MP3；不支持 Range（整段播放，无法精确拖动）。
function transcodeToMp3(input: Buffer, req: http.IncomingMessage, res: http.ServerResponse) {
  const ffmpeg = spawn(FFMPEG_BIN, [
    '-i', 'pipe:0',
    '-f', 'mp3',
    '-ab', '320k',
    '-map', '0:a:0',
    '-y',
    'pipe:1'
  ])
  // 吞掉 stdin 的 EPIPE（客户端断开/ffmpeg 异常退出后继续写缓冲会触发），避免未捕获异常崩溃主进程
  ffmpeg.stdin.on('error', () => {
    /* ignore */
  })
  // 客户端提前断开时 res 可能已关闭，pipe 写入会抛错，忽略之
  res.on('error', () => {
    /* ignore */
  })
  ffmpeg.stdin.write(input)
  ffmpeg.stdin.end()
  ffmpeg.stdout.pipe(res)
  ffmpeg.stderr.on('data', () => {
    /* 丢弃 ffmpeg 日志 */
  })
  ffmpeg.on('error', () => {
    try {
      res.statusCode = 500
      res.end('transcode failed')
    } catch {
      /* ignore */
    }
  })
  ffmpeg.on('close', () => {
    try {
      if (!res.writableEnded) res.end()
    } catch {
      /* ignore */
    }
  })
  // 客户端切歌/关闭 → 终止转码进程，避免空转
  req.on('close', () => {
    try {
      ffmpeg.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  })
}

function contentType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    opus: 'audio/ogg',
    ape: 'audio/x-ape',
    wma: 'audio/x-ms-wma',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    lrc: 'text/plain; charset=utf-8'
  }
  return map[ext] || 'application/octet-stream'
}

function parseRange(req: http.IncomingMessage): { start: number; end?: number } | null {
  const h = req.headers.range
  if (!h) return null
  const m = /bytes=(\d+)-(\d*)/.exec(h)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = m[2] ? parseInt(m[2], 10) : undefined
  return { start, end }
}

// webdav v5 无 getFileInfo，改用目录列表取文件大小（仅用于兜底 Content-Length）
async function getFileSize(client: any, path: string): Promise<number> {
  const idx = path.lastIndexOf('/')
  const parent = idx <= 0 ? '/' : path.slice(0, idx)
  const base = path.slice(idx + 1)
  try {
    const listing = await client.getDirectoryContents(parent)
    const arr = Array.isArray(listing) ? listing : (listing as any).data || []
    const item = (arr as any[]).find((i) => i.basename === base)
    return item?.size || 0
  } catch {
    return 0
  }
}

// webdav v5 没有 getFileStream；用 customRequest 发送带 Range 的 GET，
// 由 webdav 内部处理鉴权并把分片整体返回在 resp 中（resp.arrayBuffer()）。
async function fetchBytes(client: any, path: string, rangeHeader?: string): Promise<{
  status: number
  contentType: string
  contentRange?: string
  contentLength?: number
  buf: Buffer
}> {
  const resp: any = await client.customRequest(path, {
    method: 'GET',
    headers: rangeHeader ? { Range: rangeHeader } : {}
  })
  const buf = Buffer.from(await resp.arrayBuffer())
  const cr = resp.headers?.get?.('content-range')
  const cl = resp.headers?.get?.('content-length')
  return {
    status: resp.status || (rangeHeader ? 206 : 200),
    contentType: contentType(path),
    contentRange: cr || undefined,
    contentLength: cl ? parseInt(cl, 10) : undefined,
    buf
  }
}

export function startStreamServer(): Promise<{ port: number; base: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '', 'http://localhost')
        const acct = url.searchParams.get('acct') || ''
        const path = decodeURIComponent(url.searchParams.get('path') || '')
        const client: any = getClient(acct)
        if (url.pathname === '/stream') {
          // 浏览器原生不支持的格式（WMA / APE）：若本机有 ffmpeg，实时转码为 MP3 再输出
          const wantTranscode = url.searchParams.get('transcode') === '1' || /\.(wma|ape)$/i.test(path)
          if (wantTranscode) {
            if (!FFMPEG_OK) {
              res.statusCode = 415
              res.end('本机未检测到 ffmpeg，无法转码 WMA / APE；请安装 ffmpeg 或转换为 MP3 / FLAC 后播放')
              return
            }
            try {
              const buf = await fetchFull(client, path)
              res.setHeader('Content-Type', 'audio/mpeg')
              res.setHeader('Accept-Ranges', 'none')
              transcodeToMp3(buf, req, res)
              return
            } catch (e: any) {
              res.statusCode = 500
              res.end('transcode error: ' + (e?.message || e))
              return
            }
          }
          const total = await getFileSize(client, path)
          const range = parseRange(req)
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', contentType(path))
          if (range) {
            const rHeader = `bytes=${range.start}-${range.end ?? ''}`
            const r = await fetchBytes(client, path, rHeader)
            const end = range.end ?? (r.contentLength ? range.start + r.contentLength - 1 : total - 1)
            res.statusCode = r.status
            if (r.contentRange) res.setHeader('Content-Range', r.contentRange)
            else if (total) res.setHeader('Content-Range', `bytes ${range.start}-${end}/${total}`)
            res.setHeader('Content-Length', String(r.contentLength ?? (total ? end - range.start + 1 : r.buf.length)))
            return res.end(r.buf)
          } else {
            const r = await fetchBytes(client, path)
            res.statusCode = r.status
            if (r.contentLength) res.setHeader('Content-Length', String(r.contentLength))
            else if (total) res.setHeader('Content-Length', String(total))
            return res.end(r.buf)
          }
        } else if (url.pathname === '/cover') {
          const dir = path.endsWith('/') ? path : path + '/'
          const cands = ['folder.jpg', 'cover.jpg', 'album.jpg', 'Album.jpg', 'folder.png', 'cover.png']
          for (const c of cands) {
            try {
              const r = await fetchBytes(client, dir + c)
              res.setHeader('Content-Type', contentType(c))
              if (r.contentLength) res.setHeader('Content-Length', String(r.contentLength))
              res.statusCode = 200
              return res.end(r.buf)
            } catch {
              /* try next */
            }
          }
          // 本地没有封面 → 按歌手/专辑/歌名在线刮削兜底
          const artist = url.searchParams.get('artist') || ''
          const album = url.searchParams.get('album') || ''
          const title = url.searchParams.get('title') || ''
          if (artist || album || title) {
            try {
              const cb = await coverBytesFor(artist, album, title)
              if (cb) {
                res.setHeader('Content-Type', cb.type)
                res.statusCode = 200
                return res.end(cb.buf)
              }
            } catch {
              /* ignore */
            }
          }
          res.statusCode = 404
          res.end('no cover')
        } else if (url.pathname === '/lyrics') {
          const lrc = path.replace(/\.[^.]+$/, '.lrc')
          try {
            const text = (await client.getFileContents(lrc, { format: 'text' })) as string
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(text || '')
          } catch {
            res.statusCode = 404
            res.end('')
          }
        } else {
          res.statusCode = 404
          res.end('not found')
        }
      } catch (e: any) {
        res.statusCode = 500
        res.end('error: ' + e?.message)
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port
      resolve({ port, base: `http://127.0.0.1:${port}` })
    })
  })
}
