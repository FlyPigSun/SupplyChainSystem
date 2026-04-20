#!/bin/bash
# 供应链系统后端服务重启脚本
# 用法: ./restart.sh [--force]

set -e

# 配置
APP_DIR="/var/www/SupplyChainSystem/backend"
APP_ENTRY="src/app.js"
PORT=3000
LOG_FILE="/var/log/supplychain-app.log"
JWT_SECRET="supply_chain_secret_2024"

echo "=========================================="
echo "  供应链系统后端服务重启"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

cd "$APP_DIR"

# 1. 停止旧进程
echo "[1/5] 停止旧进程..."
OLD_PIDS=$(lsof -t -i:$PORT 2>/dev/null || true)
if [ -n "$OLD_PIDS" ]; then
    echo "      发现端口 $PORT 被占用，PID: $OLD_PIDS"
    kill $OLD_PIDS 2>/dev/null || true
    
    # 等待进程退出（最多10秒）
    for i in {1..10}; do
        if ! lsof -i:$PORT >/dev/null 2>&1; then
            echo "      端口已释放"
            break
        fi
        echo "      等待端口释放... ($i/10)"
        sleep 1
    done
    
    # 强制杀死残留进程
    if lsof -i:$PORT >/dev/null 2>&1; then
        echo "      强制终止进程..."
        kill -9 $(lsof -t -i:$PORT) 2>/dev/null || true
        sleep 1
    fi
else
    echo "      端口 $PORT 未被占用"
fi

# 2. 拉取最新代码
echo "[2/5] 拉取最新代码..."
cd /var/www/SupplyChainSystem
git checkout -- . 2>/dev/null || true
git pull origin master 2>&1 | grep -E "(Updating|Fast-forward|Already up)" || echo "      代码已是最新"
cd "$APP_DIR"

# 3. 启动新进程
echo "[3/5] 启动新进程..."
export JWT_SECRET="$JWT_SECRET"
nohup node $APP_ENTRY >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "      新进程 PID: $NEW_PID"

# 4. 等待服务就绪
echo "[4/5] 等待服务就绪..."
READY=0
for i in {1..15}; do
    sleep 1
    if lsof -i:$PORT >/dev/null 2>&1; then
        READY=1
        echo "      服务已启动 (等待 ${i}s)"
        break
    fi
    echo "      等待服务启动... ($i/15)"
done

if [ $READY -eq 0 ]; then
    echo "      ❌ 服务启动失败！"
    echo "      查看日志: tail -50 $LOG_FILE"
    exit 1
fi

# 5. 健康检查
echo "[5/5] 健康检查..."
sleep 2
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/product-labels?limit=1" 2>/dev/null || echo "000")

if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "200" ]; then
    echo "      ✅ 服务正常响应 (HTTP $RESPONSE)"
else
    echo "      ⚠️  服务响应异常 (HTTP $RESPONSE)"
    echo "      查看日志: tail -50 $LOG_FILE"
fi

echo ""
echo "=========================================="
echo "  重启完成"
echo "  PID: $NEW_PID"
echo "  日志: $LOG_FILE"
echo "=========================================="
