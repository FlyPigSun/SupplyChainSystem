#!/bin/bash
# 供应链产品管理系统启动脚本（带进程守护）

cd "$(dirname "$0")"

PROJECT_DIR="$(pwd)"
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

echo "========================================"
echo "  供应链产品管理系统"
echo "========================================"
echo ""

# 清理旧进程
stop_old() {
  if [ -f "$PID_DIR/backend.pid" ]; then
    OLD_PID=$(cat "$PID_DIR/backend.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "停止旧后端进程 (PID: $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null
    fi
    rm -f "$PID_DIR/backend.pid"
  fi
  if [ -f "$PID_DIR/frontend.pid" ]; then
    OLD_PID=$(cat "$PID_DIR/frontend.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "停止旧前端进程 (PID: $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null
    fi
    rm -f "$PID_DIR/frontend.pid"
  fi
  # 也杀掉可能残留的进程
  pkill -f "node.*SupplyChainSystem/backend" 2>/dev/null
  pkill -f "vite.*SupplyChainSystem/frontend" 2>/dev/null
  sleep 1
}

# 启动后端
start_backend() {
  echo "[1/2] 启动后端服务..."
  cd "$PROJECT_DIR/backend"
  nohup node src/app.js > "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > "$PID_DIR/backend.pid"
  
  # 等待后端启动
  for i in $(seq 1 10); do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
      echo "  ✓ 后端已启动 (PID: $BACKEND_PID)"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ 后端启动失败，查看日志: $LOG_DIR/backend.log"
  return 1
}

# 启动前端
start_frontend() {
  echo "[2/2] 启动前端服务..."
  cd "$PROJECT_DIR/frontend"
  nohup npx vite --host 0.0.0.0 > "$LOG_DIR/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  echo "$FRONTEND_PID" > "$PID_DIR/frontend.pid"
  
  # 等待前端启动
  for i in $(seq 1 10); do
    if curl -s http://localhost:8080 > /dev/null 2>&1; then
      echo "  ✓ 前端已启动 (PID: $FRONTEND_PID)"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ 前端启动失败，查看日志: $LOG_DIR/frontend.log"
  return 1
}

# 守护进程：监控并自动重启
daemon() {
  echo ""
  echo "守护进程已启动，监控服务运行状态..."
  echo "按 Ctrl+C 停止所有服务"
  echo ""
  
  while true; do
    # 检查后端
    if [ -f "$PID_DIR/backend.pid" ]; then
      BACKEND_PID=$(cat "$PID_DIR/backend.pid")
      if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[$(date '+%H:%M:%S')] 后端进程已退出，正在重启..."
        start_backend
      fi
    fi
    
    # 检查前端
    if [ -f "$PID_DIR/frontend.pid" ]; then
      FRONTEND_PID=$(cat "$PID_DIR/frontend.pid")
      if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "[$(date '+%H:%M:%S')] 前端进程已退出，正在重启..."
        start_frontend
      fi
    fi
    
    sleep 5
  done
}

# 优雅退出
cleanup() {
  echo ""
  echo "正在停止服务..."
  if [ -f "$PID_DIR/backend.pid" ]; then
    kill "$(cat "$PID_DIR/backend.pid")" 2>/dev/null
  fi
  if [ -f "$PID_DIR/frontend.pid" ]; then
    kill "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null
  fi
  rm -f "$PID_DIR"/*.pid
  echo "服务已停止"
  exit 0
}

trap cleanup SIGINT SIGTERM

# 主流程
stop_old
start_backend
start_frontend

# 获取局域网IP
LAN_IP=$(ifconfig | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}')

echo ""
echo "========================================"
echo "  访问地址"
echo "  本机: http://localhost:8080"
if [ -n "$LAN_IP" ]; then
  echo "  局域网: http://$LAN_IP:8080"
fi
echo "  账号: yangbin / yangbin"
echo "========================================"

# 启动守护
daemon
