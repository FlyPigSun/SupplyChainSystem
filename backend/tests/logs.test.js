/**
 * 操作日志接口测试
 */

const request = require('supertest');
const helpers = require('./helpers');

describe('操作日志接口', () => {
  beforeAll(async () => {
    await helpers.setupTestEnv();
  });

  beforeEach(async () => {
    await helpers.runAsync('DELETE FROM operation_logs');
  });

  afterAll(async () => {
    await helpers.resetTestEnv();
  });

  describe('GET /api/logs', () => {
    test('认证用户可查看日志', async () => {
      const res = await request(helpers.app)
        .get('/api/logs')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
    });

    test('普通用户也可查看日志', async () => {
      const res = await request(helpers.app)
        .get('/api/logs')
        .set('Authorization', `Bearer ${helpers.userToken}`);

      expect(res.status).toBe(200);
    });

    test('未认证返回 401', async () => {
      const res = await request(helpers.app).get('/api/logs');
      expect(res.status).toBe(401);
    });

    test('关键字搜索', async () => {
      await helpers.runAsync(
        "INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)",
        ['admin', 'test_action', '搜索测试日志条目']
      );

      const res = await request(helpers.app)
        .get('/api/logs?keyword=搜索测试')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/logs', () => {
    test('认证用户可记录日志', async () => {
      const res = await request(helpers.app)
        .post('/api/logs')
        .set('Authorization', `Bearer ${helpers.userToken}`)
        .send({ action: 'test_action', detail: '测试日志记录' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('action 不能为空', async () => {
      const res = await request(helpers.app)
        .post('/api/logs')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ detail: '无action' });

      expect(res.status).toBe(400);
    });

    test('未认证不能记录日志', async () => {
      const res = await request(helpers.app)
        .post('/api/logs')
        .send({ action: 'test' });

      expect(res.status).toBe(401);
    });
  });
});
