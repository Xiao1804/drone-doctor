FROM node:20-bookworm-slim

# 换国内 apt 源加速（兼容 deb822 格式）
RUN find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) -exec sed -i 's|deb.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true && \
    find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) -exec sed -i 's|security.debian.org|mirrors.aliyun.com|g' {} + 2>/dev/null || true

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ ca-certificates libvips-dev \
  && python3 -m pip install --break-system-packages --no-cache-dir pyulog \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV LOCAL_MODEL_PATH=/app/models
# sharp 使用国内镜像下载 libvips（去掉 _mirror 后缀才是正确变量名）
ENV SHARP_LIBVIPS_BINARY_HOST=https://npmmirror.com/mirrors/sharp-libvips
ENV npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY data ./data
COPY backend/models ./models

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
