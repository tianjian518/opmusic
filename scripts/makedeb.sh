#!/usr/bin/env bash
# 用 dpkg-deb 直接打包 .deb（不依赖 electron-builder 的 fpm，避免联网下载）。
# 前提：release/linux-arm64-unpacked 已存在（由 electron-builder --linux dir 产出）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/release/linux-arm64-unpacked"
OUT="$ROOT/release"
APP_ID="tianjian-music"
APP_NAME="天剑音乐播放器"
VERSION="$(node -p "require('$ROOT/package.json').version")"
DEB="$OUT/${APP_NAME}-${VERSION}-linux-arm64.deb"

if [ ! -d "$SRC" ]; then
  echo "错误：未找到 $SRC，请先运行 electron-builder --linux dir" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# 应用文件 -> /opt/tianjian-music
mkdir -p "$STAGE/opt/$APP_ID"
cp -a "$SRC/." "$STAGE/opt/$APP_ID/"

# 启动器 /usr/bin/tianjian-music
mkdir -p "$STAGE/usr/bin"
cat > "$STAGE/usr/bin/$APP_ID" <<EOF
#!/bin/bash
exec /opt/$APP_ID/webdav-music-player "\$@"
EOF
chmod 755 "$STAGE/usr/bin/$APP_ID"

# 桌面入口
mkdir -p "$STAGE/usr/share/applications"
cat > "$STAGE/usr/share/applications/$APP_ID.desktop" <<EOF
[Desktop Entry]
Name=$APP_NAME
Comment=支持 WebDAV 的本地音乐播放器
Exec=$APP_ID
Terminal=false
Type=Application
Categories=Audio;Music;
StartupWMClass=webdav-music-player
EOF

# 控制信息
mkdir -p "$STAGE/DEBIAN"
SIZE_KB="$(du -sk "$STAGE/opt/$APP_ID" | cut -f1)"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: $APP_ID
Version: $VERSION
Section: sound
Priority: optional
Architecture: arm64
Maintainer: QM-346 <qm346@example.com>
Depends: libgtk-3-0, libnss3, libasound2, libxss1, libgbm1, libx11-xcb1, libdrm2
Installed-Size: $SIZE_KB
Description: 天剑音乐播放器
 支持 WebDAV 的本地音乐播放器（桌面端），内置 ffmpeg 可转码 WMA/APE。
EOF

rm -f "$DEB"
dpkg-deb --build --root-owner-group "$STAGE" "$DEB" >/dev/null
echo "已生成: $DEB"
