#!/usr/bin/env bash
# 将 electron-builder --win dir 产出的 win-unpacked 直接打包成 zip（免安装便携版）。
# 因本机无法访问 GitHub 下载 electron-builder 的 app-builder 二进制，故手动 zip。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release"
VERSION="$(node -p "require('$ROOT/package.json').version")"
ZIP="$OUT/天剑音乐播放器-${VERSION}-win-x64.zip"

# electron-builder --win dir --x64 解包目录为 win-x64-unpacked（指定架构时带 arch 后缀）
SRC="$ROOT/release/win-x64-unpacked"
if [ ! -d "$SRC" ]; then
  SRC="$(ls -d "$ROOT/release/win-"*-unpacked 2>/dev/null | head -1)"
fi
if [ ! -d "$SRC" ]; then
  echo "错误：未找到 release/win-*-unpacked，请先运行 electron-builder --win dir --x64" >&2
  exit 1
fi

rm -f "$ZIP"
cd "$SRC"
zip -r -q "$ZIP" .
echo "已生成: $ZIP"
