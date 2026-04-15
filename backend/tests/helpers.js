/**
 * 测试辅助工具
 * - 使用独立的测试数据库（不污染生产数据）
 * - 所有测试串行运行（--runInBand），共享数据库连接
 */

const request = require('supertest');

// 设置测试环境变量（必须在 require app.js 之前）
process.env.JWT_SECRET = 'test_jwt_secret_key_2026';
process.env.PORT = '0';
process.env.CORS_ORIGINS = 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.TEST_DB_PATH = require('path').join(__dirname, '..', 'data', 'test_supply_chain.db');

const { app, initDatabase } = require('../src/app');
const { queryAsync, runAsync, getAsync } = require('../src/utils/db');
const { closeDatabase } = require('../src/models/database');

let _adminToken = null;
let _userToken = null;
let _initialized = false;

/**
 * 初始化测试环境（全局只调用一次）
 */
async function setupTestEnv() {
  if (_initialized) {
    return { adminToken: _adminToken, userToken: _userToken };
  }

  await initDatabase();

  // 清理所有测试数据
  await cleanTestData();

  // 创建测试用的普通用户
  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync('testpass', 10);
  try {
    await runAsync(
      "INSERT OR IGNORE INTO users (username, password, role, status, must_change_pwd) VALUES (?, ?, ?, ?, ?)",
      ['testuser', hashedPassword, 'user', 'active', 0]
    );
  } catch (e) {}

  // 获取 admin token（initDatabase 创建的默认 admin 密码是 admin）
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin' });
  _adminToken = adminRes.body.token;

  // 获取 user token
  const userRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'testuser', password: 'testpass' });
  _userToken = userRes.body.token;

  _initialized = true;
  return { adminToken: _adminToken, userToken: _userToken };
}

/**
 * 清理测试数据（保留 admin/yangbin 默认账号）
 */
async function cleanTestData() {
  try {
    await runAsync('DELETE FROM match_corrections');
    await runAsync('DELETE FROM operation_logs');
    await runAsync('DELETE FROM product_materials');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM material_prices');
    await runAsync("DELETE FROM users WHERE username NOT IN ('admin', 'yangbin')");
  } catch (e) {}
}

/**
 * 重建测试环境（清理数据 + 重新获取 token）
 */
async function resetTestEnv() {
  await cleanTestData();
  
  const bcrypt = require('bcryptjs');
  const hashedPassword = bcrypt.hashSync('testpass', 10);
  try {
    await runAsync(
      "INSERT OR IGNORE INTO users (username, password, role, status, must_change_pwd) VALUES (?, ?, ?, ?, ?)",
      ['testuser', hashedPassword, 'user', 'active', 0]
    );
  } catch (e) {}

  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin' });
  _adminToken = adminRes.body.token;

  const userRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'testuser', password: 'testpass' });
  _userToken = userRes.body.token;
}

/**
 * 创建测试产品
 */
async function createTestProduct(overrides = {}) {
  const code = overrides.code || `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const name = overrides.name || `测试产品-${Date.now()}`;
  const info = await runAsync(
    'INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)',
    [code, name, overrides.type || '面包', overrides.unit || '个']
  );
  return { id: info.lastID, code, name };
}

/**
 * 创建测试价格
 */
async function createTestPrice(overrides = {}) {
  const brand = overrides.brand || '测试品牌';
  const model = overrides.model || '测试型号';
  const supplier = overrides.supplier || '测试供应商';
  const materialName = `${brand} ${model} ${supplier}`.trim();
  const info = await runAsync(
    `INSERT INTO material_prices (material_name, category, brand, model, supplier, spec, unit, price, remark) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [materialName, overrides.category || '面粉', brand, model, supplier, overrides.spec || '25kg', overrides.unit || 'kg', overrides.price || 5.5, overrides.remark || '']
  );
  return { id: info.lastID, brand, model, supplier };
}

/**
 * 关闭测试环境
 */
async function teardownTestEnv() {
  closeDatabase();
  const fs = require('fs');
  const testDbPath = process.env.TEST_DB_PATH;
  if (testDbPath && fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
  }
}

module.exports = {
  app,
  setupTestEnv,
  cleanTestData,
  resetTestEnv,
  teardownTestEnv,
  createTestProduct,
  createTestPrice,
  queryAsync,
  runAsync,
  getAsync,
  get adminToken() { return _adminToken; },
  get userToken() { return _userToken; }
};
