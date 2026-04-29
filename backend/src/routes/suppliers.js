/**
 * 供应商路由
 */

const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');

const router = express.Router();

// 获取所有供应商列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const suppliers = await queryAsync('SELECT id, name, contact, phone, remark FROM suppliers ORDER BY name');
    res.json({ ok: true, suppliers });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 创建供应商（需管理员权限）
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, contact, phone, remark } = req.body;
    if (!name) {
      return res.status(400).json({ ok: false, msg: '供应商名称不能为空' });
    }
    const info = await runAsync(
      'INSERT INTO suppliers (name, contact, phone, remark) VALUES (?, ?, ?, ?)',
      [name, contact || '', phone || '', remark || '']
    );
    res.json({ ok: true, msg: '创建成功', supplierId: info.lastID });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '创建失败' });
  }
});

// 更新供应商（需管理员权限）
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact, phone, remark } = req.body;
    await runAsync(
      'UPDATE suppliers SET name = ?, contact = ?, phone = ?, remark = ? WHERE id = ?',
      [name, contact || '', phone || '', remark || '', id]
    );
    res.json({ ok: true, msg: '更新成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '更新失败' });
  }
});

// 删除供应商（需管理员权限）
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await runAsync('DELETE FROM suppliers WHERE id = ?', [id]);
    res.json({ ok: true, msg: '删除成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '删除失败' });
  }
});

module.exports = router;
