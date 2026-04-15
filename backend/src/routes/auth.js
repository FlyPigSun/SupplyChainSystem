/**
 * 认证路由
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const { getAsync, runAsync } = require('../utils/db');

const router = express.Router();

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ ok: false, msg: '请提供用户名和密码' });
    }

    const user = await getAsync('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ ok: false, msg: '账号或密码错误' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ ok: false, msg: '账号已被停用，请联系管理员' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      ok: true,
      msg: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        must_change_pwd: !!user.must_change_pwd
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '登录失败' });
  }
});

// 用户修改自己的密码（只需登录即可）
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    
    if (!old_password || !new_password) {
      return res.status(400).json({ ok: false, msg: '请提供旧密码和新密码' });
    }
    
    if (new_password.length < 4) {
      return res.status(400).json({ ok: false, msg: '新密码长度不能少于4位' });
    }
    
    const user = await getAsync('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(500).json({ ok: false, msg: '用户不存在' });
    }
    
    if (!bcrypt.compareSync(old_password, user.password)) {
      return res.status(400).json({ ok: false, msg: '旧密码错误' });
    }
    
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    await runAsync(
      'UPDATE users SET password = ?, must_change_pwd = 0 WHERE id = ?',
      [hashedPassword, req.user.id]
    );
    res.json({ ok: true, msg: '密码修改成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '修改失败' });
  }
});

module.exports = router;
