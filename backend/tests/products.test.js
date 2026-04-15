/**
 * 产品配方接口测试
 */

const request = require('supertest');
const helpers = require('./helpers');

describe('产品配方接口', () => {
  beforeAll(async () => {
    await helpers.setupTestEnv();
  });

  beforeEach(async () => {
    await helpers.runAsync('DELETE FROM product_materials');
    await helpers.runAsync('DELETE FROM products');
  });

  afterAll(async () => {
    await helpers.resetTestEnv();
  });

  describe('GET /api/products', () => {
    test('认证用户可获取产品列表', async () => {
      const res = await request(helpers.app)
        .get('/api/products')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
    });

    test('未认证返回 401', async () => {
      const res = await request(helpers.app).get('/api/products');
      expect(res.status).toBe(401);
    });

    test('关键字搜索', async () => {
      await helpers.createTestProduct({ code: 'SEARCH-001', name: '搜索测试面包' });

      const res = await request(helpers.app)
        .get('/api/products?keyword=搜索测试')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.products[0].name).toContain('搜索测试');
    });
  });

  describe('GET /api/products/types', () => {
    test('获取产品类型列表', async () => {
      await helpers.createTestProduct({ code: 'TYPE-001', name: '类型1', type: '面包' });
      await helpers.createTestProduct({ code: 'TYPE-002', name: '类型2', type: '蛋糕' });

      const res = await request(helpers.app)
        .get('/api/products/types')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.types)).toBe(true);
    });
  });

  describe('GET /api/products/:id', () => {
    test('获取单个产品详情', async () => {
      const product = await helpers.createTestProduct({ code: 'DETAIL-001', name: '详情测试' });

      const res = await request(helpers.app)
        .get(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.product.name).toBe('详情测试');
      expect(res.body.product.materials).toBeDefined();
    });

    test('不存在的产品返回 404', async () => {
      const res = await request(helpers.app)
        .get('/api/products/99999')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/products', () => {
    test('管理员可创建产品', async () => {
      const res = await request(helpers.app)
        .post('/api/products')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({
          code: 'NEW-001',
          name: '新建产品测试',
          type: '面包',
          unit: '个',
          materials: [
            { materialName: '高筋粉', weight: 500, unit: 'g', brand: '测试品牌', supplier: '测试供应商' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.productId).toBeDefined();
    });

    test('普通用户不能创建产品', async () => {
      const res = await request(helpers.app)
        .post('/api/products')
        .set('Authorization', `Bearer ${helpers.userToken}`)
        .send({ code: 'NEW-002', name: '普通用户创建', type: '面包' });

      expect(res.status).toBe(403);
    });

    test('缺少必填字段', async () => {
      const res1 = await request(helpers.app)
        .post('/api/products')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ name: '无编码' });
      expect(res1.status).toBe(400);

      const res2 = await request(helpers.app)
        .post('/api/products')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ code: 'NOCODE' });
      expect(res2.status).toBe(400);
    });

    test('重复编码返回 400', async () => {
      await helpers.createTestProduct({ code: 'DUP-001', name: '重复编码' });

      const res = await request(helpers.app)
        .post('/api/products')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ code: 'DUP-001', name: '另一个产品' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('已存在');
    });
  });

  describe('PUT /api/products/:id', () => {
    test('管理员可更新产品', async () => {
      const product = await helpers.createTestProduct({ code: 'UPD-001', name: '更新前' });

      const res = await request(helpers.app)
        .put(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ name: '更新后', type: '蛋糕', unit: '箱', materials: [] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('普通用户不能更新产品', async () => {
      const product = await helpers.createTestProduct({ code: 'UPD-002', name: '权限测试' });

      const res = await request(helpers.app)
        .put(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${helpers.userToken}`)
        .send({ name: '非法更新' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/products/:id', () => {
    test('管理员可删除产品', async () => {
      const product = await helpers.createTestProduct({ code: 'DEL-001', name: '待删除' });

      const res = await request(helpers.app)
        .delete(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('普通用户不能删除产品', async () => {
      const product = await helpers.createTestProduct({ code: 'DEL-002', name: '删除权限测试' });

      const res = await request(helpers.app)
        .delete(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${helpers.userToken}`);

      expect(res.status).toBe(403);
    });
  });
});
