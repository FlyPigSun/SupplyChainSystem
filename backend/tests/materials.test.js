/**
 * 原料接口测试
 */

const request = require('supertest');
const helpers = require('./helpers');

describe('原料接口', () => {
  beforeAll(async () => {
    await helpers.setupTestEnv();
  });

  beforeEach(async () => {
    await helpers.runAsync('DELETE FROM product_materials');
    await helpers.runAsync('DELETE FROM products');
    await helpers.runAsync('DELETE FROM material_prices');
  });

  afterAll(async () => {
    await helpers.resetTestEnv();
  });

  describe('GET /api/materials', () => {
    test('认证用户可获取原料列表', async () => {
      const info = await helpers.runAsync(
        "INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)",
        ['MAT-001', '原料测试产品', '面包', '个']
      );
      await helpers.runAsync(
        "INSERT INTO product_materials (product_id, material_name, brand, supplier, weight, unit) VALUES (?, ?, ?, ?, ?, ?)",
        [info.lastID, '高筋粉', '金沙河', '北京供应商', 500, 'g']
      );

      const res = await request(helpers.app)
        .get('/api/materials')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.materials)).toBe(true);
    });

    test('未认证返回 401', async () => {
      const res = await request(helpers.app).get('/api/materials');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/materials/stats', () => {
    test('获取原料使用统计', async () => {
      const info = await helpers.runAsync(
        "INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)",
        ['STAT-001', '统计测试产品', '面包', '个']
      );
      await helpers.runAsync(
        "INSERT INTO product_materials (product_id, material_name, brand, supplier, weight, unit) VALUES (?, ?, ?, ?, ?, ?)",
        [info.lastID, '统计粉', '统计品牌', '统计供应商', 300, 'g']
      );
      await helpers.runAsync(
        `INSERT INTO material_prices (material_name, category, brand, model, supplier, spec, unit, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['统计品牌 统计粉 统计供应商', '面粉', '统计品牌', '统计粉', '统计供应商', '25kg', 'kg', 4.5]
      );

      const res = await request(helpers.app)
        .get('/api/materials/stats')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.stats)).toBe(true);
    });
  });

  describe('GET /api/materials/supplier-stats', () => {
    test('获取供应商统计', async () => {
      const info = await helpers.runAsync(
        "INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)",
        ['SUP-001', '供应商测试', '面包', '个']
      );
      await helpers.runAsync(
        "INSERT INTO product_materials (product_id, material_name, brand, supplier, weight, unit) VALUES (?, ?, ?, ?, ?, ?)",
        [info.lastID, '黄油', '安佳', '上海供应商', 200, 'g']
      );

      const res = await request(helpers.app)
        .get('/api/materials/supplier-stats')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.stats)).toBe(true);
    });
  });

  describe('GET /api/materials/brand-stats', () => {
    test('获取品牌统计', async () => {
      const info = await helpers.runAsync(
        "INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)",
        ['BRAND-001', '品牌测试', '面包', '个']
      );
      await helpers.runAsync(
        "INSERT INTO product_materials (product_id, material_name, brand, supplier, weight, unit) VALUES (?, ?, ?, ?, ?, ?)",
        [info.lastID, '酵母', '燕子牌', '法国供应商', 10, 'g']
      );
      await helpers.runAsync(
        `INSERT INTO material_prices (material_name, category, brand, model, supplier, spec, unit, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['燕子牌 酵母 法国供应商', '酵母', '燕子牌', '酵母', '法国供应商', '500g', 'kg', 80]
      );

      const res = await request(helpers.app)
        .get('/api/materials/brand-stats')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.stats)).toBe(true);
    });
  });
});
