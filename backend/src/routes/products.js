/**
 * 产品配方路由
 */

const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');

const router = express.Router();

// 获取产品类型列表
router.get('/types', authMiddleware, async (req, res) => {
  try {
    const rows = await queryAsync('SELECT DISTINCT type FROM products WHERE type IS NOT NULL AND type != "" ORDER BY type');
    res.json({ ok: true, types: rows.map(r => r.type) });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 获取所有产品
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { keyword, type } = req.query;
    
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    
    if (keyword) {
      sql += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY updated_at DESC';
    
    const products = await queryAsync(sql, params);
    
    if (products.length === 0) {
      return res.json({ ok: true, products: [] });
    }
    
    const productIds = products.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');
    const materials = await queryAsync(
      `SELECT * FROM product_materials WHERE product_id IN (${placeholders})`,
      productIds
    );
    
    const productsWithMaterials = products.map(p => ({
      ...p,
      materials: materials.filter(m => m.product_id === p.id)
    }));
    
    res.json({ ok: true, products: productsWithMaterials });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 获取单个产品
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await getAsync('SELECT * FROM products WHERE id = ?', [id]);
    if (!product) {
      return res.status(404).json({ ok: false, msg: '产品不存在' });
    }
    const materials = await queryAsync('SELECT * FROM product_materials WHERE product_id = ?', [id]);
    res.json({ ok: true, product: { ...product, materials } });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 插入原料的辅助函数（补全所有字段）
function insertMaterials(productId, materials) {
  const promises = (materials || []).map(m => {
    return runAsync(
      `INSERT INTO product_materials 
       (product_id, material_name, unified_name, brand_spec, brand, supplier, manufacturer, origin, standard, ratio, weight, unit) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        m.materialName || m.name || '',
        m.unifiedName || '',
        m.brandSpec || '',
        m.brand || '',
        m.supplier || '',
        m.manufacturer || '',
        m.origin || '',
        m.standard || '',
        m.ratio || 0,
        m.weight || 0,
        m.unit || 'g'
      ]
    );
  });
  return Promise.all(promises);
}

// 创建产品（需管理员权限）
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { code, name, type, unit, materials } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ ok: false, msg: '产品编码和名称不能为空' });
    }
    
    const info = await runAsync(
      'INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)',
      [code, name, type, unit || '个']
    );
    
    const productId = info.lastID;
    
    await insertMaterials(productId, materials);
    
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'create_product', `创建产品: ${name}`]
    );
    
    res.json({ ok: true, msg: '创建成功', productId });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ ok: false, msg: '产品编码已存在' });
    }
    res.status(500).json({ ok: false, msg: '创建失败' });
  }
});

// 更新产品
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, unit, materials } = req.body;
    
    await runAsync(
      'UPDATE products SET name = ?, type = ?, unit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, type, unit, id]
    );
    
    // 更新原料：先删除再插入
    if (materials) {
      await runAsync('DELETE FROM product_materials WHERE product_id = ?', [id]);
      await insertMaterials(id, materials);
    }
    
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'update_product', `更新产品ID: ${id}`]
    );
    
    res.json({ ok: true, msg: '更新成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '更新失败' });
  }
});

// 删除产品
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    await runAsync('DELETE FROM product_materials WHERE product_id = ?', [id]);
    await runAsync('DELETE FROM products WHERE id = ?', [id]);
    
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'delete_product', `删除产品ID: ${id}`]
    );
    
    res.json({ ok: true, msg: '删除成功' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '删除失败' });
  }
});

module.exports = router;
