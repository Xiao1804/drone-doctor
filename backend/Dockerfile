FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV LOCAL_MODEL_PATH=/app/models

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY data ./data
COPY models ./models

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "start"]
