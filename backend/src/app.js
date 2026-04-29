/**
 * 供应链产品管理系统 - 后端服务
 * 技术栈: Node.js + Express + SQLite
 */

// 尽早加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const os = require('os');

const { initDatabase } = require('./models/database');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const materialRoutes = require('./routes/materials');
const priceRoutes = require('./routes/prices');
const backupRoutes = require('./routes/backups');
const logRoutes = require('./routes/logs');
const bomCheckRoutes = require('./routes/bomCheck');
const recipeImportRoutes = require('./routes/recipeImport');
const userRoutes = require('./routes/users');
const priceImportRoutes = require('./routes/priceImport');
const calculatorImportRoutes = require('./routes/calculatorImport');
const calculatorRoutes = require('./routes/calculator');
const matchCorrectionRoutes = require('./routes/matchCorrections');
const productLabelRoutes = require('./routes/productLabels');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:5173,http://yuantaste.com,http://www.yuantaste.com,http://47.116.200.214').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如服务端请求、Postman）
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 不允许的来源'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/bom-check', bomCheckRoutes);
app.use('/api/recipe-import', recipeImportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/price-import', priceImportRoutes);
app.use('/api/calculator-import', calculatorImportRoutes);
app.use('/api/calculator', calculatorRoutes);
app.use('/api/match-corrections', matchCorrectionRoutes);
app.use('/api/product-labels', productLabelRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 统一错误处理中间件
// 配合 asyncHandler 使用：自动捕获异步异常并统一响应格式
app.use((err, req, res, next) => {
  // 已经是标准化响应的，直接透传
  if (err.ok === false && err.msg) {
    return res.status(err.status || 500).json(err);
  }

  // 业务校验错误（如 ValidationError）
  if (err.status === 400 || err.name === 'ValidationError') {
    return res.status(400).json({ ok: false, msg: err.message || '参数错误' });
  }

  // 未授权
  if (err.status === 401 || err.message === '未授权') {
    return res.status(401).json({ ok: false, msg: '未授权，请重新登录' });
  }

  // 默认服务器内部错误
  console.error('[Error]', err.stack || err.message || err);
  res.status(500).json({ ok: false, msg: err.message || '服务器内部错误' });
});

// 获取局域网 IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

// 初始化数据库后启动服务（确保数据库就绪后再监听端口）
async function startServer() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`========================================`);
    console.log(`  供应链产品管理系统 - 后端服务`);
    console.log(`  端口: ${PORT}`);
    console.log(`  API地址: http://localhost:${PORT}/api`);
    if (localIP) {
      console.log(`  局域网访问: http://${localIP}:${PORT}/api`);
    }
    console.log(`========================================`);
  });
}

// 直接运行时启动服务，被 require 时不启动
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, initDatabase };
