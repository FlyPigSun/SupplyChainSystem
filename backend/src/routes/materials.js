/**
 * 原料路由（聚合查询）
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { queryAsync } = require('../utils/db');

const router = express.Router();

// 所有接口需要登录
router.use(authMiddleware);

// 获取所有原料列表（去重）
router.get('/', async (req, res) => {
  try {
    const materials = await queryAsync(
      'SELECT DISTINCT material_name as name FROM product_materials ORDER BY material_name'
    );
    res.json({ ok: true, materials: materials.map(m => m.name) });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 获取原料使用统计
router.get('/stats', async (req, res) => {
  try {
    const stats = await queryAsync(`
      SELECT 
        pm.material_name,
        COUNT(DISTINCT pm.product_id) as product_count,
        mp.price,
        mp.unit as price_unit
      FROM product_materials pm
      LEFT JOIN material_prices mp ON pm.material_name = mp.material_name
      GROUP BY pm.material_name
      ORDER BY product_count DESC
    `);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '统计失败' });
  }
});

// 获取供应商覆盖产品TOP10
router.get('/supplier-stats', async (req, res) => {
  try {
    const stats = await queryAsync(`
      SELECT 
        COALESCE(pm.supplier, '未指定') as supplier,
        COUNT(DISTINCT pm.product_id) as product_count
      FROM product_materials pm
      WHERE pm.supplier IS NOT NULL AND pm.supplier != ''
      GROUP BY pm.supplier
      ORDER BY product_count DESC
      LIMIT 10
    `);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '统计失败' });
  }
});

// 获取品牌覆盖产品TOP10
router.get('/brand-stats', async (req, res) => {
  try {
    const stats = await queryAsync(`
      SELECT 
        mp.brand,
        COUNT(DISTINCT pm.product_id) as product_count
      FROM material_prices mp
      JOIN product_materials pm ON pm.brand = mp.brand
      WHERE mp.brand IS NOT NULL AND mp.brand != ''
      GROUP BY mp.brand
      ORDER BY product_count DESC
      LIMIT 10
    `);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '统计失败' });
  }
});

module.exports = router;
