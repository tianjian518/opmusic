// 浏览器/Capacitor 端的在线刮削与歌词抓取（无 Electron 主进程时使用）。
// 逻辑与 src/main/meta.ts 一致，但用 window.fetch + localStorage 缓存，
// 封面直接返回可访问的 URL（不再经 Node 取字节）。

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

// ---- localStorage 缓存 ----
interface MetaCacheItem {
  cover?: string
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
  try {
    return JSON.parse(localStorage.getItem('metaCache') || '{}')
  } catch {
    return {}
  }
}
function writeCache(all: MetaCache) {
  try {
    localStorage.setItem('metaCache', JSON.stringify(all))
  } catch {
    /* 忽略：存储满时不影响主流程 */
  }
}
function ckey(artist?: string, album?: string, title?: string) {
  return `${artist || ''}|${album || ''}|${title || ''}`
}

// ---- 封面 ----
async function releaseSearch(q: string): Promise<any | null> {
  const data = await fetchJson(`${MB}/release/?query=${encodeURIComponent(q)}&fmt=json&limit=1`)
  return data?.releases?.[0] || null
}

// 网易云封面（国内可达，比 MusicBrainz 稳）。有歌名时优先用「歌曲搜索定位精确专辑 →
// 专辑详情拿 picUrl」，能命中按歌手搜首张专辑拿不到的正确封面（如「爱转角」）。
async function coverViaSong(artist: string, title: string): Promise<string | null> {
  if (!artist || !title) return null
  const s = await fetchJson(`https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(artist + ' ' + title)}&limit=10`, 8000, {
    Referer: 'https://music.163.com/'
  })
  const songs: any[] = s?.result?.songs || []
  for (const sg of songs) {
    const art = (sg.artists || []).map((x: any) => x.name).join('/')
    if (art === artist || art.includes(artist) || artist.includes(art)) {
      // 优先：专辑详情里的 picUrl（最准）
      const aid = sg.album?.id
      if (aid) {
        const al = await fetchJson(`https://music.163.com/api/album/${aid}`, 8000, { Referer: 'https://music.163.com/' })
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
      Referer: 'https://music.163.com/'
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
  if (!artist && !album && !title) return { url: null }
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

export async function coverInfoFor(artist: string, album: string, title?: string): Promise<MetaCacheItem | null> {
  const k = ckey(artist, album, title)
  const all = readCache()
  let item = all[k]
  if (item?.cover === undefined) {
    const r = await coverFor(artist, album, title)
    item = { ...(item || { ts: Date.now() }), cover: r.url || undefined, coverYear: r.year, coverAlbum: r.albumName }
    all[k] = item
    writeCache(all)
  }
  return item.cover ? item : null
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
      Referer: 'https://music.163.com/'
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
    const det = await fetchJson(`https://music.163.com/api/artist/introduction?id=${a0.id}`, 8000, { Referer: 'https://music.163.com/' })
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
  if (!result.albumYear && pick.album?.publishTime && a0 && a0.name === artist) {
    const d = new Date(pick.album.publishTime)
    if (!isNaN(d.getTime())) result.albumYear = String(d.getFullYear())
  }
  if (pick.album?.id) {
    const al = await fetchJson(`https://music.163.com/api/album/${pick.album.id}`, 8000, { Referer: 'https://music.163.com/' })
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

// 判定文件名「A - B」两段谁是歌手（与 src/main/meta.ts 同逻辑）：用歌曲搜索看返回歌曲的
// 「歌手/歌名」如何对应两段；仅当能明确对应时才返回，否则返回 null 交回目录/默认判定。
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
    { Referer: 'https://music.163.com/' }
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

// ---- 歌手 / 专辑 信息 ----
// 主源：网易云（与歌词同源，国内稳定）；无结果时兜底 MusicBrainz + Wikipedia。
// 仅有歌名（title）而无歌手/专辑时，仍会去网易云按歌名搜出歌手，拿到简介。
export async function infoFor(artist: string, album?: string, title?: string): Promise<{ artistBio?: string; albumName?: string; albumYear?: string }> {
  const ne = await neteaseInfo(artist, album, title)
  if (ne.artistBio || ne.albumName || ne.albumYear) return ne
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

export async function getInfo(artist: string, album?: string, title?: string, force = false): Promise<{ artistBio?: string; albumName?: string; albumYear?: string }> {
  const k = ckey(artist, album, title)
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
type LyricSource = (artist: string, title: string) => Promise<string | null>

// 网易云音乐：先按「歌手 歌名」搜索拿候选，再并行取词，
// 选「歌手最匹配 + 歌词最完整(最长)」的一首，避免匹配到时长很短的翻唱/片段版
// 导致歌词只有前半段。
async function neteaseLyrics(artist: string, title: string): Promise<string | null> {
  const trySearch = async (q: string): Promise<string | null> => {
    const s = await fetchJson(
      `https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(q)}&limit=10`,
      8000,
      { Referer: 'https://music.163.com/' }
    )
    const songs: any[] = s?.result?.songs || []
    if (!songs.length) return null
    const cands = songs.slice(0, 8)
    const fetched = await Promise.all(
      cands.map(async (song: any) => {
        if (!song.id) return null
        const l = await fetchJson(
          `https://music.163.com/api/song/lyric?id=${song.id}&lv=-1&kv=-1&tv=-1`,
          8000,
          { Referer: 'https://music.163.com/' }
        )
        const lyric = l?.lrc?.lyric || l?.tlyric?.lyric || ''
        if (!lyric.trim()) return null
        const artistHit = artist
          ? (song.artists || []).some(
              (a: any) => a.name && (a.name === artist || a.name.includes(artist) || artist.includes(a.name))
            )
          : true
        return { lyric, len: lyric.length, artistHit }
      })
    )
    const ok = fetched.filter(Boolean) as { lyric: string; len: number; artistHit: boolean }[]
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
  const k = ckey('L', artist, title) // 歌词缓存单独命名空间，便于失效旧（可能残缺的）结果
  const all = readCache()
  if (all[k]?.lyrics !== undefined) return all[k].lyrics || null

  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms)
      p.then(resolve, reject).finally(() => clearTimeout(t))
    })
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

  const combos: Array<[string, string]> = []
  if (artist) combos.push([artist, title])
  combos.push(['', title])

  for (const [a, t] of combos) {
    const tasks = LYRIC_SOURCES.map((src) =>
      withTimeout(
        src(a, t).then((r) => (r && r.trim() ? r : Promise.reject(new Error('empty')))),
        5000
      )
    )
    try {
      const txt = await firstSuccess(tasks)
      all[k] = { ...(all[k] || { ts: Date.now() }), lyrics: txt }
      writeCache(all)
      return txt
    } catch {
      /* 本组全部失败，尝试下一组 */
    }
  }
  return null
}
