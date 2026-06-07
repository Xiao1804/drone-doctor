# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

# ═══════════════════════════════════════════════════════════════
# 1. 国内镜像加速配置（必须在任何安装命令之前设置）
# ═══════════════════════════════════════════════════════════════
# npm 使用淘宝镜像，大幅加速 node_modules 下载
ENV npm_config_registry=https://registry.npmmirror.com

# sharp libvips 预编译二进制下载镜像（优先级最高的配置方式）
# 避免从 GitHub 下载超时导致回退到源码编译（耗时 10+ 分钟）
ENV SHARP_DIST_BASE_URL=https://npmmirror.com/mirrors/sharp-libvips/v8.14.5/
# 保留备用配置，兼容 sharp 不同版本的读取逻辑
ENV npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips
ENV SHARP_LIBVIPS_BINARY_HOST=https://npmmirror.com/mirrors/sharp-libvips

# ═══════════════════════════════════════════════════════════════
# 2. 系统依赖安装（使用 BuildKit 缓存挂载加速 apt）
# ═══════════════════════════════════════════════════════════════
# 换国内 apt 源加速
RUN find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) \
    -exec sed -i 's|deb.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true && \
    find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) \
    -exec sed -i 's|security.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true

# 安装系统级依赖
# - python3: 运行 pyulog 飞行日志解析脚本
# - python3-pip: 安装 pyulog
# - make g++: node-gyp 编译工具（sharp 预编译下载失败时的 fallback）
# - libvips-dev: sharp 源码编译所需（fallback，确保构建不因网络问题失败）
# 注意：ca-certificates 在 node:20-bookworm-slim 基础镜像中已包含，无需重复安装
# 使用 BuildKit 缓存挂载 /var/cache/apt 和 /var/lib/apt，即使 --no-cache 也能复用已下载的包
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-pip make g++ libvips-dev

# 配置 pip 阿里云镜像并安装 pyulog
RUN python3 -m pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && python3 -m pip install --break-system-packages --no-cache-dir pyulog

# ═══════════════════════════════════════════════════════════════
# 3. Node.js 依赖安装（利用 Docker 缓存 + BuildKit npm 缓存挂载）
# ═══════════════════════════════════════════════════════════════
WORKDIR /app

ENV NODE_ENV=production
ENV LOCAL_MODEL_PATH=/app/models

# 先复制 package.json + package-lock.json，充分利用缓存层
COPY backend/package*.json ./

# 使用 npm install --omit=dev，兼容 package-lock 与 package.json 临时不同步的服务器热修场景
# - 只安装生产依赖
# - 使用 BuildKit 缓存挂载 /root/.npm，跨构建复用 npm 缓存，即使 --no-cache 也能大幅加速
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --omit=dev

# 验证 sharp 安装：确保 vips 版本可读取
RUN node -e "const s = require('sharp'); const vips = s.versions.vips || s.versions.libvips; console.log('[Dockerfile] sharp version:', s.versions.sharp, '| vips version:', vips); if (!vips) { console.error('[Dockerfile] ERROR: vips version not detected.'); process.exit(1); }"

# ═══════════════════════════════════════════════════════════════
# 4. 应用代码（变更最频繁，放在最后以最大化缓存命中）
# ═══════════════════════════════════════════════════════════════
COPY backend/src ./src
COPY backend/shared ./shared
COPY data ./data
COPY backend/models ./models

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
