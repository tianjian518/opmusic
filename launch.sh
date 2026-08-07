#!/bin/bash
# WebDAV 音乐播放器 —— 双击启动脚本（无需终端）
export PATH=/home/QM-346/node20/bin:/home/QM-346/bin:$PATH
cd /home/QM-346/music-player

# 首次或构建产物缺失时自动构建一次；之后直接启动已构建的程序（秒开）
if [ ! -f dist/index.html ]; then
  echo "首次启动，正在构建……"
  npm run build
fi

# 直接运行已打包的 electron 程序（生产模式，无需 dev server / 终端）
exec /home/QM-346/music-player/node_modules/electron/dist/electron /home/QM-346/music-player
