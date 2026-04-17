#!/bin/bash
# 供应链系统数据库自动备份脚本
# 功能：备份数据库、验证完整性、清理旧备份、异地同步

set -e

# 配置
DB_PATH="/var/www/SupplyChainSystem/backend/data/supply_chain.db"
BACKUP_DIR="/var/www/SupplyChainSystem/backend/backups"
LOG_FILE="/var/log/supplychain-backup.log"
RETENTION_DAYS=30
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="supply_chain_${DATE}.db"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# NAS 配置（可选，如果配置了NAS则自动同步）
NAS_MOUNT="/mnt/nas/backup/supplychain"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 发送告警函数（可以通过 webhook、邮件等方式）
alert() {
    local message="$1"
    log "ALERT: $message"
    # 这里可以添加 webhook 或邮件通知
    # curl -X POST "YOUR_WEBHOOK_URL" -d "message=$message"
}

log "========================================"
log "开始数据库备份任务"
log "========================================"

# 检查数据库文件是否存在
if [ ! -f "$DB_PATH" ]; then
    log "错误：数据库文件不存在: $DB_PATH"
    alert "数据库备份失败：数据库文件不存在"
    exit 1
fi

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

# 1. 创建备份（使用 SQLite 的在线备份功能，确保数据一致性）
log "正在创建备份: $BACKUP_NAME"
if sqlite3 "$DB_PATH" ".backup '${BACKUP_PATH}'"; then
    log "备份文件创建成功: $BACKUP_PATH"
else
    log "错误：备份创建失败"
    alert "数据库备份失败：无法创建备份文件"
    exit 1
fi

# 2. 验证备份完整性
log "正在验证备份完整性..."
if sqlite3 "$BACKUP_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    log "备份完整性验证通过"
else
    log "错误：备份完整性验证失败"
    rm -f "$BACKUP_PATH"
    alert "数据库备份失败：备份文件完整性验证失败"
    exit 1
fi

# 3. 检查备份文件大小（确保不为空）
BACKUP_SIZE=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null || echo "0")
if [ "$BACKUP_SIZE" -lt 1024 ]; then
    log "错误：备份文件过小 (${BACKUP_SIZE} bytes)，可能损坏"
    rm -f "$BACKUP_PATH"
    alert "数据库备份失败：备份文件异常"
    exit 1
fi

log "备份文件大小: $(du -h "$BACKUP_PATH" | cut -f1)"

# 4. 清理旧备份（保留最近 $RETENTION_DAYS 天）
log "清理旧备份文件（保留最近 ${RETENTION_DAYS} 天）..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "supply_chain_*.db" -mtime +${RETENTION_DAYS} -type f -delete -print | wc -l)
log "已清理 ${DELETED_COUNT} 个旧备份文件"

# 5. 同步到 NAS（如果已挂载）
if [ -d "$NAS_MOUNT" ]; then
    log "正在同步到 NAS..."
    if cp "$BACKUP_PATH" "${NAS_MOUNT}/${BACKUP_NAME}"; then
        log "NAS 同步成功"
        # 清理 NAS 上的旧备份
        find "$NAS_MOUNT" -name "supply_chain_*.db" -mtime +${RETENTION_DAYS} -type f -delete
    else
        log "警告：NAS 同步失败"
        alert "数据库备份警告：NAS 同步失败"
    fi
else
    log "NAS 未挂载，跳过异地备份"
fi

# 6. 记录备份信息
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "supply_chain_*.db" -type f | wc -l)
log "当前备份总数: $BACKUP_COUNT"
log "备份任务完成: $BACKUP_NAME"

log "========================================"
