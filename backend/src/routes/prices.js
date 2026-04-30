/**
 * 原料价格路由
 */

const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');
const { round2 } = require('../utils/money');

const router = express.Router();

// 获取所有原料价格（需登录）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { keyword } = req.query;
    
    let sql = 'SELECT * FROM material_prices WHERE 1=1';
    const params = [];
    
    if (keyword) {
      sql += ' AND (brand LIKE ? OR model LIKE ? OR supplier LIKE ? OR category LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    
    sql += ' ORDER BY category, brand, model';
    
    const prices = await queryAsync(sql, params);
    // 金额统一保留两位小数
    for (const p of prices) {
      if (p.price != null) p.price = round2(p.price);
    }
    res.json({ ok: true, prices });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 创建/更新价格
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { category, brand, model, supplier, spec, unit, price, remark } = req.body;
    
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return res.status(400).json({ ok: false, msg: '单价不能为空且必须大于0' });
    }
    
    if (!brand && !model) {
      return res.status(400).json({ ok: false, msg: '品牌和型号至少填一项' });
    }

    const existing = await getAsync(
      'SELECT id FROM material_prices WHERE brand = ? AND model = ? AND supplier = ?',
      [brand || '', model || '', supplier || '']
    );

    if (existing) {
      await runAsync(
        `UPDATE material_prices SET category = ?, spec = ?, unit = ?, price = ?, remark = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [category || '', spec || '', unit || 'kg', round2(price), remark || '', existing.id]
      );
      await runAsync(
        'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
        [req.user.username, 'update_price', `更新价格: ${brand||''} ${model||''}`]
      );
      res.json({ ok: true, msg: '更新成功' });
    } else {
      const materialName = `${brand || ''} ${model || ''} ${supplier || ''}`.trim() || `item_${Date.now()}`;
      await runAsync(
        `INSERT INTO material_prices (material_name, category, brand, model, supplier, spec, unit, price, remark) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [materialName, category || '', brand || '', model || '', supplier || '', spec || '', unit || 'kg', round2(price), remark || '']
      );
      await runAsync(
        'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
        [req.user.username, 'add_price', `新增价格: ${brand||''} ${model||''}`]
      );
      res.json({ ok: true, msg: '创建成功' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, msg: '操作失败' });
  }
});

// 删除价格
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await runAsync('DELETE FROM material_prices WHERE id = ?', [id]);
    res.json({ ok: true, msg: '删除成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '删除失败' });
  }
});

module.exports = router;
