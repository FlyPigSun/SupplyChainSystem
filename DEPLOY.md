# 部署说明

> 服务器：47.116.200.214
> 部署路径：`/var/www/SupplyChainSystem/`

## 环境准备

```bash
# 1. 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# 2. 安装 Nginx
apt-get install -y nginx

# 3. 安装 PM2（进程管理）
npm install -g pm2

# 4. 克隆代码
git clone git@github.com:FlyPigSun/SupplyChainSystem.git /var/www/SupplyChainSystem
```

## 首次部署

### 1. 后端配置

```bash
cd /var/www/SupplyChainSystem/backend

# 安装依赖
npm install --production

# 配置环境变量
cp .env.example .env
# 编辑 .env，设置 JWT_SECRET（必填）
# JWT_SECRET=your-secret-key
# PORT=3000
# CORS_ORIGINS=localhost:8080
```

### 2. 前端构建

```bash
cd /var/www/SupplyChainSystem/frontend
npm install
npm run build
```

### 3. Nginx 配置

创建 `/etc/nginx/sites-available/supplychain`：

```nginx
server {
    listen 80;
    server_name 47.116.200.214;

    location /SupplyChainSystem/ {
        alias /var/www/SupplyChainSystem/frontend/dist/;
        index index.html;
        try_files $uri $uri/ /SupplyChainSystem/index.html;

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires -1;
            add_header Cache-Control 'no-store, no-cache, must-revalidate';
        }
    }

    location /SupplyChainSystem/api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50m;
    }
}
```

启用配置：

```bash
ln -s /etc/nginx/sites-available/supplychain /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 4. 启动服务

```bash
cd /var/www/SupplyChainSystem
bash backend/scripts/restart.sh
```

## 日常更新流程

**核心原则：所有代码更新必须通过 Git，禁止直接修改服务器文件。**

### 完整更新（后端 + 前端）

```bash
# 1. 本地修改并推送
 git add -A
 git commit -m "feat: xxx"
 git push origin master

# 2. 服务器拉取 + 后端重启 + 前端构建
ssh root@47.116.200.214 "
  cd /var/www/SupplyChainSystem && \
  git pull origin master && \
  bash backend/scripts/restart.sh && \
  cd frontend && npm run build
"
```

### 仅后端更新

```bash
 git push origin master
ssh root@47.116.200.214 "bash /var/www/SupplyChainSystem/backend/scripts/restart.sh"
```

### 仅前端更新

```bash
 git push origin master
ssh root@47.116.200.214 "cd /var/www/SupplyChainSystem/frontend && npm run build"
```

## 后端重启脚本

`backend/scripts/restart.sh` 功能：

1. 停止旧进程（释放端口 3000）
2. 拉取最新代码（已提前执行）
3. 安装依赖（如有变化）
4. 启动新进程（PM2 或 nohup）
5. 健康检查（HTTP 401 视为正常，因为无 token）

```bash
# 一键重启
ssh root@47.116.200.214 "bash /var/www/SupplyChainSystem/backend/scripts/restart.sh"
```

## 数据备份

### 自动备份

- 定时任务：每天凌晨 2:00
- 脚本：`backend/scripts/backup.sh`
- 保留：30 天
- 存储：`backend/backups/`
- 日志：`/var/log/supplychain-backup.log`

### 手动备份

```bash
ssh root@47.116.200.214 "bash /var/www/SupplyChainSystem/backend/scripts/backup.sh"
```

### 恢复备份

1. 进入系统「备份管理」页面
2. 选择备份文件点击「恢复」
3. 或通过命令行：

```bash
# 停止后端服务
# 复制备份文件覆盖数据库
cp /var/www/SupplyChainSystem/backend/backups/supply_chain_YYYY-MM-DD_HH-MM-SS.db \
   /var/www/SupplyChainSystem/backend/data/supply_chain.db
# 重启后端服务
bash /var/www/SupplyChainSystem/backend/scripts/restart.sh
```

## 健康检查

- 定时任务：每 6 小时
- 脚本：`backend/scripts/health-check.sh`
- 日志：`/var/log/supplychain-health.log`

## 故障排查

### 后端无法启动

```bash
# 检查端口占用
lsof -i :3000

# 查看日志
cat /var/log/supplychain-app.log

# 手动启动测试
cd /var/www/SupplyChainSystem/backend && node src/app.js
```

### 前端 404

```bash
# 检查构建产物
ls /var/www/SupplyChainSystem/frontend/dist/

# 重新构建
cd /var/www/SupplyChainSystem/frontend && npm run build
```

### 数据库锁定

```bash
# 检查 WAL 文件
ls -la /var/www/SupplyChainSystem/backend/data/supply_chain.db*

# 如有问题，强制检查点
sqlite3 /var/www/SupplyChainSystem/backend/data/supply_chain.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### 进程守护异常

launchd 重启后可能报退出码 78 启动失败，需用 `nohup` 手动启动：

```bash
cd /var/www/SupplyChainSystem/backend && nohup node src/app.js > /var/log/supplychain-app.log 2>&1 &
```
