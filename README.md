# 供应链产品管理系统

供应链产品配方与原料价格管理平台，支持配方管理、原料价格维护、智能价格匹配、用量计算、成本核查等功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express + SQLite3 |
| 前端 | Vue 3 + Vite + Element Plus + Pinia |
| 认证 | JWT + bcryptjs |
| 代理 | Nginx（统一入口，反向代理） |
| 测试 | Jest + Supertest（后端）/ Vitest + @vue/test-utils（前端） |

## 目录结构

```
SupplyChainSystem/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── app.js              # Express 入口 + 路由注册
│   │   ├── config/
│   │   │   └── cost-rules.json # 成本占比预警规则（修改即时生效）
│   │   ├── models/
│   │   │   └── database.js     # 数据库初始化 + 表创建 + 默认用户
│   │   ├── routes/             # 13 个路由模块
│   │   │   ├── auth.js         # 认证：登录、修改密码
│   │   │   ├── products.js     # 产品配方 CRUD
│   │   │   ├── materials.js    # 原料统计
│   │   │   ├── prices.js       # 原料价格 CRUD
│   │   │   ├── users.js        # 用户管理
│   │   │   ├── logs.js         # 操作日志
│   │   │   ├── backups.js      # 备份管理
│   │   │   ├── bomCheck.js     # 成本核查
│   │   │   ├── calculator.js   # 用量计算
│   │   │   ├── calculatorImport.js  # 用量计算模板导入
│   │   │   ├── recipeImport.js # 配方 Excel 导入
│   │   │   ├── priceImport.js  # 原料价格 Excel 导入
│   │   │   └── matchCorrections.js  # 匹配修正
│   │   ├── utils/
│   │   │   ├── db.js           # 异步数据库工具
│   │   │   └── priceMatcher.js # 价格匹配引擎
│   │   └── middleware/
│   │       └── auth.js         # JWT 认证 + 权限中间件
│   ├── data/                   # SQLite 数据库文件（.gitignore）
│   ├── tests/                  # 后端测试
│   └── package.json
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── views/              # 10 个页面组件
│   │   ├── components/
│   │   │   └── CorrectionDialog.vue  # 匹配修正共享组件
│   │   ├── stores/
│   │   │   └── auth.js         # Pinia 认证状态
│   │   ├── api/
│   │   │   └── index.js        # Axios 实例 + API 定义
│   │   └── router/
│   │       └── index.js        # 路由 + 守卫
│   ├── tests/                  # 前端测试
│   └── package.json
└── start.sh                    # 一键启动脚本（带进程守护）
```

## 功能模块

| 模块 | 功能说明 | 权限 |
|------|----------|------|
| 数据看板 | 统计概览、原料使用 TOP10、供应商覆盖 TOP10、品牌覆盖 TOP10 | 全部用户 |
| 产品配方 | 产品 CRUD、配方原料管理、Excel 配方导入（14列模板）、产品类型筛选 | 全部用户 |
| 原料价格 | 价格 CRUD、Excel 价格导入（8列模板）、供应商/品牌/型号管理 | 全部用户 |
| 用量计算 | 多产品计算、按产品/供应商/原料三维度汇总、模板导入、匹配修正 | 全部用户 |
| 成本核查 | 上传成本核算 Excel、自动比对配方与价格差异、成本占比预警（占比+金额双重检查）、匹配修正、单位换算 | 全部用户 |
| 匹配修正 | 修正价格匹配结果、记忆修正、自动重新计算 | 全部用户 |
| 操作日志 | 操作记录查询与记录 | 全部用户可查询 |
| 备份管理 | 数据库备份与恢复 | 管理员 |
| 账号管理 | 用户 CRUD、角色修改、停用/启用、密码重置 | 管理员 |

## 价格匹配引擎

用量计算和成本核查内置 4 级优先级匹配：

| 优先级 | matchType | 匹配规则 |
|--------|-----------|----------|
| 1 | `exact` | 品牌 + 供应商完全一致 |
| 2 | `brand_model` | 品牌 + 型号匹配 |
| 3 | `supplier_model` | 供应商 + 统一名称匹配 |
| 4 | `fuzzy` | 仅型号匹配，品牌不同 |

成本核查额外支持 `flavor_diff`（品牌匹配但口味不同）。

匹配结果支持手动修正，修正记录持久化存储，后续匹配自动生效。

## 成本占比预警

成本核查自动检测各项成本占比是否在合理区间，规则配置文件：`backend/src/config/cost-rules.json`，修改后立即生效。

### 支持的规则类型

| 字段 | 说明 | 示例 |
|------|------|------|
| `minPercent` / `maxPercent` | 占比区间（%） | `"minPercent": 45, "maxPercent": 60` |
| `minAmount` / `maxAmount` | 金额绝对值区间（元） | `"minAmount": 0.1, "maxAmount": null` |
| `keywords` | 匹配 Excel 中费用名称的关键词 | `["食材成本", "原料成本"]` |
| `message` | 预警提示文案 | 自定义 |

### 默认规则

| 费用项 | 占比区间 |
|--------|----------|
| 食材成本 | 45% ~ 60% |
| 人工费用 | 10% ~ 20% |
| 水电费用 | 0% ~ 5% |
| 物流费用 | 0% ~ 2% |
| 税收 | 11% ~ 13% |
| 折旧费用 | 0% ~ 3% |
| 管理费用 | 0% ~ 2% |
| 利润 | ≥ 5% |

### 前端展示

- **成本组成表格**：展示 Excel 原始数据，缺项/增项高亮显示
- **价格单位换算**：原料库价格自动换算为 元/kg 或 元/L，与核算表单价统一比较

## 快速启动

### 前置条件

- Node.js 18+
- Nginx（生产部署）

### 一键启动

```bash
./start.sh
```

启动脚本包含：旧进程清理 → 后端启动 → 前端启动 → 进程守护（崩溃自动重启）。

### 手动启动

```bash
# 1. 配置环境变量
cd backend
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET（必填）

# 2. 启动后端
npm install
npm start

# 3. 启动前端（新终端）
cd frontend
npm install
npm run dev
```

### Nginx 配置（生产部署）

```nginx
server {
    listen 8080;
    
    location /SupplyChainSystem/ {
        proxy_pass http://127.0.0.1:8081/SupplyChainSystem/;
    }
    
    location /SupplyChainSystem/api/ {
        proxy_pass http://127.0.0.1:3000/api/;
    }
}
```

## 访问地址

| 环境 | 地址 |
|------|------|
| 生产（Nginx） | http://localhost:8080/SupplyChainSystem/ |
| 开发（直连） | http://localhost:8081/ |
| 后端 API | http://localhost:3000/api/ |
| 局域网 | http://\<LAN_IP\>:8080/SupplyChainSystem/ |

> 所有正式访问请通过 Nginx 路径，禁止直连端口。

## 默认账号

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| 管理员 | admin | sunji12 | 系统账号，不可停用 |
| 管理员 | yangbin | yangbin | 管理员账号 |

新创建的用户默认密码为 `123456`，首次登录强制修改。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `JWT_SECRET` | ✅ | — | JWT 签名密钥，未设置则拒绝启动 |
| `PORT` | — | 3000 | 后端服务端口 |
| `CORS_ORIGINS` | — | localhost:8080,localhost:5173 | CORS 白名单（逗号分隔） |
| `TEST_DB_PATH` | — | — | 测试用独立数据库路径 |

## 运行测试

```bash
# 后端测试（64 个用例）
cd backend
npm test

# 前端测试（34 个用例）
cd frontend
npm test
```

后端测试使用独立数据库（`TEST_DB_PATH`），不污染生产数据，运行后自动清理。

## 数据库

SQLite3，文件位于 `backend/data/supply_chain.db`。

### 核心表

| 表名 | 说明 |
|------|------|
| products | 产品信息 |
| product_materials | 配方明细（原料/比例/克重等） |
| material_prices | 原料价格（品牌/型号/供应商/单价） |
| match_corrections | 匹配修正记录 |
| users | 用户账号（含角色/状态/密码标记） |
| operation_logs | 操作日志 |

### 备份与恢复

- 通过管理界面操作备份（管理员权限）
- 备份文件存储在 `backend/backups/`
- 恢复后自动重置数据库连接

## Excel 导入模板

| 模板 | 列数 | 关键字段 |
|------|------|----------|
| 配方导入 | 14 | 物料编码、产品名称、产品类型、原料名称、品牌规格、对应比例、单个克重 |
| 价格导入 | 8 | 原料类型、品牌、型号、供应商、规格、最小规格单价、备注 |
| 用量计算 | 4 | 序号、产品名称、供应商、数量 |
