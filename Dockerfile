# 天剑音乐播放器 —— 自托管 Web 服务镜像
# 多阶段构建：builder 编译前端，runner 仅携带运行时依赖 + ffmpeg。
#
# 国内构建可传入镜像源加速（默认用官方源）：
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t opmusic .
#   docker build --build-arg APT_MIRROR=mirrors.aliyun.com          -t opmusic .

# ---------- 阶段 1：构建前端 ----------
FROM node:20-bookworm AS builder
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org
# 跳过 electron 二进制下载（网页版不需要，且体积巨大）
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" \
  && npm install --no-audit --no-fund
COPY . .
RUN npm run build:server

# ---------- 阶段 2：运行 ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG APT_MIRROR=deb.debian.org
ENV NODE_ENV=production

# ffmpeg 用于 WMA/APE 实时转码，以及内嵌标签/时长读取（ffprobe）
RUN set -eux; \
  if [ "$APT_MIRROR" != "deb.debian.org" ]; then \
    sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list 2>/dev/null || true; \
  fi; \
  apt-get update; \
  apt-get install -y --no-install-recommends ffmpeg; \
  rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" \
  && npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server ./server

ENV PORT=8080
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080

# 健康检查：容器编排里能看到服务是否真的可用
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
