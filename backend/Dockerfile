FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates libvips-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV LOCAL_MODEL_PATH=/app/models

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY data ./data
COPY models ./models

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
