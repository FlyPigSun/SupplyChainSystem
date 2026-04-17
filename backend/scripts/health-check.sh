#!/bin/bash
# 数据库健康检查脚本
# 用于定期检查数据库状态，可配合 cron 使用

set -e

DB_PATH="/var/www/SupplyChainSystem/backend/data/supply_chain.db"
LOG_FILE="/var/log/supplychain-health.log"
ALERT_WEBHOOK=""  # 可配置 webhook URL

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    local message="$1"
    log "ALERT: $message"
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" -d "message=$message" > /dev/null 2>&1 || true
    fi
}

# 检查数据库文件存在性
if [ ! -f "$DB_PATH" ]; then
    log "CRITICAL: 数据库文件不存在!"
    alert "数据库健康检查失败：数据库文件不存在"
    exit 1
fi

# 检查数据库完整性
log "正在检查数据库完整性..."
if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    log "CRITICAL: 数据库完整性检查失败!"
    alert "数据库健康检查失败：完整性检查未通过"
    exit 1
fi

# 检查数据库是否被锁定
log "正在检查数据库锁定状态..."
if lsof "$DB_PATH" > /dev/null 2>&1; then
    log "数据库文件正在被访问（正常）"
else
    log "数据库文件当前无访问"
fi

# 检查 WAL 文件（如果存在）
WAL_FILE="${DB_PATH}-wal"
if [ -f "$WAL_FILE" ]; then
    WAL_SIZE=$(stat -f%z "$WAL_FILE" 2>/dev/null || stat -c%s "$WAL_FILE" 2>/dev/null || echo "0")
    log "WAL 文件大小: ${WAL_SIZE} bytes"
    
    # 如果 WAL 文件超过 100MB，提醒检查点
    if [ "$WAL_SIZE" -gt 104857600 ]; then
        log "WARNING: WAL 文件较大，建议执行检查点"
        sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" || true
    fi
fi

# 获取数据库统计信息
log "获取数据库统计信息..."
TABLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type='table';")
RECORD_COUNT=$(sqlite3 "$DB_PATH" "SELECT sum((SELECT count(*) FROM sqlite_master WHERE type='table' AND name=tbl_name)) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "N/A")
DB_SIZE=$(du -h "$DB_PATH" | cut -f1)

log "数据库状态: 正常"
log "表数量: $TABLE_COUNT"
log "数据库大小: $DB_SIZE"
log "健康检查完成"
