#!/bin/bash
# v2.1 知识库体系部署脚本
# 用法: ssh root@81.71.39.150 'bash -s' < update-server-v21.sh

set -e

PROJECT_DIR="/root/drone-doctor"
COMMIT_HASH="98f0a42f2e4daf80d29654ee13961b59d525ae75"
GITHUB_USER="Xiao1804"
REPO="drone-doctor"

echo "🚀 v2.1 知识库体系部署"
echo "========================"
echo "Commit: $COMMIT_HASH"
echo ""

cd "$PROJECT_DIR"

# ============================================================
# 1. 下载 v2.1 文件
# ============================================================
echo "📥 下载 v2.1 文件..."

download_file() {
  local src="$1"
  local dst="$2"
  echo "  ↓ $dst"
  curl -sL -o "$dst" "https://cdn.jsdelivr.net/gh/$GITHUB_USER/$REPO@$COMMIT_HASH/$src"
  if [ ! -s "$dst" ]; then
    echo "  ❌ 下载失败"
    return 1
  fi
}

# 核心迁移文件
download_file "backend/migrations/1782505200000_knowledge_v21_migration.js" "backend/migrations/1782505200000_knowledge_v21_migration.js"
download_file "backend/migrations/1782591600000_transitional_dual_write.js" "backend/migrations/1782591600000_transitional_dual_write.js"
download_file "backend/src/services/embeddingService.js" "backend/src/services/embeddingService.js"

# 首批20篇知识文章
mkdir -p data/knowledge-articles/v2.1
for file in \
  "data/knowledge-articles/v2.1/A10-01-001_无人机无法开机.md" \
  "data/knowledge-articles/v2.1/A10-02-001_无人机无法起飞.md" \
  "data/knowledge-articles/v2.1/A10-02-002_无人机无法起飞案例.md" \
  "data/knowledge-articles/v2.1/A10-03-001_飞行中掉高.md" \
  "data/knowledge-articles/v2.1/A10-03-002_飞行中漂移.md" \
  "data/knowledge-articles/v2.1/A10-03-003_飞行中震动.md" \
  "data/knowledge-articles/v2.1/A10-04-001_电机不转.md" \
  "data/knowledge-articles/v2.1/A10-04-002_电机不转案例.md" \
  "data/knowledge-articles/v2.1/A10-04-003_电机异响.md" \
  "data/knowledge-articles/v2.1/A10-05-001_电池鼓包.md" \
  "data/knowledge-articles/v2.1/A10-06-001_云台卡住.md" \
  "data/knowledge-articles/v2.1/A10-06-002_云台卡住案例.md" \
  "data/knowledge-articles/v2.1/A10-07-001_机臂更换.md" \
  "data/knowledge-articles/v2.1/A10-08-001_GPS信号弱.md" \
  "data/knowledge-articles/v2.1/A10-08-002_GPS信号弱案例.md" \
  "data/knowledge-articles/v2.1/A10-09-001_图传黑屏.md" \
  "data/knowledge-articles/v2.1/A10-09-002_图传黑屏案例.md" \
  "data/knowledge-articles/v2.1/A10-10-001_相机不对焦.md" \
  "data/knowledge-articles/v2.1/A10-11-001_进水急救.md" \
  "data/knowledge-articles/v2.1/A10-12-001_炸机评估.md"
do
  download_file "$file" "$file" 2>/dev/null || true
done

echo "✅ 文件下载完成"
echo ""

# ============================================================
# 2. 备份数据库
# ============================================================
echo "📦 备份现有数据库..."
BACKUP_FILE="/tmp/drone_doctor_backup_$(date +%Y%m%d_%H%M%S).sql"
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres pg_dump -U drone_doctor drone_doctor > "$BACKUP_FILE"
echo "✅ 数据库已备份到: $BACKUP_FILE"
echo ""

# ============================================================
# 3. 运行 v2.1 数据库迁移
# ============================================================
echo "🔄 运行 v2.1 知识库迁移..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T backend npm run migrate
echo "✅ 迁移完成"
echo ""

# ============================================================
# 4. 验证迁移结果
# ============================================================
echo "🔍 验证迁移结果..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres psql -U drone_doctor drone_doctor -c "\dt" 2>/dev/null | grep -E "(knowledge_|pgmigrations)" || true
echo ""

# ============================================================
# 5. 构建并重启服务
# ============================================================
echo "🔄 构建服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml build backend
echo "✅ 构建完成"
echo ""

echo "🔄 重启服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d
echo "✅ 服务已重启"
echo ""

# ============================================================
# 6. 等待服务健康
# ============================================================
echo "⏳ 等待服务健康..."
sleep 15
echo ""

# ============================================================
# 7. 健康检查
# ============================================================
echo "🧪 健康检查..."
if curl -s http://127.0.0.1/health > /dev/null 2>&1; then
  echo "✅ 服务健康检查通过"
else
  echo "⚠️ 健康检查失败，查看日志:"
  docker compose --env-file .env.tencent -f docker-compose.tencent.yml logs --tail=30 backend
fi
echo ""

echo "🎉 v2.1 知识库体系部署完成!"
echo "================================="
echo "访问: http://81.71.39.150"
echo ""
echo "部署内容:"
echo "  ✅ 新增 ENUM 类型 (knowledge_layer, confidence_level 等)"
echo "  ✅ 新增 9 个数据表 (knowledge_articles, knowledge_chunks 等)"
echo "  ✅ 数据迁移 (fault_case_embeddings → 新表)"
echo "  ✅ 创建索引 (向量索引 + 治理索引)"
echo "  ✅ 双写过渡期 (兼容旧表查询)"
echo "  ✅ embedding服务升级 (v2.1 chunk功能)"
echo "  ✅ 首批20篇知识文章已上传"
echo ""
