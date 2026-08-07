import path from 'node:path'
import fs from 'node:fs'

// 打包后 ffmpeg / ffprobe 会被放进 extraResources（见 package.json 的 extraResources）：
//   resources/bin/<platform>/ffmpeg(.exe)
// 其中 <platform> 为 linux / win。开发期或未打包时该目录不存在，回退到系统 PATH 的裸名。
function resolveBin(name: string): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const bare = name + ext
  const platformDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  if (process.resourcesPath) {
    const p = path.join(process.resourcesPath, 'bin', platformDir, bare)
    if (fs.existsSync(p)) return p
  }
  return bare
}

export const FFMPEG_BIN = resolveBin('ffmpeg')
export const FFPROBE_BIN = resolveBin('ffprobe')
