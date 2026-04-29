# 供应链产品管理系统

供应链产品配方与原料价格管理平台，支持配方管理、原料价格维护、智能价格匹配、用量计算、成本核查、配料表管理等功能。

**GitHub**: https://github.com/FlyPigSun/SupplyChainSystem

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express + SQLite3 |
| 前端 | Vue 3 + Vite + Element Plus |
| 认证 | JWT + bcryptjs |
| 代理 | Nginx（统一入口，反向代理） |

## 项目结构

```
SupplyChainSystem/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── routes/            # API 路由（各功能模块）
│   │   ├── utils/             # 工具模块（价格匹配、单位换算、异步包装等）
│   │   ├── middleware/        # 认证中间件
│   │   ├── models/            # 数据库初始化
│   │   └── config/            # 配置文件（成本预警规则）
│   ├── data/                  # SQLite 数据库文件
│   ├── backups/               # 数据库备份
│   └── scripts/               # 运维脚本（备份、重启）
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── views/             # 页面视图
│   │   ├── components/        # 通用组件
│   │   ├── composables/       # 组合式函数
│   │   ├── api/               # API 封装
│   │   └── stores/            # Pinia 状态管理
│   └── dist/                  # 构建产物
├── docs/
│   └── modules/               # 各模块核心逻辑说明（详见下方）
├── README.md
└── start.sh                   # 一键启动脚本
```

## 功能模块

| 模块 | 简介 | 权限 |
|------|------|------|
| [数据看板](docs/modules/01-数据看板.md) | 统计概览、原料/供应商/品牌 TOP10 | 全部用户 |
| [产品配方](docs/modules/02-产品配方.md) | 产品 CRUD、配方原料管理、Excel 导入导出 | 管理员 |
| [配料表管理](docs/modules/03-配料表管理.md) | 配料层级解析、Excel 导入、搜索高亮、类型/工厂筛选 | 管理员 |
| [原料价格](docs/modules/04-原料价格.md) | 价格 CRUD、Excel 导入 | 管理员 |
| [用量计算](docs/modules/05-用量计算.md) | 多产品计算、三维度汇总、模板导入、匹配修正 | 全部用户 |
| [成本核查](docs/modules/06-成本核查.md) | Excel 上传比对、成本占比预警、匹配修正、单位换算 | 全部用户 |
| [匹配修正](docs/modules/07-匹配修正.md) | 修正价格匹配结果、记忆修正、自动生效 | 全部用户 |
| [操作日志](docs/modules/08-操作日志.md) | 操作记录查询 | 全部用户 |
| [备份管理](docs/modules/09-备份管理.md) | 数据库备份与恢复 | 管理员 |
| [账号管理](docs/modules/10-账号管理.md) | 用户 CRUD、角色/停用/密码重置 | 管理员 |

> 各模块详细说明见 [`docs/modules/`](docs/modules/) 目录。

## 快速启动

### 前置条件

- Node.js 18+
- Nginx（生产部署）

### 一键启动（开发环境）

```bash
./start.sh
```

### 手动启动

```bash
# 后端
cd backend
npm install
npm start

# 前端（新终端）
cd frontend
npm install
npm run dev
```

### Nginx 配置（生产）

```nginx
server {
    listen 80;
    server_name 47.116.200.214;

    location /SupplyChainSystem/ {
        alias /var/www/SupplyChainSystem/frontend/dist/;
        index index.html;
        try_files $uri $uri/ /SupplyChainSystem/index.html;
    }

    location /SupplyChainSystem/api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        client_max_body_size 50m;
    }
}
```

## 访问地址

| 环境 | 地址 |
|------|------|
| 生产（Nginx） | http://localhost:8080/SupplyChainSystem/ |
| 开发（Vite） | http://localhost:8081/ |
| 后端 API | http://localhost:3000/api/ |

> 所有正式访问请通过 Nginx 路径，禁止直连端口。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `JWT_SECRET` | ✅ | — | JWT 签名密钥，未设置则拒绝启动 |
| `PORT` | — | 3000 | 后端服务端口 |
| `CORS_ORIGINS` | — | localhost:8080,localhost:5173 | CORS 白名单 |

## 测试

```bash
# 后端测试（64 个用例）
cd backend && npm test

# 前端测试（34 个用例）
cd frontend && npm test
```

## 部署说明

详见 [DEPLOY.md](./DEPLOY.md)。
