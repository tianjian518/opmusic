import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { startStreamServer } from './streamServer'
import { getAccounts, saveAccount, deleteAccount, listFiles, search, collectAudio } from './webdav'
import { getInfo, onlineLyrics, disambiguateArtistTitle } from './meta'
import { getTrackTags, getTrackDuration } from './tags'
import { appStore } from './store'

// 主进程异常兜底：记录堆栈到文件（便于排查），并以带堆栈的对话框替代默认的模糊报错。
const ERROR_LOG = '/tmp/opmusic-main-error.log'
function logError(where: string, err: unknown) {
  const detail = err && (err as any).stack ? (err as any).stack : String(err)
  const msg = `[${new Date().toISOString()}] ${where}: ${detail}\n`
  try {
    fs.appendFileSync(ERROR_LOG, msg)
  } catch {
    /* 忽略写入失败 */
  }
  console.error(msg)
}
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err)
  try {
    dialog.showErrorBox('主进程出错', `OpMusic 主进程发生异常（已记录到 ${ERROR_LOG}）：\n\n${err?.stack || String(err)}`)
  } catch {
    /* ignore */
  }
})
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason)
})

// 允许在异步回调里直接 play()（否则 Chromium 自动播放策略会拦截，导致点歌不响）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// 鲲鹏/ARM Linux 上 GPU(GBM/EGL) 初始化会失败，禁用 GPU 走软件渲染，避免窗口异常
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')

let streamBase = ''
let lyricsWin: BrowserWindow | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'OpMusic',
    backgroundColor: '#0f0f12',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    // 自检模式：加载时带 ?selftest=1，渲染进程会自动连接本地测试 WebDAV 并播放
    const url = process.env.SELFTEST ? process.env.VITE_DEV_SERVER_URL + '?selftest=1' : process.env.VITE_DEV_SERVER_URL
    win.loadURL(url)
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
  return win
}

function createLyricsWindow() {
  if (lyricsWin) return lyricsWin
  const win = new BrowserWindow({
    width: 900,
    height: 90,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;height:100%;background:transparent;display:flex;align-items:center;justify-content:center;
        font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8);}
        #t{font-size:26px;font-weight:600;opacity:.95;padding:0 20px;}</style></head>
        <body><div id="t"></div>
        <script>window.electronAPI.onLyric((t)=>{document.getElementById('t').textContent=t||'';});</script>
        </body></html>`
      )
  )
  win.on('closed', () => (lyricsWin = null))
  return win
}

function registerIpc() {
  ipcMain.handle('accounts:list', () => getAccounts())
  ipcMain.handle('accounts:save', (_e, acc) => saveAccount(acc))
  ipcMain.handle('accounts:delete', (_e, id) => deleteAccount(id))
  ipcMain.handle('files:list', async (_e, acct: string, dir: string) => listFiles(acct, dir))
  ipcMain.handle('files:search', async (_e, acct: string, root: string, kw: string) => search(acct, root, kw))
  ipcMain.handle('files:collectAudio', async (_e, acct: string, dir: string, depth: number) => collectAudio(acct, dir, depth))
  ipcMain.handle('stream:base', () => streamBase)
  ipcMain.handle('store:get', (_e, key: string) => appStore.get(key))
  ipcMain.handle('store:set', (_e, key: string, val: any) => appStore.set(key, val))
  ipcMain.handle('meta:info', async (_e, artist: string, album: string, title?: string, force?: boolean) => getInfo(artist, album, title, force))
  ipcMain.handle('meta:tags', async (_e, acct: string, path: string) => getTrackTags(acct, path))
  ipcMain.handle('meta:duration', async (_e, acct: string, path: string) => getTrackDuration(acct, path))
  ipcMain.handle('meta:disambiguate', async (_e, a: string, b: string) => disambiguateArtistTitle(a, b))
  ipcMain.handle('lyrics:online', async (_e, artist: string, title: string) => onlineLyrics(artist, title))
  ipcMain.on('lyric:set', (_e, text: string) => {
    if (!lyricsWin) createLyricsWindow()
    lyricsWin?.webContents.send('lyric', text)
  })
  ipcMain.on('lyric:hide', () => {
    if (lyricsWin) {
      lyricsWin.close()
      lyricsWin = null
    }
  })
  ipcMain.on('open-external', (_e, url: string) => shell.openExternal(url))
  ipcMain.on('selftest:result', (_e, data: any) => {
    try { require('fs').writeFileSync('/tmp/selftest-result.json', JSON.stringify(data, null, 2)) } catch {}
  })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildAppMenu())
  const s = await startStreamServer()
  streamBase = s.base
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 中文应用菜单（替代 Electron 默认的英文菜单：文件/编辑/视图…）
function buildAppMenu(): Menu {
  const template: any[] = [
    {
      label: '文件',
      submenu: [{ label: '退出', role: 'quit' }]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '删除', role: 'delete' },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 OpMusic',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于 OpMusic',
              message: 'OpMusic',
              detail: '连接 WebDAV 网盘、播放本地与云端音乐的桌面播放器。\n版本 0.1.0'
            })
          }
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}
