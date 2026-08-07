import { getClient } from './webdav'
import * as mm from 'music-metadata'
import { spawn } from 'node:child_process'
import { FFPROBE_BIN } from './ffmpeg'

export interface TrackTags {
  artist?: string
  album?: string
  title?: string
  year?: string
  track?: number
  duration?: number // 真实时长（秒）；用于浏览器原生不支持、需转码的格式（WMA/APE）兜底显示
}

// 用 ffprobe 从内存缓冲读取内嵌标签（歌手/专辑/歌名/年份 + 时长）。
// 选 ffprobe 而非 music-metadata 作主路径，是因为它对 WMA/APE 等专有格式能正确读出
// title 与 year（实测 music-metadata 对 WMA 的 title/year 读不出来，全是 undefined）。
function ffprobeTags(buf: Buffer): Promise<TrackTags | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn(FFPROBE_BIN, ['-v', 'error', '-show_format', '-show_entries', 'format=duration', '-of', 'json', 'pipe:0'])
    // 吞掉 stdin 的 EPIPE（ffprobe 提前退出后继续写缓冲会触发），避免未捕获异常崩溃主进程
    p.stdin.on('error', () => {
      /* ignore */
    })
    p.stdout.on('data', (d: Buffer) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', () => {
      try {
        const j = JSON.parse(out)
        const tg: any = j?.format?.tags || {}
        const g = (k: string): string | undefined => {
          const v = tg[k] ?? tg[k.toUpperCase()]
          return typeof v === 'string' && v.trim() ? v.trim() : undefined
        }
        const rawYear = g('date') || g('year')
        const y = rawYear ? rawYear.replace(/\D/g, '').slice(0, 4) : undefined
        const dur = j?.format?.duration
        resolve({
          artist: g('artist'),
          album: g('album'),
          title: g('title'),
          year: y && /^\d{4}$/.test(y) ? y : undefined,
          duration: typeof dur === 'number' && isFinite(dur) && dur > 0 ? dur : undefined
        })
      } catch {
        resolve(null)
      }
    })
    try {
      p.stdin.write(buf)
      p.stdin.end()
    } catch {
      resolve(null)
    }
  })
}

// 兜底：用 music-metadata 读标签（对某些容器格式更细，但 WMA 的 title/year 读不出）。
async function extractTags(buf: Buffer, filename: string): Promise<TrackTags | null> {
  let meta: mm.IAudioMetadata
  try {
    meta = await mm.parseBuffer(buf, { path: filename })
  } catch {
    return null
  }
  const c = meta.common
  const artist =
    c.artist || (Array.isArray(c.artists) && c.artists.length ? c.artists.join('/') : undefined)
  const tags: TrackTags = {}
  if (artist) tags.artist = artist
  if (c.album) tags.album = c.album
  if (c.title) tags.title = c.title
  if (c.year) tags.year = String(c.year)
  else if (c.date) {
    const y = String(c.date).slice(0, 4)
    if (/^\d{4}$/.test(y)) tags.year = y
  }
  if (c.track?.no) tags.track = Number(c.track.no)
  if (typeof meta.format.duration === 'number' && isFinite(meta.format.duration)) tags.duration = meta.format.duration
  if (!tags.artist && !tags.album && !tags.title && !tags.year && tags.duration === undefined) return null
  return tags
}

export async function getTrackTags(accountId: string, filePath: string): Promise<TrackTags | null> {
  const client: any = getClient(accountId)
  let buf: Buffer
  try {
    const resp: any = await client.customRequest(filePath, { method: 'GET' })
    buf = Buffer.from(await resp.arrayBuffer())
  } catch {
    return null
  }
  // 主路径：ffprobe（通吃 WMA/APE/MP3/FLAC，能正确读 title/year）
  try {
    const t = await ffprobeTags(buf)
    if (t && (t.artist || t.album || t.title || t.year || t.duration)) return t
  } catch {
    /* ignore */
  }
  // 兜底：music-metadata
  try {
    return extractTags(buf, filePath)
  } catch {
    /* ignore */
  }
  return null
}

// 用 ffprobe 从内存缓冲探得时长（支持所有格式，含 WMA/APE），比 music-metadata 更稳。
function ffprobeDuration(buf: Buffer): Promise<number | null> {
  return new Promise((resolve) => {
    let out = ''
    const p = spawn(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', 'pipe:0'])
    // 吞掉 stdin 的 EPIPE（ffprobe 提前退出后继续写缓冲会触发），避免未捕获异常崩溃主进程
    p.stdin.on('error', () => {
      /* ignore */
    })
    p.stdout.on('data', (d: Buffer) => (out += d.toString()))
    p.on('error', () => resolve(null))
    p.on('close', () => {
      const v = parseFloat(out.trim())
      resolve(isFinite(v) && v > 0 ? v : null)
    })
    try {
      p.stdin.write(buf)
      p.stdin.end()
    } catch {
      resolve(null)
    }
  })
}

// 整文件探测真实时长（秒）。用于转码格式浏览器拿不到时长的可靠兜底（head 2MB 可能不含时长信息）。
// 优先 ffprobe（已随 ffmpeg 安装，支持专有格式），失败再回退 music-metadata。
export async function getTrackDuration(accountId: string, filePath: string): Promise<number | null> {
  const client: any = getClient(accountId)
  let buf: Buffer
  try {
    const resp: any = await client.customRequest(filePath, { method: 'GET' })
    buf = Buffer.from(await resp.arrayBuffer())
  } catch {
    return null
  }
  try {
    const d = await ffprobeDuration(buf)
    if (d != null) return d
  } catch {
    /* ignore */
  }
  try {
    const meta = await mm.parseBuffer(buf, { path: filePath })
    if (typeof meta.format.duration === 'number' && isFinite(meta.format.duration)) return meta.format.duration
  } catch {
    /* ignore */
  }
  return null
}
