# OpMusic —— 自托管 Web 服务镜像
# 多阶段构建：builder 编译前端，runner 仅携带运行时依赖 + ffmpeg。

# ---------- 阶段 1：构建前端 ----------
FROM node:20-bookworm AS builder
WORKDIR /app
# 跳过 electron 二进制下载（网页版不需要，且体积巨大）
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build:server

# ---------- 阶段 2：运行 ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg 用于 WMA/APE 实时转码，以及内嵌标签/时长读取（ffprobe）
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY server ./server

ENV PORT=8080
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "server/index.mjs"]
