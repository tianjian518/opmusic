// 简易 JSON 文件存储（替代 electron-store）：保存 WebDAV 账号与在线封面/歌词缓存。
// 数据目录由环境变量 DATA_DIR 指定（Docker 中挂到卷），默认 ./data。
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json')
const METACACHE_FILE = path.join(DATA_DIR, 'metacache.json')

function readJson(file, fallback) {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    return txt ? JSON.parse(txt) : fallback
  } catch {
    return fallback
  }
}
function writeJson(file, val) {
  fs.writeFileSync(file, JSON.stringify(val, null, 2))
}

// ---- 账号 ----
export function getAccounts() {
  return readJson(ACCOUNTS_FILE, [])
}
export function getAccount(id) {
  return getAccounts().find((a) => a.id === id)
}
export function upsertAccount(acc) {
  const list = getAccounts()
  const idx = list.findIndex((a) => a.id === acc.id)
  if (idx >= 0) list[idx] = acc
  else list.push(acc)
  writeJson(ACCOUNTS_FILE, list)
  return acc
}
export function deleteAccount(id) {
  const list = getAccounts().filter((a) => a.id !== id)
  writeJson(ACCOUNTS_FILE, list)
  return list
}

// ---- 在线元数据缓存（封面/歌词）----
export function getMetaCache() {
  return readJson(METACACHE_FILE, {})
}
export function setMetaCache(all) {
  writeJson(METACACHE_FILE, all)
}

// ---- 通用键值存储（歌单 / 收藏 / 设置 等用户数据，服务端持久化到 /data/store.json）----
// 让换浏览器、换设备、换电脑都能读到同一份数据，不再依赖浏览器 localStorage。
const STORE_FILE = path.join(DATA_DIR, 'store.json')

export function getKV(key) {
  const obj = readJson(STORE_FILE, {})
  return obj[key]
}
export function setKV(key, val) {
  const obj = readJson(STORE_FILE, {})
  obj[key] = val
  writeJson(STORE_FILE, obj)
  return val
}
