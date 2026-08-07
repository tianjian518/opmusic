// 在线封面抓取（服务端发起，绕开浏览器 CORS）：优先网易云（国内可达），
// 兜底 MusicBrainz Cover Art Archive。逻辑来自 src/main/meta.ts，去掉 electron-store 依赖，
// 改用 server/store.mjs 的缓存。
import { getMetaCache, setMetaCache } from './store.mjs'

const UA = 'OpMusicPlayer/1.0 (local music player)'
const NCM_REFERER = 'https://music.163.com/'
const MB = 'https://musicbrainz.org/ws/2'
const CA = 'https://coverartarchive.org/release'
const CVER = 'v2:'

async function fetchJson(url, timeout = 8000, headers) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
async function fetchBytes(url, timeout = 8000, headers) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: headers || undefined })
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return { buf: Buffer.from(ab), type: res.headers.get('content-type') || 'image/jpeg' }
  } catch {
    return null
  }
}
const ckey = (artist, album, title) => `${artist || ''}|${album || ''}|${title || ''}`

async function releaseSearch(q) {
  const data = await fetchJson(`${MB}/release/?query=${encodeURIComponent(q)}&fmt=json&limit=1`)
  return data?.releases?.[0] || null
}
async function neteaseCover(artist, album, title) {
  if (!artist && !title) return null
  const queries = []
  if (artist && title) {
    const s = await fetchJson(`https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(artist + ' ' + title)}&limit=10`, 8000, { Referer: NCM_REFERER })
    for (const sg of s?.result?.songs || []) {
      const art = (sg.artists || []).map((x) => x.name).join('/')
      if (art === artist || art.includes(artist) || artist.includes(art)) {
        const aid = sg.album?.id
        if (aid) {
          const al = await fetchJson(`https://music.163.com/api/album/${aid}`, 8000, { Referer: NCM_REFERER })
          const pic = al?.album?.picUrl || al?.album?.blurPicUrl
          if (pic) return pic
        }
        if (sg.album?.name) {
          const c = await neteaseCoverSearch(artist, sg.album.name)
          if (c) return c
        }
      }
    }
  }
  const q2 = []
  if (artist && album) q2.push(`${artist} ${album}`)
  if (album) q2.push(album)
  if (artist) q2.push(artist)
  for (const q of q2) {
    const s = await fetchJson(`https://music.163.com/api/search/get?type=10&s=${encodeURIComponent(q)}&limit=10`, 8000, { Referer: NCM_REFERER })
    for (const a of s?.result?.albums || []) {
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
async function neteaseCoverSearch(artist, album) {
  const queries = []
  if (artist && album) queries.push(`${artist} ${album}`)
  if (album) queries.push(album)
  if (artist) queries.push(artist)
  for (const q of queries) {
    const s = await fetchJson(`https://music.163.com/api/search/get?type=10&s=${encodeURIComponent(q)}&limit=10`, 8000, { Referer: NCM_REFERER })
    for (const a of s?.result?.albums || []) {
      const pic = a?.picUrl
      if (!pic) continue
      if (artist) {
        const an = a?.artist?.name || ''
        if (!(an && (an === artist || an.includes(artist) || artist.includes(an)))) continue
      }
      return pic
    }
  }
  return null
}
async function coverFor(artist, album, title) {
  if (!artist && !album && !title) return { url: null }
  const ne = await neteaseCover(artist, album, title)
  if (ne) return { url: ne }
  const queries = []
  if (artist && album) queries.push(`release:${album} AND artist:${artist}`)
  if (album) queries.push(`release:${album}`)
  if (artist) queries.push(`artist:${artist}`)
  for (const q of queries) {
    const rel = await releaseSearch(q)
    if (rel) return { url: `${CA}/${rel.id}/front`, year: rel.date?.slice(0, 4), albumName: rel.title }
  }
  return { url: null }
}

// 返回 { buf, type } 或 null
export async function coverBytesFor(artist, album, title) {
  const k = CVER + ckey(artist, album, title)
  const all = getMetaCache()
  let url = all[k]?.cover
  if (url === undefined) {
    const r = await coverFor(artist, album, title)
    url = r.url || null
    all[k] = { ...(all[k] || { ts: Date.now() }), cover: url || undefined }
    setMetaCache(all)
  }
  if (!url) return null
  const isNcm = url.includes('music.163.com') || url.includes('music.126.net')
  try {
    return await fetchBytes(url, 8000, isNcm ? { Referer: NCM_REFERER, 'User-Agent': UA } : undefined)
  } catch {
    if (isNcm) {
      try {
        return await fetchBytes(url, 8000)
      } catch {
        return null
      }
    }
    return null
  }
}
