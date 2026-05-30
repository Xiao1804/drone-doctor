# DroneDoctor Tencent Cloud Deployment

This deployment runs the whole app on one Tencent Cloud Lighthouse/CVM server:

- Nginx serves the React frontend.
- Nginx proxies `/api/*` and `/health` to the Node.js backend.
- PostgreSQL runs in Docker with a persistent volume.

The public entrypoint is one address:

```text
http://<your-server-public-ip>
```

## 1. Buy And Prepare A Server

Recommended first server:

- Product: Tencent Cloud Lighthouse or CVM
- Region: Mainland China, such as Guangzhou, Shanghai, Beijing, or Chengdu
- OS: Docker CE application image is preferred. Ubuntu 22.04 LTS or Ubuntu 24.04 LTS also works.
- Size: 2 vCPU / 4 GB RAM recommended, 2 vCPU / 2 GB RAM minimum
- Disk: 40 GB or higher

Open these ports in Tencent Cloud firewall/security group:

- `22`: SSH
- `80`: website HTTP
- `443`: only needed later if you bind a domain and enable HTTPS

If you bind a mainland China domain to the server, complete ICP filing first. For quick testing, use the public IP directly.

## 2. Install Docker

SSH into the server:

```bash
ssh ubuntu@<your-server-public-ip>
```

If you used the Tencent Cloud Docker CE application image, Docker is already installed and the Tencent Cloud Docker mirror is usually configured for you. You can skip to the version check below.

Install Docker and Docker Compose plugin:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and SSH back in so the Docker group takes effect.

On a mainland China server, configure the Tencent Cloud Docker mirror before pulling images:

```bash
sudo mkdir -p /etc/docker
cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

Check Docker:

```bash
docker --version
docker compose version
```

## 3. Upload Or Clone The Project

Using GitHub:

```bash
git clone https://github.com/Xiao1804/drone-doctor.git
cd drone-doctor
```

If the repository is private, upload the project folder with SFTP instead.

## 4. Configure Production Variables

Create the Tencent Cloud environment file:

```bash
cp .env.tencent.example .env.tencent
nano .env.tencent
```

At minimum, replace these values:

```env
POSTGRES_PASSWORD=replace-with-a-long-random-database-password
JWT_SECRET=replace-with-a-long-random-jwt-secret-at-least-32-chars
QWEN_API_KEY=your_qwen_api_key
```

You can generate strong random values on the server:

```bash
openssl rand -hex 32
```

For this Docker deployment, keep `ALLOWED_ORIGINS` empty unless you later expose the backend separately.

## 5. Start The App

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d --build
```

Check status:

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml ps
docker compose --env-file .env.tencent -f docker-compose.tencent.yml logs -f backend
```

Local health check on the server:

```bash
curl http://127.0.0.1/health
```

Public check from your phone or computer:

```text
http://<your-server-public-ip>
http://<your-server-public-ip>/health
```

## 6. Update After Code Changes

```bash
cd drone-doctor
git pull origin main
docker compose --env-file .env.tencent -f docker-compose.tencent.yml build backend frontend
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d
```

> **国内服务器 Git TLS 问题**：腾讯云服务器连 GitHub 经常遇到 `GnuTLS recv error (-110)`。应急方案：
> ```bash
> # 方案 1：关闭 SSL 验证（临时）
> GIT_SSL_NO_VERIFY=1 git pull origin main
>
> # 方案 2：切 HTTP/1.1
> git config --global http.version HTTP/1.1
> git config --global http.postBuffer 524288000
> git pull origin main
>
> # 方案 3：完全不通时，用 jsdelivr CDN 下载单个文件
> curl -o <file> -L "https://cdn.jsdelivr.net/gh/Xiao1804/drone-doctor@main/<path>"
> ```

> **`backend/models/` 目录**：embedding 模型文件（~24MB）被 `.gitignore` 排除，`git pull` 不会更新。首次部署需从运行中的容器复制：
> ```bash
> docker cp drone-doctor-backend-1:/app/models backend/
> ```
> 恢复一次后永久有效（docker compose build 会 COPY 进镜像）。

## 7. Database Backup

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql
```

Restore example:

```bash
cat backup-YYYY-MM-DD.sql | docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

## Notes

- The first registered user becomes admin because the production database starts empty.
- Do not commit `.env.tencent`.
- If port `80` is already used, set `APP_HTTP_PORT=8080` in `.env.tencent`, open port `8080` in Tencent Cloud, and visit `http://<ip>:8080`.
- For HTTPS and a clean domain, bind a filed domain, open `443`, then add a certificate reverse proxy such as Caddy or Certbot/Nginx.
