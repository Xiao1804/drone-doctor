#!/bin/bash
# v2.1 知识库体系部署脚本
# 用法: ssh root@81.71.39.150 'bash -s' < deploy-v21.sh

set -e

PROJECT_DIR="/root/drone-doctor"

echo "🚀 v2.1 知识库体系部署"
echo "======================="
echo ""

cd "$PROJECT_DIR"

# ============================================================
# 1. 备份数据库
# ============================================================
echo "📦 备份现有数据库..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres pg_dump -U drone_doctor drone_doctor > /tmp/drone_doctor_backup_$(date +%Y%m%d_%H%M%S).sql
echo "✅ 数据库已备份到 /tmp/"
echo ""

# ============================================================
# 2. 运行 v2.1 数据库迁移
# ============================================================
echo "🔄 运行 v2.1 知识库迁移..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T backend npm run migrate
echo "✅ 迁移完成"
echo ""

# ============================================================
# 3. 验证迁移结果
# ============================================================
echo "🔍 验证迁移结果..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres psql -U drone_doctor drone_doctor -c "\dt" | grep -E "(knowledge_|pgmigrations)" || true
echo ""

# ============================================================
# 4. 重启服务
# ============================================================
echo "🔄 重启服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml restart backend
echo "✅ 服务已重启"
echo ""

# ============================================================
# 5. 等待服务健康
# ============================================================
echo "⏳ 等待服务健康..."
sleep 10
echo ""

# ============================================================
# 6. 健康检查
# ============================================================
echo "🧪 健康检查..."
if curl -s http://127.0.0.1/health > /dev/null; then
  echo "✅ 服务健康检查通过"
else
  echo "⚠️ 健康检查失败，查看日志:"
  docker compose --env-file .env.tencent -f docker-compose.tencent.yml logs --tail=30 backend
fi
echo ""

echo "🎉 v2.1 知识库体系部署完成!"
echo "访问: http://81.71.39.150"
echo ""
echo "下一步: 导入首批20篇知识文章"
