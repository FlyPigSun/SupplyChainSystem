/**
 * 认证接口测试
 */

const request = require('supertest');
const helpers = require('./helpers');

describe('认证接口', () => {
  beforeAll(async () => {
    await helpers.setupTestEnv();
  });

  afterAll(async () => {
    await helpers.resetTestEnv();
  });

  describe('POST /api/auth/login', () => {
    test('正常登录 - admin', async () => {
      const res = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.role).toBe('admin');
    });

    test('正常登录 - 普通用户', async () => {
      const res = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe('user');
    });

    test('缺少用户名或密码', async () => {
      const res1 = await request(helpers.app)
        .post('/api/auth/login')
        .send({ password: 'admin' });
      expect(res1.status).toBe(400);
      expect(res1.body.ok).toBe(false);

      const res2 = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'admin' });
      expect(res2.status).toBe(400);
    });

    test('密码错误', async () => {
      const res = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    test('不存在的用户', async () => {
      const res = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'test' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    test('被停用的用户不能登录', async () => {
      const bcrypt = require('bcryptjs');
      const hashedPassword = bcrypt.hashSync('disabledpass', 10);
      await helpers.runAsync(
        "INSERT OR IGNORE INTO users (username, password, role, status) VALUES (?, ?, ?, ?)",
        ['disabled_user', hashedPassword, 'user', 'disabled']
      );

      const res = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'disabled_user', password: 'disabledpass' });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('PUT /api/auth/change-password', () => {
    test('正常修改密码', async () => {
      const loginRes = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });
      const token = loginRes.body.token;

      const res = await request(helpers.app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'testpass', new_password: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // 用新密码重新登录
      const reLoginRes = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'newpass123' });
      expect(reLoginRes.status).toBe(200);

      // 恢复原始密码
      await request(helpers.app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${reLoginRes.body.token}`)
        .send({ old_password: 'newpass123', new_password: 'testpass' });
    });

    test('旧密码错误', async () => {
      const loginRes = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });

      const res = await request(helpers.app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({ old_password: 'wrong', new_password: 'newpass123' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('旧密码错误');
    });

    test('新密码太短', async () => {
      const loginRes = await request(helpers.app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpass' });

      const res = await request(helpers.app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({ old_password: 'testpass', new_password: '12' });

      expect(res.status).toBe(400);
      expect(res.body.msg).toContain('4位');
    });

    test('未认证不能修改密码', async () => {
      const res = await request(helpers.app)
        .put('/api/auth/change-password')
        .send({ old_password: 'test', new_password: 'newpass123' });

      expect(res.status).toBe(401);
    });
  });

  describe('认证中间件', () => {
    test('无 token 访问受保护接口返回 401', async () => {
      const res = await request(helpers.app).get('/api/products');
      expect(res.status).toBe(401);
    });

    test('无效 token 返回 401', async () => {
      const res = await request(helpers.app)
        .get('/api/products')
        .set('Authorization', 'Bearer invalid_token_here');
      expect(res.status).toBe(401);
    });

    test('过期 token 返回 401', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { id: 1, username: 'admin', role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await request(helpers.app)
        .get('/api/products')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });
  });
});
