#!/bin/bash
# NAS 异地备份配置脚本
# 使用前请填写以下配置

# ==================== 用户配置区域 ====================
# 极空间 NAS IP 地址（内网或公网）
NAS_IP=""

# NFS 共享路径（在极空间中配置的共享文件夹路径）
# 例如：/volume1/backup 或 /mnt/nas/backup
NFS_SHARE=""

# 可选：备用备份方式 - 使用 scp 同步到另一台服务器
# BACKUP_SERVER="user@backup-server-ip"
# BACKUP_SERVER_PATH="/path/to/backup"
# =====================================================

LOCAL_MOUNT_POINT="/mnt/nas/backup/supplychain"

# 颜色输出
red() { echo -e "\033[31m$1\033[0m"; }
green() { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }

# 检查配置
if [ -z "$NAS_IP" ] || [ -z "$NFS_SHARE" ]; then
    yellow "================================================"
    yellow "请先在脚本中配置 NAS_IP 和 NFS_SHARE 变量"
    yellow "================================================"
    echo ""
    echo "配置步骤："
    echo "1. 在极空间 NAS 中开启 NFS 服务"
    echo "2. 创建一个共享文件夹（如 'backup'）"
    echo "3. 在该文件夹的 NFS 权限中添加服务器 IP"
    echo "4. 修改本脚本顶部的 NAS_IP 和 NFS_SHARE 变量"
    echo ""
    echo "示例配置："
    echo "  NAS_IP=\"192.168.1.100\""
    echo "  NFS_SHARE=\"/volume1/backup\""
    exit 1
fi

echo "正在配置 NAS 异地备份..."

# 创建挂载点
mkdir -p "$LOCAL_MOUNT_POINT"

# 测试 NFS 连接
echo "测试 NFS 连接: ${NAS_IP}:${NFS_SHARE}"
if ! showmount -e "$NAS_IP" > /dev/null 2>&1; then
    red "无法连接到 NAS NFS 服务，请检查："
    red "  1. NAS IP 地址是否正确"
    red "  2. NAS 是否开启了 NFS 服务"
    red "  3. 服务器 IP 是否有 NFS 访问权限"
    exit 1
fi

# 添加到 /etc/fstab 实现开机自动挂载
FSTAB_ENTRY="${NAS_IP}:${NFS_SHARE} ${LOCAL_MOUNT_POINT} nfs defaults,_netdev 0 0"

if grep -q "$LOCAL_MOUNT_POINT" /etc/fstab; then
    yellow "挂载点已存在于 fstab，更新配置..."
    sed -i "s|.*${LOCAL_MOUNT_POINT}.*|$FSTAB_ENTRY|" /etc/fstab
else
    echo "$FSTAB_ENTRY" >> /etc/fstab
    green "已添加到 /etc/fstab"
fi

# 立即挂载
if mount "$LOCAL_MOUNT_POINT" 2>/dev/null || mount -a; then
    green "NAS 挂载成功！"
    df -h "$LOCAL_MOUNT_POINT"
else
    red "挂载失败，请检查配置"
    exit 1
fi

# 测试写入
echo "测试写入权限..."
if touch "${LOCAL_MOUNT_POINT}/.write_test" 2>/dev/null; then
    rm "${LOCAL_MOUNT_POINT}/.write_test"
    green "写入测试通过！"
else
    red "无法写入 NAS，请检查权限配置"
    exit 1
fi

# 创建备份子目录
mkdir -p "${LOCAL_MOUNT_POINT}/supplychain"

green "================================================"
green "NAS 异地备份配置完成！"
green "================================================"
echo ""
echo "备份流程："
echo "  每天凌晨 2 点自动备份数据库"
echo "  备份完成后自动同步到 NAS"
echo "  本地和 NAS 各保留最近 30 天的备份"
echo ""
echo "备份位置："
echo "  本地: /var/www/SupplyChainSystem/backend/backups/"
echo "  NAS:  ${LOCAL_MOUNT_POINT}/supplychain/"
