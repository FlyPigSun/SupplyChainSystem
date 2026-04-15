/**
 * 用户管理路由
 * 仅管理员可访问
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');

const router = express.Router();

const DEFAULT_PASSWORD = '123456';

// 管理员路由
router.use(authMiddleware, adminMiddleware);

// 获取用户列表
router.get('/', async (req, res) => {
  try {
    const users = await queryAsync(
      'SELECT id, username, role, status, must_change_pwd, created_at FROM users ORDER BY id ASC'
    );
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 新增用户（默认密码 123456，首次登录强制修改）
router.post('/', async (req, res) => {
  try {
    const { username, role } = req.body;
    
    if (!username) {
      return res.status(400).json({ ok: false, msg: '用户名不能为空' });
    }
    
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ ok: false, msg: '用户名长度应为2-20个字符' });
    }

    const hashedPassword = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    const userRole = role || 'user';
    
    const info = await runAsync(
      'INSERT INTO users (username, password, role, status, must_change_pwd) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, userRole, 'active', 1]
    );
    res.json({ ok: true, msg: '创建成功，默认密码: 123456', id: info.lastID });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ ok: false, msg: '用户名已存在' });
    }
    res.status(500).json({ ok: false, msg: '创建失败' });
  }
});

// 停用/启用用户
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ ok: false, msg: '无效的状态' });
    }
    
    // 不允许停用自己
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ ok: false, msg: '不能停用自己的账号' });
    }
    
    const user = await getAsync('SELECT username FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ ok: false, msg: '用户不存在' });
    }
    
    if (user.username === 'admin' && status === 'disabled') {
      return res.status(400).json({ ok: false, msg: '不能停用系统管理员账号' });
    }
    
    const result = await runAsync(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' });
    }
    res.json({ ok: true, msg: status === 'active' ? '已启用' : '已停用' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '操作失败' });
  }
});

// 修改用户角色
router.put('/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ ok: false, msg: '无效的角色' });
    }
    
    const user = await getAsync('SELECT username, role FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ ok: false, msg: '用户不存在' });
    }
    
    if (user.username === 'admin') {
      return res.status(400).json({ ok: false, msg: '不能修改系统管理员角色' });
    }
    
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ ok: false, msg: '不能修改自己的角色' });
    }

    if (user.role === role) {
      return res.json({ ok: true, msg: '角色未变化' });
    }
    
    await runAsync('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'change_role', `将用户 ${user.username} 角色从 ${user.role === 'admin' ? '管理员' : '普通用户'} 改为 ${role === 'admin' ? '管理员' : '普通用户'}`]
    );
    res.json({ ok: true, msg: '角色修改成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '修改失败' });
  }
});

// 重置密码（重置为 123456，强制下次修改）
router.put('/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const hashedPassword = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    
    const result = await runAsync(
      'UPDATE users SET password = ?, must_change_pwd = 1 WHERE id = ?',
      [hashedPassword, id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' });
    }
    res.json({ ok: true, msg: '密码已重置为 123456' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '重置失败' });
  }
});

module.exports = router;
