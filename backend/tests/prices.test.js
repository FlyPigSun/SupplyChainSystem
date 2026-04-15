/**
 * 原料价格接口测试
 */

const request = require('supertest');
const helpers = require('./helpers');

describe('原料价格接口', () => {
  beforeAll(async () => {
    await helpers.setupTestEnv();
  });

  beforeEach(async () => {
    await helpers.runAsync('DELETE FROM material_prices');
  });

  afterAll(async () => {
    await helpers.resetTestEnv();
  });

  describe('GET /api/prices', () => {
    test('认证用户可获取价格列表', async () => {
      const res = await request(helpers.app)
        .get('/api/prices')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.prices)).toBe(true);
    });

    test('未认证返回 401', async () => {
      const res = await request(helpers.app).get('/api/prices');
      expect(res.status).toBe(401);
    });

    test('关键字搜索', async () => {
      await helpers.createTestPrice({ brand: '金沙河', model: '高筋粉', category: '面粉' });

      const res = await request(helpers.app)
        .get('/api/prices?keyword=金沙河')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.prices.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/prices', () => {
    test('管理员可创建价格', async () => {
      const res = await request(helpers.app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({
          category: '面粉',
          brand: '新品牌',
          model: '新型号',
          supplier: '新供应商',
          spec: '25kg',
          unit: 'kg',
          price: 6.8
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('价格必须大于0', async () => {
      const res = await request(helpers.app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ brand: '品牌', model: '型号', price: 0 });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('大于0');
    });

    test('品牌和型号至少填一项', async () => {
      const res = await request(helpers.app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ price: 5.0 });

      expect(res.status).toBe(400);
    });

    test('普通用户不能创建价格', async () => {
      const res = await request(helpers.app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${helpers.userToken}`)
        .send({ brand: '用户品牌', model: '用户型号', price: 3.5 });

      expect(res.status).toBe(403);
    });

    test('重复品牌+型号+供应商更新而非新建', async () => {
      await helpers.createTestPrice({ brand: '重复品牌', model: '重复型号', supplier: '重复供应商', price: 5.0 });

      const res = await request(helpers.app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({
          brand: '重复品牌',
          model: '重复型号',
          supplier: '重复供应商',
          price: 7.5
        });

      expect(res.status).toBe(200);
      expect(res.body.msg).toContain('更新');
    });
  });

  describe('DELETE /api/prices/:id', () => {
    test('管理员可删除价格', async () => {
      const price = await helpers.createTestPrice({ brand: '待删除品牌', model: '待删除型号' });

      const res = await request(helpers.app)
        .delete(`/api/prices/${price.id}`)
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('普通用户不能删除价格', async () => {
      const price = await helpers.createTestPrice({ brand: '不可删品牌', model: '不可删型号' });

      const res = await request(helpers.app)
        .delete(`/api/prices/${price.id}`)
        .set('Authorization', `Bearer ${helpers.userToken}`);

      expect(res.status).toBe(403);
    });
  });
});
