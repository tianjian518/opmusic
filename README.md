# WebDAV 音乐播放器（桌面端）

一款对标主流音乐播放器（QQ音乐 / 网易云音乐）的**本地桌面播放器**，核心能力是直连 **WebDAV 网盘**，浏览并播放网盘里的音乐文件。主进程在服务端发起 WebDAV 请求，彻底避开浏览器 CORS 限制。

## 功能
- **WebDAV 多账号**：添加 / 保存 / 进入多个网盘（坚果云、Nextcloud、群晖、自建等）
- **文件浏览**：目录树、音频过滤、面包屑、搜索（递归子目录）
- **播放**：播放 / 暂停 / 上 / 下一首、进度拖拽（支持 Range 续传）、音量
- **播放模式**：顺序 / 列表循环 / 单曲循环 / 随机
- **歌单 & 收藏**：自建歌单、一键收藏、播放队列
- **歌词**：自动加载同名 `.lrc`，滚动高亮 + **桌面歌词悬浮窗**
- **均衡器**：Web Audio 10 段均衡
- **外观**：深色 / 浅色主题 + 强调色
- **封面**：自动读取目录内 `folder.jpg` / `cover.jpg` / `album.jpg`
- **进度记忆 / 持久化**：账号、设置、歌单、收藏均落盘（electron-store）

## 技术栈
Electron + React 18 + TypeScript + Vite + webdav + electron-store + zustand

- 主进程：WebDAV 连接、本地流媒体代理（支持 Range）、持久化、桌面歌词窗
- 渲染进程：React UI，通过 `contextBridge` 安全调用主进程

## 运行方式

> 依赖 Node 18+。国内用户建议配置镜像：`ELECTRON_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/electron/`

```bash
npm install
npm run dev        # 开发：Vite 热更新 + 启动 Electron
npm run build      # 生产构建（输出 dist/ 与 dist-electron/）
```

打包为安装包（可选）：
```bash
npm install -D electron-builder
npx electron-builder   # 需先 npm run build
```

## 使用
1. 打开后在「音乐库」点击 **添加连接**，填入 WebDAV 地址、用户名、密码（坚果云用授权码）。
2. 进入目录，点击音频即播放；`＋` 加入队列，`♥` 收藏，`📋` 加入歌单。
3. 顶部「搜索」可在当前目录及子目录中检索歌曲。
4. 底部播放条右侧可开关歌词 / 均衡器 / 桌面歌词。

## 已知限制 / 后续
- v1 聚焦桌面端；**安卓端**计划用 Capacitor 套壳复用同一套 React UI 实现。
- 在线匹配专辑/歌手信息（如 MusicBrainz）为后续增强项，当前封面优先取本地文件。
- 大目录递归搜索有深度上限（默认 3 层），可在 `src/main/webdav.ts` 调整。
