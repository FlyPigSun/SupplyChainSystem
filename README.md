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

## 功能模块

| 模块 | 功能说明 | 权限 |
|------|----------|------|
| 数据看板 | 统计概览、原料/供应商/品牌 TOP10 | 全部用户 |
| 产品配方 | 产品 CRUD、配方原料管理、Excel 导入（14列模板） | 全部用户 |
| 配料表管理 | 配料层级解析、Excel 导入、搜索高亮、类型/工厂筛选 | 全部用户 |
| 原料价格 | 价格 CRUD、Excel 导入（8列模板） | 全部用户 |
| 用量计算 | 多产品计算、三维度汇总、模板导入、匹配修正 | 全部用户 |
| 成本核查 | Excel 上传比对、成本占比预警、匹配修正、单位换算 | 全部用户 |
| 匹配修正 | 修正价格匹配结果、记忆修正、自动生效 | 全部用户 |
| 操作日志 | 操作记录查询 | 全部用户 |
| 备份管理 | 数据库备份与恢复 | 管理员 |
| 账号管理 | 用户 CRUD、角色/停用/密码重置 | 管理员 |

## 核心能力

### 价格匹配引擎

用量计算和成本核查内置 4 级优先级匹配：

| 优先级 | matchType | 匹配规则 |
|--------|-----------|----------|
| 1 | `exact` | 品牌 + 供应商完全一致 |
| 2 | `brand_model` | 品牌 + 型号匹配 |
| 3 | `supplier_model` | 供应商 + 统一名称匹配 |
| 4 | `fuzzy` | 仅型号匹配，品牌不同 |

成本核查额外支持 `flavor_diff`（品牌匹配但口味不同）。匹配结果支持手动修正，修正记录持久化存储。

### 成本占比预警

成本核查自动检测各项成本占比是否在合理区间，规则配置文件：`backend/src/config/cost-rules.json`，修改后立即生效。

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

### 配料解析规则

括号内含分隔符（顿号/逗号）→ 拆分为二级配料，否则整体作为一级配料：

- `复配水分保持剂（三聚磷酸钠、焦磷酸钠）` → 一级 + 二级
- `黄油（≥2.5%）` → 一级（整体，含量标注）
- `海苔酥脆松（鸡肉）` → 一级（整体，口味说明）

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
    listen 8080;
    location /SupplyChainSystem/ {
        proxy_pass http://127.0.0.1:8081/SupplyChainSystem/;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
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
| `CORS_ORIGINS` | — | localhost:8080,localhost:5173 | CORS 白名单（逗号分隔） |

## 部署说明

详见 [DEPLOY.md](./DEPLOY.md)。

## 测试

```bash
# 后端测试（64 个用例）
cd backend && npm test

# 前端测试（34 个用例）
cd frontend && npm test
```

## 数据库

SQLite3，文件位于 `backend/data/supply_chain.db`。

核心表：products（产品）、product_materials（配方明细）、material_prices（原料价格）、match_corrections（匹配修正）、users（用户）、operation_logs（操作日志）、product_labels（配料表）。

备份通过管理界面操作，备份文件存储在 `backend/backups/`。

## Excel 导入模板

| 模板 | 列数 | 关键字段 |
|------|------|----------|
| 配方导入 | 14 | 物料编码、产品名称、产品类型、原料名称、品牌规格、对应比例、单个克重 |
| 价格导入 | 8 | 原料类型、品牌、型号、供应商、规格、最小规格单价、备注 |
| 用量计算 | 4 | 序号、产品名称、供应商、数量 |
| 配料表 | 4 | 物品编码、品名、产品类别、配料 |
