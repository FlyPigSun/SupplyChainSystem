/**
 * 操作日志路由
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { queryAsync, runAsync } = require('../utils/db');

const router = express.Router();

// 获取日志列表（所有登录用户可查看）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { keyword, limit = 100 } = req.query;
    
    let sql = 'SELECT * FROM operation_logs WHERE 1=1';
    const params = [];
    
    if (keyword) {
      sql += ' AND (operator LIKE ? OR action LIKE ? OR detail LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const logs = await queryAsync(sql, params);
    res.json({ ok: true, logs });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 记录操作日志（所有登录用户可调用，用于前端纯计算操作）
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { action, detail } = req.body;
    
    if (!action) {
      return res.status(400).json({ ok: false, msg: 'action 不能为空' });
    }
    
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, action, detail || '']
    );
    res.json({ ok: true, msg: '记录成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '记录失败' });
  }
});

module.exports = router;
