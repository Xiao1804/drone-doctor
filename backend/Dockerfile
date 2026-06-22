# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

# ═══════════════════════════════════════════════════════════════
# 1. 国内镜像加速配置（必须在任何安装命令之前设置）
# ═══════════════════════════════════════════════════════════════
ENV npm_config_registry=https://registry.npmmirror.com

# ═══════════════════════════════════════════════════════════════
# 2. 系统依赖安装（使用 BuildKit 缓存挂载加速 apt）
# ═══════════════════════════════════════════════════════════════
RUN find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) \
    -exec sed -i 's|deb.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true && \
    find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) \
    -exec sed -i 's|security.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true

# 安装系统级依赖
# - python3: 运行 pyulog 飞行日志解析脚本
# - python3-pip: 安装 pyulog
# - make g++: node-gyp 编译工具（sqlite3 等依赖可能需要编译）
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-pip make g++ \
    && rm -rf /var/lib/apt/lists/*

# 配置 pip 阿里云镜像并安装 pyulog
RUN python3 -m pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && python3 -m pip install --break-system-packages --no-cache-dir pyulog

# ═══════════════════════════════════════════════════════════════
# 3. Node.js 依赖安装（利用 Docker 缓存 + BuildKit npm 缓存挂载）
# ═══════════════════════════════════════════════════════════════
WORKDIR /app

ENV NODE_ENV=production
ENV LOCAL_MODEL_PATH=/app/models

COPY backend/package*.json ./

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev \
    && npm rebuild sqlite3 --build-from-source

# ═══════════════════════════════════════════════════════════════
# 4. 应用代码（变更最频繁，放在最后以最大化缓存命中）
# ═══════════════════════════════════════════════════════════════
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/shared ./shared
COPY data ./data
COPY backend/models ./models

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "run", "start:production"]
