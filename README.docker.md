# OpMusic · Docker / 自托管 Web 版

把 **OpMusic（原 Electron 桌面播放器）** 改造成可在浏览器访问的**自托管 Web 服务**：
前端是编译后的静态页面，后端是一个独立的 Node 服务，负责代理 WebDAV（绕开浏览器 CORS）、
流媒体 Range 续传、封面/歌词获取、以及 WMA/APE 的 ffmpeg 实时转码。适合部署到服务器或 NAS，
用浏览器（手机/电脑）访问，也能分享给同网络的人用。

> 桌面版（Electron）完全不受影响，仍可用原来的 `npm run build` 打包。

## 架构
```
浏览器 ──► 静态前端(dist/)  +  /api/*、/stream、/cover、/lyrics
                │
                ▼
          Node 后端(server/index.mjs)
                │  createClient(webdav)
                ▼
           你的 WebDAV 网盘
```
- 账号（WebDAV 地址/用户名/密码）存在服务端 `DATA_DIR/accounts.json`，由 `/api/accounts` 管理。
- 流媒体与封面/歌词都经后端代理，浏览器不直接接触网盘凭据，也无 CORS 问题。
- 歌单、收藏、设置等仍保存在**浏览器 localStorage**（按浏览器隔离，重装浏览器会丢，后续可加服务端存储）。

## 构建镜像
```bash
# 在能联网、装了 Docker 的机器上
docker build -t <你的DockerHub用户名>/opmusic:latest .
```
> 镜像架构 = 构建机架构（amd64 / arm64）。如需多架构，用 `docker buildx build --platform linux/amd64,linux/arm64`。

## 推送到 Docker Hub
```bash
docker login
docker push <你的DockerHub用户名>/opmusic:latest
```

## 运行
```bash
# 最简：数据存到当前目录 ./data
docker run -d --name opmusic -p 8080:8080 -v "$PWD/data:/data" \
  <你的DockerHub用户名>/opmusic:latest

# 用 docker-compose（已内置）
docker compose up -d
```
打开 `http://<服务器IP>:8080`，在「音乐库 → 添加连接」填 WebDAV 地址、用户名、密码即可。

### 公网 / 多人使用建议
- 设置 Basic Auth 环境变量（全站鉴权）：
  ```bash
  docker run -d -p 8080:8080 -v "$PWD/data:/data" \
    -e TJ_USER=admin -e TJ_PASSWORD=你的强密码 \
    <你的DockerHub用户名>/opmusic:latest
  ```
- 在反向代理（Nginx/Caddy）后加 HTTPS；不要把 8080 直接暴露在公网且无鉴权。
- `/data/accounts.json` 里是**明文** WebDAV 密码，保护好这个卷的权限。

## 环境变量
| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8080` | 服务监听端口 |
| `DATA_DIR` | `/data` | 账号与缓存存储目录（挂卷持久化） |
| `TJ_USER` / `TJ_PASSWORD` | 空 | 同时设置则开启全站 Basic Auth |

## 已知限制
- 账号是**服务端共享**命名空间（按 id 区分）：同一实例多人用会看到彼此添加的网盘。个人/家庭自用没问题；
  多租户隔离需另行改造。
- WMA / APE 需要服务端装 `ffmpeg`（镜像已自带）才能播放与读标签。
- 在线封面/歌词依赖服务端能访问网易云、MusicBrainz 等外网；无外网时仅能用网盘内的 `folder.jpg` 与同名 `.lrc`。

## 本地不使用 Docker 直接跑
```bash
npm install
npm run build:server      # 产出 dist/
node server/index.mjs     # 启动后端，默认 8080
```
