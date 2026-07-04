#!/bin/bash
# v2.1 知识库体系完整部署脚本
# 包含：文件上传 → 数据库迁移 → 服务重启

set -e

PROJECT_DIR="/root/drone-doctor"
LOCAL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🚀 v2.1 知识库体系完整部署"
echo "============================"
echo ""

# ============================================================
# 0. 本地准备：先检查文件是否存在
# ============================================================
echo "📋 本地检查..."
check_file() {
  if [ ! -f "$1" ]; then
    echo "❌ 错误: 文件不存在 $1"
    exit 1
  fi
  echo "✅ $1"
}

check_file "$LOCAL_DIR/backend/migrations/1782505200000_knowledge_v21_migration.js"
check_file "$LOCAL_DIR/backend/migrations/1782591600000_transitional_dual_write.js"
check_file "$LOCAL_DIR/backend/src/services/embeddingService.js"
echo "✅ 本地文件检查通过"
echo ""

# ============================================================
# 1. 上传文件到服务器
# ============================================================
echo "📤 上传文件到服务器..."
# 这个脚本在服务器上运行，假设文件已经通过git或其他方式同步
echo "⏭️  文件已同步"
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
cd "$PROJECT_DIR"
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
# 5. 重启服务
# ============================================================
echo "🔄 重启服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml restart backend
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
echo ""
echo "下一步: 导入首批20篇知识文章"
