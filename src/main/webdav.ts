import { createClient } from 'webdav'
import type { WebDAVClient } from 'webdav'
import { appStore, Account } from './store'

const AUDIO_EXT = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'ape', 'wma']
export function isAudio(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return AUDIO_EXT.includes(ext)
}

const clientCache = new Map<string, WebDAVClient>()

export function getAccounts(): Account[] {
  return appStore.get<Account[]>('accounts') || []
}

export function saveAccount(acc: Account) {
  const list = getAccounts()
  const idx = list.findIndex((a) => a.id === acc.id)
  if (idx >= 0) list[idx] = acc
  else list.push(acc)
  appStore.set('accounts', list)
  clientCache.delete(acc.id)
}

export function deleteAccount(id: string) {
  const list = getAccounts().filter((a) => a.id !== id)
  appStore.set('accounts', list)
  clientCache.delete(id)
}

export function getAccount(id: string): Account | undefined {
  return getAccounts().find((a) => a.id === id)
}

export function getClient(accountId: string): WebDAVClient {
  let c = clientCache.get(accountId)
  if (!c) {
    const acc = getAccount(accountId)
    if (!acc) throw new Error('账号不存在: ' + accountId)
    c = createClient(acc.url.replace(/\/$/, '') + '/', {
      username: acc.username,
      password: acc.password
    })
    clientCache.set(accountId, c)
  }
  return c
}

export interface FileItem {
  name: string
  path: string
  isDir: boolean
  size: number
  lastmod: string
}

export async function listFiles(accountId: string, dir: string): Promise<FileItem[]> {
  const client = getClient(accountId)
  const items = await client.getDirectoryContents(dir, { includeSelf: false })
  const arr = Array.isArray(items) ? items : (items as any).data || []
  return (arr as any[])
    .map((it) => ({
      name: it.basename,
      path: it.filename,
      isDir: it.type === 'directory',
      size: it.size || 0,
      lastmod: it.lastmod || ''
    }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
}

export async function search(accountId: string, root: string, kw: string, depth = 3): Promise<FileItem[]> {
  const kwl = kw.toLowerCase()
  const out: FileItem[] = []
  async function walk(dir: string, d: number) {
    if (d > depth) return
    const list = await listFiles(accountId, dir)
    for (const it of list) {
      if (it.name.toLowerCase().includes(kwl)) out.push(it)
      if (it.isDir) await walk(it.path, d + 1)
    }
  }
  await walk(root, 0)
  return out.filter((i) => !i.isDir)
}

// 递归收集一个文件夹（含子目录）内的全部音频文件，用于“文件夹导入歌单”
export async function collectAudio(accountId: string, dir: string, depth = 6): Promise<FileItem[]> {
  const out: FileItem[] = []
  async function walk(d: string, dep: number) {
    if (dep > depth) return
    const list = await listFiles(accountId, d)
    for (const it of list) {
      if (it.isDir) await walk(it.path, dep + 1)
      else if (isAudio(it.name)) out.push(it)
    }
  }
  await walk(dir, 0)
  return out
}
