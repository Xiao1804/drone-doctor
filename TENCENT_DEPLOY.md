# DroneDoctor Tencent Cloud Deployment

This deployment runs the whole app on one Tencent Cloud Lighthouse/CVM server:

- Caddy terminates HTTPS and proxies `/api/*` and `/health` directly to the backend.
- Nginx in the frontend container serves the compiled React application.
- PostgreSQL runs in Docker with a persistent volume.

The public entrypoint is:

```text
https://wurenjiyisheng.com
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
- `443`: HTTPS

For a mainland China server, complete ICP filing before expecting the public domain to serve traffic. A DNSPod/Tencent Cloud interception page means the request did not reach Caddy.

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

Set the production browser origins explicitly:

```env
ALLOWED_ORIGINS=https://wurenjiyisheng.com,https://www.wurenjiyisheng.com
```

## 5. Start The App

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d --build
```

Check status:

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml ps
docker compose --env-file .env.tencent -f docker-compose.tencent.yml logs -f backend
```

Local health check on the server, preserving the production Host and TLS routing:

```bash
curl --resolve wurenjiyisheng.com:443:127.0.0.1 https://wurenjiyisheng.com/health
```

Public checks:

```text
https://wurenjiyisheng.com
https://wurenjiyisheng.com/health
```

## 6. Update After Code Changes

> **推荐方式：CDN 逐文件下载**（国内服务器 git pull 几乎必失败）
>
> 在本地 `git push` 后，用 commit hash 通过 jsdelivr CDN 下载改动文件：
> ```bash
> cd /root/drone-doctor
> curl -sL -o <本地路径> "https://cdn.jsdelivr.net/gh/Xiao1804/drone-doctor@<commit-hash>/<路径>"
> ```
> 下载完成后验证文件头（`head -3 <file>`），确认内容正确再构建。

```bash
cd /root/drone-doctor
docker compose --env-file .env.tencent -f docker-compose.tencent.yml build backend frontend
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d
```

> **⚠️ 不要使用 `--no-cache`**：sharp 的 libvips 二进制需要从 GitHub 下载，国内服务器会超时（6000+秒后失败）。保留 Docker 缓存层可复用已编译的 sharp。

> **备选方式：git pull**（经常失败，仅作备用）
> ```bash
> # 方案 1：关闭 SSL 验证
> GIT_SSL_NO_VERIFY=1 git pull origin main
>
> # 方案 2：切 HTTP/1.1
> git config --global http.version HTTP/1.1
> git config --global http.postBuffer 524288000
> git pull origin main
> ```

> **`backend/models/` 目录**：embedding 模型文件（~24MB）被 `.gitignore` 排除，`git pull` 不会更新。首次部署需从运行中的容器复制：
> ```bash
> docker cp drone-doctor-backend-1:/app/models backend/
> ```
> 恢复一次后永久有效（docker compose build 会 COPY 进镜像）。

## 7. Database Backup

Install the checked-in backup script and schedule it:

```bash
sudo install -m 700 ops/backup/backup-db.sh /root/backup-db.sh
sudo mkdir -p -m 700 /root/backups
(sudo crontab -l 2>/dev/null; echo '0 3 * * * /root/backup-db.sh >> /root/backups/backup.log 2>&1') \
  | sort -u | sudo crontab -
sudo /root/backup-db.sh
latest_backup="$(sudo find /root/backups -maxdepth 1 -name 'db_*.dump' -printf '%T@ %p\n' \
  | sort -nr | head -1 | cut -d' ' -f2-)"
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  pg_restore --list < "$latest_backup" > /dev/null
```

Restore example. Stop the backend first, then restore into the target database with
failure-on-first-error semantics:

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml stop backend
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  sh -lc 'pg_restore --clean --if-exists --exit-on-error --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < /root/backups/db_YYYYMMDD_HHMMSS.dump
docker compose --env-file .env.tencent -f docker-compose.tencent.yml start backend
```

Before relying on backups, run a restore drill into a temporary database:

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  sh -lc 'dropdb --if-exists -U "$POSTGRES_USER" drone_doctor_restore_test &&
    createdb -U "$POSTGRES_USER" drone_doctor_restore_test'
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  sh -lc 'pg_restore --exit-on-error --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d drone_doctor_restore_test' \
  < "$latest_backup"
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d drone_doctor_restore_test -Atc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';"'
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres \
  sh -lc 'dropdb -U "$POSTGRES_USER" drone_doctor_restore_test'
```

## 8. SSH Hardening

Keep one verified key-based SSH session open while applying this change:

```bash
sudo install -m 644 ops/ssh/00-drone-doctor-hardening.conf \
  /etc/ssh/sshd_config.d/00-drone-doctor-hardening.conf
sudo sshd -t
sudo systemctl reload ssh
sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|pubkeyauthentication'
```

Open a second terminal and prove key login still works before closing the first session.

## Notes

- Do not commit `.env.tencent`.
- Ports 80 and 443 must be available to Caddy.
- Docker logs are limited per container to three 10 MB files by `docker-compose.tencent.yml`.
