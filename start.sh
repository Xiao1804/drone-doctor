#!/bin/bash

echo "========================================="
echo "DroneDoctor - 无人机AI诊断平台"
echo "========================================="
echo ""

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未检测到Node.js，请先安装Node.js 18或更高版本"
    exit 1
fi

echo "Node.js版本: $(node -v)"
echo ""

# 安装后端依赖
echo "1. 安装后端依赖..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "后端依赖已安装，跳过"
fi
cd ..

# 安装前端依赖
echo ""
echo "2. 安装前端依赖..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "前端依赖已安装，跳过"
fi
cd ..

echo ""
echo "========================================="
echo "安装完成！"
echo "========================================="
echo ""
echo "启动方式："
echo "1. 启动后端: cd backend && npm run dev"
echo "2. 启动前端: cd frontend && npm run dev"
echo ""
echo "访问地址: http://localhost:5173"
echo ""
