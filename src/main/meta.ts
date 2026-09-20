import { appStore } from './store'

// 在线刮削 / 歌词抓取（主进程发起，避免渲染进程 CORS 限制）
// 数据源：MusicBrainz（专辑/歌手检索，需 UA）、Cover Art Archive（封面）、
//         Wikipedia（歌手简介）、lrclib（带时间轴 LRC）、lyrics.ovh（纯文本兜底）

const UA = 'TianjianMusicPlayer/1.0 (local music player)'
const MB = 'https://musicbrainz.org/ws/2'
const CA = 'https://coverartarchive.org/release'

async function fetchJson(url: string, timeout = 8000, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) },
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

async function fetchBytes(url: string, timeout = 8000, headers?: Record<string, string>): Promise<{ buf: Buffer; type: string } | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: headers || undefined })
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return { buf: Buffer.from(ab), type: res.headers.get('content-type') || 'image/jpeg' }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function fetchText(url: string, timeout = 8000): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// ---- 缓存（写入 electron-store，离线也能用，且减少对外请求）----
interface MetaCacheItem {
  cover?: string // 封面直链（coverartarchive）
  coverYear?: string
  coverAlbum?: string
  artistBio?: string
  albumName?: string
  albumYear?: string
  lyrics?: string
  ts: number
}
type MetaCache = Record<string, MetaCacheItem>

function readCache(): MetaCache {
  return appStore.get<MetaCache>('metaCache') || {}
}
function writeCache(all: MetaCache) {
  appStore.set('metaCache', all)
}
function ckey(artist?: string, album?: string, title?: string) {
  return `${artist || ''}|${album || ''}|${title || ''}`
}
// 缓存版本：修正歌词错配(只按歌手+长度排序)与专辑/年份缺失后，旧的错误缓存需失效
const CVER = 'v2:'

// 判定文件名「A - B」两段谁是歌手：用歌曲搜索(type=1)看返回歌曲的「歌手/歌名」如何对应两段。
// 比艺人搜索(type=100)可靠——后者会把与歌名同名的冷门小艺人误判成歌手（如「爱转角」「七里香」都有同名艺人）。
// 仅当能明确对应（歌名≈一段 且 歌手≈另一段）时才返回，否则返回 null 交回目录/默认判定。
const normName = (x: string) => (x || '').replace(/[（(].*?[)）]/g, '').trim()
const sameText = (x: string, y: string) =>
  x && y && (normName(x) === normName(y) || normName(x).includes(normName(y)) || normName(y).includes(normName(x)))
export async function disambiguateArtistTitle(
  a: string,
  b: string
): Promise<{ artist?: string; title?: string } | null> {
  if (!a || !b) return null
  const s = await fetchJson(
    `https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(a + ' ' + b)}&limit=10`,
    8000,
    { Referer: NCM_REFERER }
  )
  const songs: any[] = s?.result?.songs || []
  if (!songs.length) return null
  // 两种解读打分：A=第一段是歌手(a=artist,b=title)；B=第一段是歌名(b=artist,a=title)。
  // 取搜索结果中更支持的一种——即便原唱被翻唱/remix 埋没，翻唱也常带「歌名 by 真歌手」信息，
  // B 仍能胜出。这样「歌名-歌手」与「歌手-歌名」两种命名都能统一正确识别，无需对个别文件特殊化。
  let scoreA = 0
  let scoreB = 0
  for (const sg of songs) {
    const art = (sg.artists || []).map((x: any) => x.name).join('/')
    const nm = sg.name || ''
    if (sameText(nm, b) && sameText(art, a)) scoreA++
    if (sameText(nm, a) && sameText(art, b)) scoreB++
  }
  if (scoreB > scoreA) return { artist: b, title: a }
  if (scoreA > scoreB) return { artist: a, title: b }
  return null
}

// ---- 封面 ----
async function releaseSearch(q: string): Promise<any | null> {
  const data = await fetchJson(`${MB}/release/?query=${encodeURIComponent(q)}&fmt=json&limit=1`)
  return data?.releases?.[0] || null
}

// 网易云封面：专辑搜索(type=10)才返回 picUrl（歌曲搜索只给 picId）。按「歌手 专辑」搜，
// 命中歌手的专辑取封面（国内可达，比 MusicBrainz 稳）。
// 有歌名时优先用「歌曲搜索定位精确专辑 → 专辑详情拿 picUrl」：最准，且能命中按歌手搜首张专辑拿不到的正确封面
// （如「爱转角」按歌手搜只会拿到其他专辑封面）。
async function coverViaSong(artist: string, title: string): Promise<string | null> {
  if (!artist || !title) return null
  const s = await fetchJson(`https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(artist + ' ' + title)}&limit=10`, 8000, {
    Referer: NCM_REFERER
  })
  const songs: any[] = s?.result?.songs || []
  for (const sg of songs) {
    const art = (sg.artists || []).map((x: any) => x.name).join('/')
    if (art === artist || art.includes(artist) || artist.includes(art)) {
      // 优先：专辑详情里的 picUrl（最准）
      const aid = sg.album?.id
      if (aid) {
        const al = await fetchJson(`https://music.163.com/api/album/${aid}`, 8000, { Referer: NCM_REFERER })
        const pic = al?.album?.picUrl || al?.album?.blurPicUrl
        if (pic) return pic
      }
      // 专辑详情无 picUrl（常见）：用专辑名走 type=10 专辑搜索补封面，比直接拿详情稳
      if (sg.album?.name) {
        const c = await neteaseCover(artist, sg.album.name)
        if (c) return c
      }
    }
  }
  return null
}

async function neteaseCover(artist: string, album: string, title?: string): Promise<string | null> {
  if (artist && title) {
    const c = await coverViaSong(artist, title)
    if (c) return c
  }
  const queries: string[] = []
  if (artist && album) queries.push(`${artist} ${album}`)
  if (album) queries.push(album)
  if (artist) queries.push(artist)
  for (const q of queries) {
    const s = await fetchJson(`https://music.163.com/api/search/get?type=10&s=${encodeURIComponent(q)}&limit=10`, 8000, {
      Referer: NCM_REFERER
    })
    const albs: any[] = s?.result?.albums || []
    for (const a of albs) {
      const pic = a?.picUrl
      if (!pic) continue
      if (artist) {
        const an = a?.artist?.name || ''
        const hit = an && (an === artist || an.includes(artist) || artist.includes(an))
        if (!hit) continue
      }
      return pic
    }
  }
  return null
}

export async function coverFor(artist: string, album: string, title?: string): Promise<{ url: string | null; year?: string; albumName?: string }> {
  if (!artist && !album) return { url: null }
  // 在线封面优先级：网易云(国内可达) → MusicBrainz Cover Art Archive(常不可达)
  const ne = await neteaseCover(artist, album, title)
  if (ne) return { url: ne }
  // 兜底顺序：专辑+歌手 → 仅专辑 → 仅歌手(取首张)
  const queries: string[] = []
  if (artist && album) queries.push(`release:${album} AND artist:${artist}`)
  if (album) queries.push(`release:${album}`)
  if (artist) queries.push(`artist:${artist}`)
  for (const q of queries) {
    const rel = await releaseSearch(q)
    if (rel) return { url: `${CA}/${rel.id}/front`, year: rel.date?.slice(0, 4), albumName: rel.title }
  }
  return { url: null }
}

export async function coverBytesFor(artist: string, album: string, title?: string): Promise<{ buf: Buffer; type: string } | null> {
  const k = CVER + ckey(artist, album)
  const all = readCache()
  let url = all[k]?.cover
  if (url === undefined) {
    const r = await coverFor(artist, album, title)
    url = r.url || null
    all[k] = { ...(all[k] || { ts: Date.now() }), cover: url || undefined, coverYear: r.year, coverAlbum: r.albumName }
    writeCache(all)
  }
  if (!url) return null
  // 网易云图片 CDN 偶尔需要 Referer/UA，先直连、失败再带头重试
  const isNcm = url.includes('music.163.com') || url.includes('music.126.net')
  try {
    return await fetchBytes(url, 8000, isNcm ? { Referer: NCM_REFERER, 'User-Agent': UA } : undefined)
  } catch {
    if (isNcm) {
      try {
        return await fetchBytes(url, 8000)
      } catch {
        /* ignore */
      }
    }
    return null
  }
}

// 与「歌词」同一数据源：优先用网易云获取歌手简介 / 专辑信息（国内可达、稳定）
// 第三个参数 title 用于「只有歌名、没有歌手/专辑」的情况（如文件无内嵌标签）：
// 仍可凭歌名搜出对应歌手，进而取到歌手简介与专辑。
async function neteaseInfo(artist: string, album?: string, title?: string): Promise<{ artistBio?: string; albumName?: string; albumYear?: string }> {
  const result: { artistBio?: string; albumName?: string; albumYear?: string } = {}
  // 搜索词优先级：歌手+歌名 > 歌手+专辑 > 专辑 > 歌手 > 歌名
  const queries: string[] = []
  if (artist && title) queries.push(`${artist} ${title}`)
  if (artist && album) queries.push(`${artist} ${album}`)
  if (album) queries.push(album)
  if (artist) queries.push(artist)
  if (title) queries.push(title)
  if (!queries.length) return result

  let pick: any = null
  for (const q of queries) {
    const s = await fetchJson(`https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(q)}&limit=10`, 8000, {
      Referer: NCM_REFERER
    })
    const songs: any[] = s?.result?.songs || []
    if (!songs.length) continue
    const titleNear = (sg: any) => !title || sg.name.includes(title) || title.includes(sg.name)
    const artistHit = (sg: any) =>
      artist ? (sg.artists || []).some((a: any) => a.name && (a.name === artist || a.name.includes(artist) || artist.includes(a.name))) : true
    // 优先「歌手精确 + 歌名相近」；其次「歌手命中且歌名相近」；再次「歌手命中」；最后任取一首
    pick =
      songs.find((sg) => artist && (sg.artists || []).some((a: any) => a.name === artist) && titleNear(sg)) ||
      songs.find((sg) => artistHit(sg) && titleNear(sg)) ||
      songs.find((sg) => artistHit(sg)) ||
      songs[0]
    if (pick) break
  }
  if (!pick) return result
  const a0 = (pick.artists || [])[0]
  if (a0?.id) {
    const det = await fetchJson(`https://music.163.com/api/artist/introduction?id=${a0.id}`, 8000, { Referer: NCM_REFERER })
    const brief = det?.briefDesc || ''
    const intro = (det?.introduction || [])
      .map((x: any) => `${x.ti || ''}\n${x.txt || ''}`)
      .filter((t: string) => t.trim())
      .join('\n\n')
    const bio = (brief + (intro ? '\n\n' + intro : '')).trim()
    if (bio) result.artistBio = bio
  }
  // 专辑名：优先用调用方传入的（来自文件内嵌标签/文件名，最可靠）；缺失时才用搜索结果补。
  // 注意：网易云搜索对原唱覆盖严重（前排多为翻唱/remix），其 album 往往不是当前歌曲所属专辑；
  // 仅当搜索命中的歌手与给定歌手「精确一致」时才采用其专辑，否则宁可留空也不要错信息。
  if (album) result.albumName = album
  else if (pick.album?.name && a0 && a0.name === artist) result.albumName = pick.album.name
  // 专辑年份：同上，仅精确歌手命中时采用搜索命中歌曲的发行年
  if (!result.albumYear && pick.album?.publishTime && a0 && a0.name === artist) {
    const d = new Date(pick.album.publishTime)
    if (!isNaN(d.getTime())) result.albumYear = String(d.getFullYear())
  }
  if (pick.album?.id) {
    const al = await fetchJson(`https://music.163.com/api/album/${pick.album.id}`, 8000, { Referer: NCM_REFERER })
    if (al?.album) {
      if (!result.albumName && al.album.name) result.albumName = al.album.name
      if (!result.albumYear && al.album.publishTime) {
        const d = new Date(al.album.publishTime)
        if (!isNaN(d.getTime())) result.albumYear = String(d.getFullYear())
      }
    }
  }
  return result
}

// 结构化兜底：按「歌手 + 歌名」在 MusicBrainz 找专辑与发行年。
// 网易云搜索常把原唱埋在翻唱/remix 之后，拿不到正确专辑/年份；MusicBrainz 是
// 结构化数据（recording → release），对「歌手+歌名」匹配更可靠，用来补专辑/年份。
async function albumYearFromMusicBrainz(artist: string, title?: string): Promise<{ albumName?: string; albumYear?: string }> {
  if (!title && !artist) return {}
  const qParts: string[] = []
  if (title) qParts.push(`recording:${JSON.stringify(title)}`)
  if (artist) qParts.push(`artist:${JSON.stringify(artist)}`)
  const q = qParts.join(' AND ')
  const data = await fetchJson(`${MB}/release/?query=${encodeURIComponent(q)}&fmt=json&limit=10`, 6000)
  const releases: any[] = data?.releases || []
  // 优先取带确切发行年的结果
  for (const rel of releases) {
    if (rel.title && rel.date) return { albumName: rel.title, albumYear: rel.date.slice(0, 4) }
  }
  if (releases[0]?.title) return { albumName: releases[0].title }
  return {}
}

// ---- 歌手 / 专辑 信息 ----
// 主源：网易云（与歌词同源，国内稳定）；无结果时兜底 MusicBrainz + Wikipedia。
// 仅有歌名（title）而无歌手/专辑时，仍会去网易云按歌名搜出歌手，拿到简介。
export async function infoFor(artist: string, album?: string, title?: string): Promise<{ artistBio?: string; albumName?: string; albumYear?: string }> {
  const ne = await neteaseInfo(artist, album, title)
  // 网易云搜索把原唱埋在翻唱之后时，专辑/年份取不到 → 用 MusicBrainz 按「歌手+歌名」补。
  if ((!ne.albumName || !ne.albumYear) && (artist || title)) {
    const mb = await albumYearFromMusicBrainz(artist, title)
    if (mb.albumName && !ne.albumName) ne.albumName = mb.albumName
    if (mb.albumYear && !ne.albumYear) ne.albumYear = mb.albumYear
  }
  if (ne.artistBio || ne.albumName || ne.albumYear) return ne
  // 兜底 MusicBrainz 需要歌手 / 专辑，仅有歌名无法可靠检索
  if (artist || album) return infoForMusicBrainz(artist, album)
  return {}
}

// 兜底：MusicBrainz（专辑/歌手检索）+ Wikipedia（歌手简介）
async function infoForMusicBrainz(artist: string, album?: string): Promise<{ artistBio?: string; albumName?: string; albumYear?: string }> {
  const result: { artistBio?: string; albumName?: string; albumYear?: string } = {}
  if (artist) {
    const a = await fetchJson(`${MB}/artist/?query=${encodeURIComponent('artist:' + artist)}&fmt=json&limit=1`)
    const mbArtist = a?.artists?.[0]
    if (mbArtist) {
      const det = await fetchJson(`${MB}/artist/${mbArtist.id}?inc=url-rels&fmt=json`)
      const wiki = det?.relations?.find((r: any) => r.type === 'wikipedia')
      const wikiTitle = wiki?.url?.resource?.split('/wiki/')[1]
      if (wikiTitle) {
        const title = decodeURIComponent(wikiTitle)
        let sum = await fetchJson(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        if (!sum?.extract) sum = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        if (sum?.extract) result.artistBio = sum.extract
      }
    }
  }
  if (album) {
    const queries: string[] = []
    if (artist) queries.push(`release:${album} AND artist:${artist}`)
    queries.push(`release:${album}`)
    for (const q of queries) {
      const rel = await releaseSearch(q)
      if (rel) {
        result.albumName = rel.title
        result.albumYear = rel.date?.slice(0, 4)
        break
      }
    }
  }
  return result
}

export async function getInfo(
  artist: string,
  album?: string,
  title?: string,
  force = false
): Promise<{ artistBio?: string; albumName?: string; albumYear?: string }> {
  const k = CVER + ckey(artist, album, title)
  const all = readCache()
  const hit = all[k]
  if (!force && hit && (hit.artistBio !== undefined || hit.albumName !== undefined)) {
    return { artistBio: hit.artistBio, albumName: hit.albumName, albumYear: hit.albumYear }
  }
  const r = await infoFor(artist, album, title)
  all[k] = { ...(hit || { ts: Date.now() }), artistBio: r.artistBio, albumName: r.albumName, albumYear: r.albumYear }
  writeCache(all)
  return r
}

// ---- 在线歌词（多源轮询，自动切换）----
// 顺序尝试多个公开歌词源，谁先返回就用谁；任一源不可达/超时自动跳下一个。
// 国内优先放网易云（music.163.com，国内可达、中文覆盖最好），其余境外源作兜底。
// 失败不缓存，方便网络恢复后重试。
type LyricSource = (artist: string, title: string) => Promise<string | null>

const NCM_REFERER = 'https://music.163.com/'

// 歌名是否命中（容错）：完全一致 / 互相包含 / 共享前缀(≥2字)，可兜住「寒武记↔寒武纪」这类近形字
function titleNear(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length >= 2 && l.startsWith(s)
}
// 两字符串的相同字符数（用于近形/近似歌名打分）
function charOverlap(a: string, b: string): number {
  if (!a || !b) return 0
  const set = new Set(b)
  let n = 0
  for (const ch of a) if (set.has(ch)) n++
  return n
}

// 网易云音乐：先按「歌手 歌名」搜索拿候选，再并行取词，
// 选「歌名最匹配(含近形容错) + 歌手命中」的一首。
// 关键修复：之前只按「歌手命中 + 歌词最长」排序，导致同歌手的热门歌(如容易受伤的女人)
// 用更长歌词抢走正确歌曲(如寒武纪)的歌词 —— 现在必须校验歌名。
async function neteaseLyrics(artist: string, title: string): Promise<string | null> {
  const trySearch = async (q: string): Promise<string | null> => {
    const s = await fetchJson(
      `https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(q)}&limit=10`,
      8000,
      { Referer: NCM_REFERER }
    )
    const songs: any[] = s?.result?.songs || []
    if (!songs.length) return null
    const cands = songs.slice(0, 8)
    const fetched = await Promise.all(
      cands.map(async (song: any, idx: number) => {
        if (!song.id) return null
        const l = await fetchJson(
          `https://music.163.com/api/song/lyric?id=${song.id}&lv=-1&kv=-1&tv=-1`,
          8000,
          { Referer: NCM_REFERER }
        )
        const lyric = l?.lrc?.lyric || l?.tlyric?.lyric || ''
        if (!lyric.trim()) return null
        const artistHit = artist
          ? (song.artists || []).some(
              (a: any) => a.name && (a.name === artist || a.name.includes(artist) || artist.includes(a.name))
            )
          : true
        const tHit = titleNear(title, song.name)
        // 综合评分：歌名命中(100) + 歌名词重叠 + 歌手命中(10)；同分选歌词更完整(最长)，再取搜索更靠前的
        const score = (tHit ? 100 : 0) + charOverlap(title || '', song.name) + (artistHit ? 10 : 0)
        return { lyric, len: lyric.length, artistHit, tHit, idx, score }
      })
    )
    const ok = fetched.filter(Boolean) as { lyric: string; len: number; artistHit: boolean; tHit: boolean; idx: number; score: number }[]
    if (!ok.length) return null
    ok.sort((a, b) => b.score - a.score || b.len - a.len || a.idx - b.idx)
    return ok[0].lyric
  }
  if (artist) {
    const r = await trySearch(`${artist} ${title}`)
    if (r) return r
  }
  return trySearch(title)
}

const LYRIC_SOURCES: LyricSource[] = [
  // 1) 网易云音乐（国内可达，首选）
  neteaseLyrics,
  // 2) lrclib：带时间轴 LRC（境外，可能慢/被墙）
  async (artist, title) => {
    const d = await fetchJson(`https://lrclib.net/api/search?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}`)
    const list = Array.isArray(d) ? d : []
    const w = list.find((x: any) => x?.syncedLyrics) || list[0]
    return w?.syncedLyrics || w?.plainLyrics || null
  },
  // 3) lyrics.ovh：纯文本（境外）
  async (artist, title) => {
    if (!artist) return null
    const p = await fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`)
    return p?.lyrics || null
  },
  // 4) megalobiz（英文为主，作为补充）
  async (artist, title) => {
    const q = artist ? `${artist} ${title}` : title
    const d = await fetchJson(`https://api.megalobiz.com/search/all/${encodeURIComponent(q)}/`)
    const results: any[] = d?.response?.results
    if (Array.isArray(results) && results[0]?.lrc) return (await fetchText(results[0].lrc)) || null
    return null
  }
]

export async function onlineLyrics(artist: string, title: string): Promise<string | null> {
  if (!artist && !title) return null
  const k = CVER + ckey('L', artist, title) // 歌词缓存单独命名空间，便于失效旧（可能残缺的）结果
  const all = readCache()
  if (all[k]?.lyrics !== undefined) return all[k].lyrics || null // 仅命中成功缓存

  // 先试「歌手+歌名」，再试「仅歌名」
  const combos: Array<[string, string]> = []
  if (artist) combos.push([artist, title])
  combos.push(['', title])

  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms)
      p.then(resolve, reject).finally(() => clearTimeout(t))
    })

  // 多个 Promise 竞速：任意一个成功即返回（模拟 Promise.any，兼容低版本 lib）
  const firstSuccess = <T,>(tasks: Promise<T>[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (tasks.length === 0) return reject(new Error('empty'))
      let pending = tasks.length
      tasks.forEach((p) =>
        p.then(resolve).catch(() => {
          pending--
          if (pending === 0) reject(new Error('all failed'))
        })
      )
    })

  for (const [a, t] of combos) {
    // 多个源并行竞速，谁先返回有效歌词就用谁（自动切换到可达的源）
    const tasks = LYRIC_SOURCES.map((src) =>
      withTimeout(src(a, t).then((r) => (r && r.trim() ? r : Promise.reject(new Error('empty')))), 5000)
    )
    try {
      const txt = await firstSuccess(tasks)
      all[k] = { ...(all[k] || { ts: Date.now() }), lyrics: txt }
      writeCache(all)
      return txt
    } catch {
      /* 本组（歌手+歌名 / 仅歌名）全部失败，尝试下一组 */
    }
  }
  return null // 全部失败：不缓存，便于稍后重试
}
