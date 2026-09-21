import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFileSync, execFile } from 'node:child_process'
import { getClient, getAccount } from './webdav'
import { coverBytesFor } from './meta'
import { FFMPEG_BIN, FFPROBE_BIN } from './ffmpeg'

// ---------------------------------------------------------------------------
// 权威编码判定：Chromium 的 <audio> 只能解 mp3/aac/flac/wav/ogg/opus/vorbis。
// 遇到 ac3 / eac3（Dolby Atmos 全景声，常见于 .m4a）/ dts / wma / ape 等一律解不了，
// <audio> 会直接抛 error code 4（MEDIA_ERR_SRC_NOT_SUPPORTED）。
// 仅靠扩展名不可靠（.m4a 既可能是 AAC 也可能是 E-AC3），所以这里用 ffprobe 读真实编码。
// 只读文件头部即可拿到编码信息，秒级完成；结果按 (acct,path) 缓存，避免重复探测。
// ---------------------------------------------------------------------------
const CHROMIUM_OK_CODECS = new Set([
  'mp3',
  'aac',
  'flac',
  'vorbis',
  'opus',
  'pcm_s16le',
  'pcm_s24le',
  'pcm_u8',
  'pcm_f32le',
  'pcm_s32le',
  'alac',
  'mp3float'
])
const codecCache = new Map<string, boolean>() // true = 需要转码

function probeNeedsTranscode(accountId: string, filePath: string): Promise<boolean> {
  const key = accountId + '|' + filePath
  const hit = codecCache.get(key)
  if (hit !== undefined) return Promise.resolve(hit)
  return new Promise((resolve) => {
    // 取头部 1MB 足够解析出容器头里的编码信息
    let url = ''
    const acc = getAccount(accountId)
    if (!acc) return resolve(guessByExt(filePath))
    const origin = acc.url.replace(/\/+$/, '')
    url = origin + encPath(filePath)
    const headers: Record<string, string> = { Range: 'bytes=0-1048575' }
    if (acc.username != null) {
      headers['Authorization'] =
        'Basic ' + Buffer.from(`${acc.username}:${acc.password ?? ''}`).toString('base64')
    }
    ;(async () => {
      let buf: Buffer | null = null
      try {
        let u = url
        for (let hop = 0; hop < 6; hop++) {
          const resp = await fetch(u, { headers, redirect: 'manual' })
          if (resp.status >= 300 && resp.status < 400) {
            const loc = resp.headers.get('location')
            if (!loc) break
            u = new URL(loc, u).toString()
            delete headers['Authorization']
            continue
          }
          if (resp.status >= 400) break
          buf = Buffer.from(await resp.arrayBuffer())
          break
        }
      } catch {
        /* ignore */
      }
      if (!buf || !buf.length) return resolve(guessByExt(filePath))
      // ffprobe 从 stdin 读头部，取第一条音频流的编码名
      const p = execFile(
        FFPROBE_BIN,
        [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=codec_name',
          '-of', 'default=nw=1:nk=1',
          'pipe:0'
        ],
        { timeout: 8000 },
        (err, stdout) => {
          const codec = (stdout || '').trim().toLowerCase()
          let need: boolean
          if (!codec) {
            need = guessByExt(filePath)
          } else {
            need = !CHROMIUM_OK_CODECS.has(codec)
          }
          codecCache.set(key, need)
          resolve(need)
        }
      )
      p.stdin?.on('error', () => {})
      try {
        p.stdin?.write(buf)
        p.stdin?.end()
      } catch {
        resolve(guessByExt(filePath))
      }
    })()
  })
}

// ffprobe 失败时按扩展名兜底
function guessByExt(filePath: string): boolean {
  return /\.(wma|ape)$/i.test(filePath)
}

// 探测本机 ffmpeg 是否可用（用于 WMA/APE 等浏览器原生不支持的格式实时转码）
let FFMPEG_OK = false
try {
  execFileSync(FFMPEG_BIN, ['-version'], { stdio: 'ignore' })
  FFMPEG_OK = true
} catch {
  FFMPEG_OK = false
}

// ===========================================================================
// 1) 转码缓存：APE/WMA 转好的 MP3 落盘，第二次听直接秒开（且能拖进度）
// ===========================================================================
const CACHE_DIR = path.join(os.tmpdir(), 'tianjian-music-cache')
try {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
} catch {
  /* ignore */
}
const CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2GB 上限

function cachePathFor(acct: string, filePath: string): string {
  const h = crypto.createHash('sha1').update(acct + '|' + filePath).digest('hex')
  return path.join(CACHE_DIR, h + '.mp3')
}
function pruneCache() {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .map((n) => {
        const p = path.join(CACHE_DIR, n)
        try {
          const st = fs.statSync(p)
          return { p, size: st.size, mtime: st.mtimeMs }
        } catch {
          return null
        }
      })
      .filter(Boolean) as { p: string; size: number; mtime: number }[]
    let total = files.reduce((s, f) => s + f.size, 0)
    if (total <= CACHE_MAX_BYTES) return
    files.sort((a, b) => a.mtime - b.mtime)
    for (const f of files) {
      if (total <= CACHE_MAX_BYTES) break
      try {
        fs.unlinkSync(f.p)
        total -= f.size
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

// ===========================================================================
// 2) 关键修复：WebDAV 返回 302 跳转时，必须跟随到网盘 CDN 才能拿到真数据。
//    webdav 库的 customRequest 不跟跳转，会把 721 字节的 302 响应体当音频，
//    这就是"MP3 也要十几秒才出声"的根因。
//    这里改用原生 fetch + 手动跟随 + Range 透传，实现真正的边下边播。
// ===========================================================================
interface Upstream {
  status: number
  headers: Headers
  body: ReadableStream<Uint8Array> | null
}

const encPath = (p: string) =>
  p
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')

async function openUpstream(
  accountId: string,
  filePath: string,
  rangeHeader?: string
): Promise<Upstream> {
  const acc = getAccount(accountId)
  if (!acc) throw new Error('账号不存在: ' + accountId)
  const origin = acc.url.replace(/\/+$/, '')
  const auth =
    acc.username != null
      ? 'Basic ' + Buffer.from(`${acc.username}:${acc.password ?? ''}`).toString('base64')
      : null

  let url = origin + encPath(filePath)
  const headers: Record<string, string> = {}
  if (auth) headers['Authorization'] = auth
  if (rangeHeader) headers['Range'] = rangeHeader

  for (let hop = 0; hop < 6; hop++) {
    const resp = await fetch(url, { headers, redirect: 'manual' })
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) return { status: resp.status, headers: resp.headers, body: resp.body }
      url = new URL(loc, url).toString()
      // 跳到 CDN 后去掉 Basic 鉴权（CDN 用签名 URL；多余的头可能被拒或触发 400）
      delete headers['Authorization']
      continue
    }
    return { status: resp.status, headers: resp.headers, body: resp.body }
  }
  throw new Error('too many redirects')
}

// 把上游（已跟随跳转的）响应原样转发给客户端，流式、不整读内存
async function pipeToRes(up: Upstream, res: http.ServerResponse, fallbackType: string) {
  res.statusCode = up.status
  const ct = up.headers.get('content-type')
  res.setHeader(
    'Content-Type',
    ct && !/octet-stream/i.test(ct) ? ct : fallbackType
  )
  const cr = up.headers.get('content-range')
  const cl = up.headers.get('content-length')
  if (cr) res.setHeader('Content-Range', cr)
  if (cl) res.setHeader('Content-Length', cl)
  res.setHeader('Accept-Ranges', up.headers.get('accept-ranges') || 'bytes')
  if (!up.body) return res.end()
  const reader = up.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(Buffer.from(value))) {
        await new Promise((ok) => res.once('drain', ok))
      }
    }
  } catch {
    /* 客户端断开 */
  }
  try {
    res.end()
  } catch {
    /* ignore */
  }
}

// ===========================================================================
// 3) 流式转码：上游边下 → ffmpeg 边转 → 客户端边收（首字节从"整首下完"变成"立刻出声"）
//    同时把转码结果写入磁盘缓存（tee），下次直接命中。
// ===========================================================================
function streamTranscode(
  up: Upstream,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cacheFile: string | null
) {
  const ff = spawn(FFMPEG_BIN, [
    '-i', 'pipe:0',
    '-vn',
    '-f', 'mp3',
    '-ab', '192k',
    '-map', '0:a:0',
    '-y',
    'pipe:1'
  ])
  ff.stdin.on('error', () => {})
  ff.stdout.on('error', () => {})
  res.on('error', () => {})

  const tmp = cacheFile ? cacheFile + '.part' : null
  let out: fs.WriteStream | null = null
  if (tmp) {
    try {
      out = fs.createWriteStream(tmp)
      out.on('error', () => {})
    } catch {
      out = null
    }
  }

  let bytesOut = 0
  ff.stdout.on('data', (chunk: Buffer) => {
    bytesOut += chunk.length
    res.write(chunk)
    if (out) out.write(chunk)
  })

  // 上游 → ffmpeg stdin
  ;(async () => {
    if (!up.body) return ff.stdin.end()
    const reader = up.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!ff.stdin.write(Buffer.from(value))) {
          await new Promise((ok) => ff.stdin.once('drain', ok))
        }
      }
    } catch {
      /* 上游中断 */
    }
    try {
      ff.stdin.end()
    } catch {
      /* ignore */
    }
  })()

  ff.stderr.on('data', () => {})
  ff.on('error', () => {
    try {
      res.end()
    } catch {}
  })
  ff.on('close', (code) => {
    try {
      res.end()
    } catch {}
    // 只有正常转完且真的产出了数据，才把 .part 提升为正式缓存
    if (out) {
      out.end(() => {
        try {
          if (code === 0 && bytesOut > 0) {
            fs.renameSync(tmp!, cacheFile!)
            pruneCache()
          } else {
            fs.unlinkSync(tmp!)
          }
        } catch {
          /* ignore */
        }
      })
    }
  })
  req.on('close', () => {
    try {
      ff.kill('SIGKILL')
    } catch {}
    if (out) {
      try {
        out.end()
        fs.unlinkSync(tmp!)
      } catch {}
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
  return { start: parseInt(m[1], 10), end: m[2] ? parseInt(m[2], 10) : undefined }
}

export function startStreamServer(): Promise<{ port: number; base: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '', 'http://localhost')
        const acct = url.searchParams.get('acct') || ''
        const filePath = decodeURIComponent(url.searchParams.get('path') || '')

        if (url.pathname === '/stream') {
          // 先看扩展名（快），不确定时再用 ffprobe 按真实编码判定（权威）。
          // 典型场景：.m4a 里装的是 Dolby Atmos 的 E-AC3，Chromium 解不了必须转码。
          const forceTranscode = url.searchParams.get('transcode') === '1'
          const extSaysTranscode = /\.(wma|ape)$/i.test(filePath)
          const ambiguous = /\.(m4a|mp4|aac)$/i.test(filePath)
          let wantTranscode = forceTranscode || extSaysTranscode
          if (!wantTranscode && (ambiguous || !forceTranscode)) {
            try {
              wantTranscode = await probeNeedsTranscode(acct, filePath)
            } catch {
              wantTranscode = false
            }
          }

          if (wantTranscode) {
            if (!FFMPEG_OK) {
              res.statusCode = 415
              res.end('本机未检测到 ffmpeg，无法转码 WMA / APE / Dolby Atmos 等格式')
              return
            }
            const cacheFile = cachePathFor(acct, filePath)

            // —— 缓存命中：直接当 MP3 走 Range，秒开 + 可拖进度 ——
            if (fs.existsSync(cacheFile)) {
              try {
                const st = fs.statSync(cacheFile)
                res.setHeader('Content-Type', 'audio/mpeg')
                res.setHeader('Accept-Ranges', 'bytes')
                const rg = parseRange(req)
                if (rg) {
                  const end = rg.end ?? st.size - 1
                  if (rg.start >= st.size) {
                    res.statusCode = 416
                    res.setHeader('Content-Range', `bytes */${st.size}`)
                    return res.end()
                  }
                  res.statusCode = 206
                  res.setHeader('Content-Range', `bytes ${rg.start}-${end}/${st.size}`)
                  res.setHeader('Content-Length', String(end - rg.start + 1))
                  return fs.createReadStream(cacheFile, { start: rg.start, end }).pipe(res)
                }
                res.statusCode = 200
                res.setHeader('Content-Length', String(st.size))
                return fs.createReadStream(cacheFile).pipe(res)
              } catch {
                /* 缓存损坏 → 落到实时转码 */
              }
            }

            // —— 未命中：流式转码，边转边播边存 ——
            const up = await openUpstream(acct, filePath)
            if (up.status >= 400) {
              res.statusCode = up.status
              return res.end('upstream error ' + up.status)
            }
            res.setHeader('Content-Type', 'audio/mpeg')
            res.setHeader('Accept-Ranges', 'none')
            return streamTranscode(up, req, res, cacheFile)
          }

          // —— 原生可播：跟随 302，Range 透传，边下边播 ——
          const up = await openUpstream(acct, filePath, req.headers.range)
          if (up.status >= 400) {
            res.statusCode = up.status
            return res.end('upstream error ' + up.status)
          }
          return pipeToRes(up, res, contentType(filePath))
        } else if (url.pathname === '/cover') {
          const dir = filePath.endsWith('/') ? filePath : filePath + '/'
          const cands = ['folder.jpg', 'cover.jpg', 'album.jpg', 'Album.jpg', 'folder.png', 'cover.png']
          for (const c of cands) {
            try {
              const up = await openUpstream(acct, dir + c)
              if (up.status >= 400) continue
              return pipeToRes(up, res, contentType(c))
            } catch {
              /* try next */
            }
          }
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
          const lrc = filePath.replace(/\.[^.]+$/, '.lrc')
          try {
            const up = await openUpstream(acct, lrc)
            if (up.status >= 400) throw new Error('404')
            const text = await new Response(up.body).text()
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
        try {
          if (!res.headersSent) res.statusCode = 500
          res.end('error: ' + (e?.message || e))
        } catch {
          /* ignore */
        }
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port
      resolve({ port, base: `http://127.0.0.1:${port}` })
    })
  })
}
