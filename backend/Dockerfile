FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ ca-certificates libvips-dev \
  && python3 -m pip install --break-system-packages --no-cache-dir pyulog \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV LOCAL_MODEL_PATH=/app/models
ENV npm_config_sharp_libvips_binary_host_mirror=https://npmmirror.com/mirrors/sharp-libvips

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY data ./data
COPY backend/models ./models

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
