# 阿里云服务器部署教程

本文档记录供应链产品管理系统从 GitHub 到阿里云服务器的完整部署流程。

## 一、前置条件

### 本地环境
- macOS / Linux 开发环境
- Git 已安装
- 项目代码已推送到 GitHub

### 服务器环境
- 阿里云 ECS 服务器
- 操作系统：Ubuntu 24.04
- 已安装软件：Node.js 18+、Nginx、Git、PM2

### 检查服务器环境
```bash
ssh root@<服务器IP>
node -v      # Node.js 版本
nginx -v     # Nginx 版本
git --version # Git 版本
pm2 -v       # PM2 版本
```

---

## 二、SSH 密钥配置

### 2.1 本地生成 SSH 密钥

```bash
# 生成密钥（如果已有可跳过）
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_ed25519 -N ""

# 查看公钥
cat ~/.ssh/id_ed25519.pub
```

### 2.2 添加到 GitHub

1. 访问 https://github.com/settings/keys
2. 点击 **New SSH key**
3. Title 填写设备名称（如 `MacBook-Air-2`）
4. Key type 选择 `Authentication Key`
5. 粘贴公钥内容
6. 点击 **Add SSH key**

### 2.3 添加到服务器

**方式 A：手动添加**
```bash
# 登录服务器
ssh root@<服务器IP>

# 创建目录并添加公钥
mkdir -p ~/.ssh
echo "ssh-ed25519 AAAA...你的公钥内容... user@device" >> ~/.ssh/authorized_keys

# 设置权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
exit
```

**方式 B：使用 ssh-copy-id**
```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@<服务器IP>
```

### 2.4 服务器 GitHub 访问配置

服务器需要独立配置 GitHub SSH 密钥：

```bash
# 登录服务器
ssh root@<服务器IP>

# 查看服务器公钥（如果已有）
cat ~/.ssh/id_ed25519.pub

# 如果没有，生成新密钥
ssh-keygen -t ed25519 -C "server@aliyun" -f ~/.ssh/id_ed25519 -N ""
```

将服务器公钥添加到 GitHub（同步骤 2.2），Title 填写 `Aliyun-Server`。

### 2.5 验证连接

```bash
# 本地验证 GitHub
ssh -T git@github.com
# 输出：Hi username! You've successfully authenticated...

# 本地验证服务器
ssh root@<服务器IP>
# 应能无密码登录

# 服务器验证 GitHub
ssh root@<服务器IP> "ssh -T git@github.com"
```

---

## 三、代码部署

### 3.1 克隆代码到服务器

```bash
ssh root@<服务器IP>

# 创建目录
mkdir -p /var/www

# 克隆代码
cd /var/www
git clone git@github.com:<username>/SupplyChainSystem.git

# 进入项目
cd SupplyChainSystem
```

### 3.2 安装依赖

```bash
# 后端依赖
cd backend
npm install

# 前端依赖
cd ../frontend
npm install
```

### 3.3 配置环境变量

```bash
cd /var/www/SupplyChainSystem/backend

# 创建环境变量文件
cat > .env << 'EOF'
JWT_SECRET=your_jwt_secret_here
PORT=3000
CORS_ORIGINS=localhost:8080,<服务器IP>:80
EOF

# 重要：JWT_SECRET 必须设置，否则后端拒绝启动
```

### 3.4 构建前端

```bash
cd /var/www/SupplyChainSystem/frontend
npm run build
# 构建产物在 frontend/dist/ 目录
```

---

## 四、Nginx 配置

### 4.1 创建配置文件

```bash
ssh root@<服务器IP>

# 创建配置
cat > /etc/nginx/sites-available/supplychain << 'EOF'
server {
    listen 80;
    server_name <服务器IP>;

    # 前端静态文件
    location /SupplyChainSystem/ {
        alias /var/www/SupplyChainSystem/frontend/dist/;
        try_files $uri $uri/ /SupplyChainSystem/index.html;
    }

    # 后端 API 代理
    location /SupplyChainSystem/api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# 启用配置
ln -s /etc/nginx/sites-available/supplychain /etc/nginx/sites-enabled/

# 删除默认配置（如果存在）
rm -f /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 重载 Nginx
nginx -s reload
```

### 4.2 关键配置说明

| 配置项 | 说明 |
|--------|------|
| `alias` | 前端构建产物路径，末尾必须有 `/` |
| `try_files` | Vue Router history 模式必需，fallback 到 index.html |
| `proxy_pass` | 后端 API 代理地址 |

**⚠️ 注意**：`try_files` 的 fallback 路径必须包含应用路径前缀：
```nginx
# 正确
try_files $uri $uri/ /SupplyChainSystem/index.html;

# 错误（会导致刷新出现 Nginx 欢迎页）
try_files $uri $uri/ /index.html;
```

---

## 五、PM2 进程管理

### 5.1 启动后端服务

```bash
ssh root@<服务器IP>

cd /var/www/SupplyChainSystem/backend

# 启动服务
pm2 start src/app.js --name supplychain-backend

# 保存进程列表（开机自启）
pm2 save

# 设置开机自启
pm2 startup
```

### 5.2 常用命令

```bash
# 查看进程状态
pm2 list

# 查看日志
pm2 logs supplychain-backend

# 重启服务
pm2 restart supplychain-backend

# 停止服务
pm2 stop supplychain-backend

# 删除进程
pm2 delete supplychain-backend
```

---

## 六、验证部署

### 6.1 检查服务状态

```bash
# 后端健康检查
curl http://<服务器IP>/SupplyChainSystem/api/health
# 输出：{"status":"ok","timestamp":"..."}

# 前端页面检查
curl -I http://<服务器IP>/SupplyChainSystem/
# 输出：HTTP/1.1 200 OK
```

### 6.2 访问测试

浏览器访问：`http://<服务器IP>/SupplyChainSystem/`

---

## 七、代码更新流程

**⚠️ 重要原则**：永远不要直接登录服务器修改文件，所有修改必须通过 Git 工作流。

### 7.1 本地修改 → GitHub → 服务器

```bash
# 1. 本地修改代码
# ...

# 2. 提交并推送
git add .
git commit -m "修改说明"
git push origin master

# 3. 服务器更新
ssh root@<服务器IP>
cd /var/www/SupplyChainSystem
git pull origin master

# 4. 后端更新（如有修改）
cd backend
npm install          # 安装新依赖
pm2 restart supplychain-backend

# 5. 前端更新（如有修改）
cd ../frontend
npm install          # 安装新依赖
npm run build        # 重新构建
```

### 7.2 自动化更新脚本（可选）

在服务器创建更新脚本：

```bash
cat > /var/www/SupplyChainSystem/update.sh << 'EOF'
#!/bin/bash
cd /var/www/SupplyChainSystem

echo "=== 拉取最新代码 ==="
git pull origin master

echo "=== 更新后端 ==="
cd backend
npm install --production
pm2 restart supplychain-backend

echo "=== 更新前端 ==="
cd ../frontend
npm install --production
npm run build

echo "=== 更新完成 ==="
EOF

chmod +x update.sh
```

后续更新只需：
```bash
ssh root@<服务器IP> "/var/www/SupplyChainSystem/update.sh"
```

---

## 八、常见问题

### Q1：刷新页面出现 Nginx 欢迎页

**原因**：`try_files` fallback 路径错误

**解决**：
```nginx
# 检查配置
cat /etc/nginx/sites-available/supplychain

# 确保 try_files 包含应用路径前缀
try_files $uri $uri/ /SupplyChainSystem/index.html;
```

### Q2：登录失败

**原因**：数据库未初始化或密码哈希错误

**解决**：
```bash
# 重新初始化数据库（会重置所有数据）
cd /var/www/SupplyChainSystem/backend
rm -f data/supply_chain.db
pm2 restart supplychain-backend

# 或重置密码
node -e "
const db = require('./src/utils/db');
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('新密码', 10);
db.runAsync('UPDATE users SET password = ? WHERE username = ?', [hash, 'admin']);
"
```

### Q3：API 请求 404

**原因**：Nginx 代理配置错误或后端未启动

**解决**：
```bash
# 检查后端状态
pm2 list

# 检查 Nginx 配置
nginx -t

# 检查代理路径
curl http://127.0.0.1:3000/api/health
```

### Q4：Git clone 失败

**原因**：服务器未配置 GitHub SSH 密钥

**解决**：参见步骤 2.4

---

## 九、服务器信息

| 项目 | 内容 |
|------|------|
| IP | 47.116.200.214 |
| 系统 | Ubuntu 24.04 |
| Node.js | v22.13.1 |
| Nginx | 1.24.0 |
| PM2 | 6.0.14 |
| 部署路径 | /var/www/SupplyChainSystem |
| 访问地址 | http://47.116.200.214/SupplyChainSystem/ |

---

## 十、安全建议

1. **修改默认密码**：首次登录后立即修改 admin 密码
2. **设置防火墙**：仅开放必要端口（80、443、22）
3. **HTTPS 配置**：生产环境建议配置 SSL 证书
4. **定期备份**：通过系统备份功能定期备份数据库
5. **日志监控**：定期检查 PM2 日志和 Nginx 日志