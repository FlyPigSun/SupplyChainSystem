/**
 * 用户管理接口测试
 */

const request = require('supertest');
const helpers = require('./helpers');

describe('用户管理接口', () => {
  beforeAll(async () => {
    await helpers.setupTestEnv();
  });

  afterAll(async () => {
    await helpers.resetTestEnv();
  });

  describe('GET /api/users', () => {
    test('管理员可获取用户列表', async () => {
      const res = await request(helpers.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      // 列表中不应包含密码字段
      expect(res.body.users[0].password).toBeUndefined();
    });

    test('普通用户不能访问用户管理', async () => {
      const res = await request(helpers.app)
        .get('/api/users')
        .set('Authorization', `Bearer ${helpers.userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/users', () => {
    test('管理员可创建用户', async () => {
      const res = await request(helpers.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ username: 'newuser1', role: 'user' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(res.body.msg).toContain('123456');
    });

    test('用户名不能为空', async () => {
      const res = await request(helpers.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
    });

    test('用户名长度限制', async () => {
      const res1 = await request(helpers.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ username: 'a', role: 'user' });
      expect(res1.status).toBe(400);

      const res2 = await request(helpers.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ username: 'a'.repeat(21), role: 'user' });
      expect(res2.status).toBe(400);
    });

    test('用户名重复', async () => {
      await request(helpers.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ username: 'dupuser1', role: 'user' });

      const res = await request(helpers.app)
        .post('/api/users')
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ username: 'dupuser1', role: 'user' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('已存在');
    });
  });

  describe('PUT /api/users/:id/status', () => {
    let testUserId;

    beforeAll(async () => {
      const bcrypt = require('bcryptjs');
      const hashed = bcrypt.hashSync('test123', 10);
      await helpers.runAsync(
        "INSERT OR IGNORE INTO users (username, password, role, status) VALUES (?, ?, ?, ?)",
        ['statustest', hashed, 'user', 'active']
      );
      const user = await helpers.getAsync("SELECT id FROM users WHERE username = 'statustest'");
      testUserId = user.id;
    });

    test('管理员可停用用户', async () => {
      const res = await request(helpers.app)
        .put(`/api/users/${testUserId}/status`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ status: 'disabled' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('管理员可启用用户', async () => {
      const res = await request(helpers.app)
        .put(`/api/users/${testUserId}/status`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ status: 'active' });

      expect(res.status).toBe(200);
    });

    test('不能停用自己', async () => {
      const adminUser = await helpers.getAsync("SELECT id FROM users WHERE username = 'admin'");
      
      const res = await request(helpers.app)
        .put(`/api/users/${adminUser.id}/status`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ status: 'disabled' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('不能停用自己');
    });

    test('不能停用系统管理员', async () => {
      const adminUser = await helpers.getAsync("SELECT id FROM users WHERE username = 'admin'");
      
      const res = await request(helpers.app)
        .put(`/api/users/${adminUser.id}/status`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ status: 'disabled' });

      expect(res.status).toBe(400);
    });

    test('无效状态值', async () => {
      const res = await request(helpers.app)
        .put(`/api/users/${testUserId}/status`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/:id/role', () => {
    let testUserId;

    beforeAll(async () => {
      const bcrypt = require('bcryptjs');
      const hashed = bcrypt.hashSync('test123', 10);
      await helpers.runAsync(
        "INSERT OR IGNORE INTO users (username, password, role, status) VALUES (?, ?, ?, ?)",
        ['roletest', hashed, 'user', 'active']
      );
      const user = await helpers.getAsync("SELECT id FROM users WHERE username = 'roletest'");
      testUserId = user.id;
    });

    test('管理员可修改用户角色', async () => {
      const res = await request(helpers.app)
        .put(`/api/users/${testUserId}/role`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // 恢复
      await request(helpers.app)
        .put(`/api/users/${testUserId}/role`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ role: 'user' });
    });

    test('不能修改系统管理员角色', async () => {
      const adminUser = await helpers.getAsync("SELECT id FROM users WHERE username = 'admin'");
      
      const res = await request(helpers.app)
        .put(`/api/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('系统管理员');
    });

    test('不能修改自己的角色', async () => {
      const adminUser = await helpers.getAsync("SELECT id FROM users WHERE username = 'admin'");
      
      const res = await request(helpers.app)
        .put(`/api/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${helpers.adminToken}`)
        .send({ role: 'user' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/:id/password', () => {
    let testUserId;

    beforeAll(async () => {
      const bcrypt = require('bcryptjs');
      const hashed = bcrypt.hashSync('test123', 10);
      await helpers.runAsync(
        "INSERT OR IGNORE INTO users (username, password, role, status) VALUES (?, ?, ?, ?)",
        ['pwdtest', hashed, 'user', 'active']
      );
      const user = await helpers.getAsync("SELECT id FROM users WHERE username = 'pwdtest'");
      testUserId = user.id;
    });

    test('管理员可重置用户密码', async () => {
      const res = await request(helpers.app)
        .put(`/api/users/${testUserId}/password`)
        .set('Authorization', `Bearer ${helpers.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.msg).toContain('123456');
    });
  });
});
