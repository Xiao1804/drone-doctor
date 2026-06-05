# Docker 构建优化总结

## 优化目标
将 backend 镜像构建时间从 600+ 秒降低至 120 秒以内，解决 `libvips-dev` 安装超时及 pip 下载超时问题。

## 优化措施

### 1. Dockerfile 层分离与缓存优化 (`backend/Dockerfile`)

#### 国内镜像配置前置
将所有国内镜像配置放在 Dockerfile 最前面，确保后续所有安装命令都能使用：
- `npm_config_registry=https://registry.npmmirror.com` — npm 淘宝镜像
- `SHARP_DIST_BASE_URL=https://npmmirror.com/mirrors/sharp-libvips/v8.14.5/` — sharp libvips 预编译二进制镜像（优先级最高）
- 备用配置：`npm_config_sharp_libvips_binary_host` / `SHARP_LIBVIPS_BINARY_HOST`

#### BuildKit 缓存挂载
使用 `# syntax=docker/dockerfile:1` 启用 BuildKit，配合 `--mount=type=cache`：
- **apt 缓存挂载**：`--mount=type=cache,target=/var/cache/apt` 和 `/var/lib/apt`
  - 即使 `docker build --no-cache`，apt 包下载缓存仍然保留
  - `apt-get update` 在缓存存在时几乎瞬时完成
- **npm 缓存挂载**：`--mount=type=cache,target=/root/.npm`
  - 跨构建复用 npm 下载缓存
  - `npm ci` 在缓存命中时无需重新下载包

#### 精简 apt 包
- 移除 `ca-certificates`（`node:20-bookworm-slim` 基础镜像已包含）
- 保留 `libvips-dev`、`make`、`g++` 作为 sharp 预编译下载失败时的安全 fallback

#### 分离 apt 与 pip 安装
将 apt install 和 pip install 拆分为独立的 RUN 层：
- 系统依赖变更频率低，可被长期缓存
- pip 安装独立缓存，互不影响

#### `npm ci` 替代 `npm install --omit=dev`
- 严格遵循 `package-lock.json`，安装更快、行为更可预测
- 自动忽略 devDependencies

### 2. 构建上下文优化 (`.dockerignore`)

新增排除项，减小构建上下文体积：
- `frontend/` — backend 构建不需要前端代码
- `docs/` — 文档不需要进入镜像

### 3. docker-compose 保持简洁

移除可能有兼容性问题的 `cache_from` / `cache_to` 配置，依赖 BuildKit 默认启用的内联缓存和 Dockerfile 中的缓存挂载。

## 部署命令

### 首次构建（无缓存）

```bash
cd /root/drone-doctor

# 确保代码已同步（git pull 或文件上传）
git pull

# 使用 BuildKit 构建（Docker 24.0+ 默认启用）
DOCKER_BUILDKIT=1 docker compose -f docker-compose.tencent.yml build --no-cache backend

# 或者完整重建所有服务
DOCKER_BUILDKIT=1 docker compose -f docker-compose.tencent.yml up -d --build
```

### 验证构建时间

```bash
# 记录构建时间
time DOCKER_BUILDKIT=1 docker compose -f docker-compose.tencent.yml build --no-cache backend
```

### 验证 sharp 预编译二进制下载

```bash
# 进入容器检查 sharp 是否正确安装（不是从源码编译的）
docker exec drone-doctor-backend-1 node -e "const sharp = require('sharp'); console.log('sharp version:', sharp.versions.sharp); console.log('libvips version:', sharp.versions.libvips);"
```

如果输出类似：
```
sharp version: 0.32.6
libvips version: 8.14.5
```
说明 sharp 使用的是预编译二进制（正常）。

如果 `libvips version` 缺失或报错，说明 sharp 可能从源码编译，需要进一步排查网络问题。

## 预期效果

| 场景 | 优化前 | 优化后 |
|---|---|---|
| 缓存命中构建 | ~10-30s | ~5-15s |
| `--no-cache` 构建 | 600+s（libvips-dev 安装/编译超时） | 60-120s |
| apt 安装 | ~60-120s（源慢） | ~15-30s（阿里云源 + 缓存挂载） |
| npm install | ~60-180s（源慢） | ~30-60s（淘宝源 + 缓存挂载） |
| sharp 安装 | ~300-600s（GitHub 下载超时 → 源码编译） | ~10-30s（npmmirror 预编译二进制） |

## 关键文件变更

- `backend/Dockerfile` — 全面重写，启用 BuildKit 语法，添加缓存挂载，优化层分离
- `.dockerignore` — 添加 `frontend/`、`docs/` 排除
