# syntax=docker/dockerfile:1
# YggdrasilSkinServer 多阶段构建：
#   1) node 构建前端 web/dist
#   2) golang 静态编译后端（SQLite 为纯 Go 驱动，无需 CGO）
#   3) alpine 运行镜像（非 root 用户，持久化数据挂载到 /app/data）

# ---------- 阶段一：前端构建 ----------
FROM node:22-alpine AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- 阶段二：后端编译 ----------
FROM golang:1.26-alpine AS server-build
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/yss .

# ---------- 阶段三：运行镜像 ----------
FROM alpine:3.21
RUN addgroup -S yss && adduser -S -G yss yss
WORKDIR /app
COPY --from=server-build /out/yss /usr/local/bin/yss
COPY --from=web-build /build/web/dist /app/web/dist
RUN mkdir -p /app/data/textures /app/data/ysm \
    && chown -R yss:yss /app
USER yss

ENV YSS_WEB_DIST=/app/web/dist \
    YSS_DATABASE_PATH=/app/data/yss.db \
    YSS_STORAGE_TEXTURE_DIR=/app/data/textures \
    YSS_STORAGE_YSM_DIR=/app/data/ysm

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

CMD ["yss"]