/**
 * 产品配方路由
 */

const express = require('express');
const XLSX = require('xlsx');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');

const router = express.Router();

// 空值安全处理
const safeStr = (val, defaultVal = '') => val || defaultVal;
const safeNum = (val, defaultVal = 0) => val ?? defaultVal;

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
    const { keyword, type, sales_status } = req.query;

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

    if (sales_status) {
      sql += ' AND sales_status = ?';
      params.push(sales_status);
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

// 获取生产工厂列表（从配料表管理中的 supplier 字段去重）
router.get('/factories', authMiddleware, async (req, res) => {
  try {
    const rows = await queryAsync(
      'SELECT DISTINCT supplier as name FROM product_labels WHERE supplier IS NOT NULL AND supplier != "" ORDER BY supplier'
    );
    res.json({ ok: true, factories: rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ ok: false, msg: '查询失败' });
  }
});

// 批量导出产品配方（必须在 /:id 之前定义）
router.get('/export/excel', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.query;
    
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    
    if (ids) {
      const idList = ids.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (idList.length > 0) {
        const placeholders = idList.map(() => '?').join(',');
        sql += ` AND id IN (${placeholders})`;
        params.push(...idList);
      }
    }
    
    sql += ' ORDER BY code, name';
    
    const products = await queryAsync(sql, params);
    
    if (products.length === 0) {
      return res.status(400).json({ ok: false, msg: '没有可导出的产品' });
    }
    
    const productIds = products.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');
    const materials = await queryAsync(
      `SELECT * FROM product_materials WHERE product_id IN (${placeholders}) ORDER BY product_id, id`,
      productIds
    );
    
    // 构建导出数据（每行一个原料）
    const exportData = [];
    for (const product of products) {
      const productMaterials = materials.filter(m => m.product_id === product.id);
      if (productMaterials.length === 0) {
        // 产品没有配方，也导出一行（原料为空）
        exportData.push({
          '物料编码': product.code,
          '产品名称': product.name,
          '产品类型': safeStr(product.type),
          '规格': safeStr(product.unit, '个'),
          '供应商': '',
          '原料名称': '',
          '统一名称': '',
          '品牌规格': '',
          '品牌': '',
          '原料生产商': '',
          '产地': '',
          '执行标准': '',
          '对应比例': '',
          '单个克重(g)': ''
        });
      } else {
        for (const m of productMaterials) {
          exportData.push({
            '物料编码': product.code,
            '产品名称': product.name,
            '产品类型': safeStr(product.type),
            '规格': safeStr(product.unit, '个'),
            '供应商': safeStr(m.supplier),
            '原料名称': safeStr(m.material_name),
            '统一名称': safeStr(m.unified_name),
            '品牌规格': safeStr(m.brand_spec),
            '品牌': safeStr(m.brand),
            '原料生产商': safeStr(m.manufacturer),
            '产地': safeStr(m.origin),
            '执行标准': safeStr(m.standard),
            '对应比例': safeStr(m.ratio),
            '单个克重(g)': safeStr(m.weight)
          });
        }
      }
    }
    
    // 创建Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 12 },  // 物料编码
      { wch: 25 },  // 产品名称
      { wch: 12 },  // 产品类型
      { wch: 8 },   // 规格
      { wch: 15 },  // 供应商
      { wch: 20 },  // 原料名称
      { wch: 15 },  // 统一名称
      { wch: 15 },  // 品牌规格
      { wch: 10 },  // 品牌
      { wch: 15 },  // 原料生产商
      { wch: 10 },  // 产地
      { wch: 12 },  // 执行标准
      { wch: 10 },  // 对应比例
      { wch: 12 }   // 单个克重
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, '产品配方');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // 记录操作日志
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'export_products', `导出 ${products.length} 个产品的配方`]
    );
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `产品配方导出_${timestamp}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
    
  } catch (err) {
    console.error('导出失败:', err);
    res.status(500).json({ ok: false, msg: '导出失败: ' + err.message });
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
        safeStr(m.materialName || m.name),
        safeStr(m.unifiedName),
        safeStr(m.brandSpec),
        safeStr(m.brand),
        safeStr(m.supplier),
        safeStr(m.manufacturer),
        safeStr(m.origin),
        safeStr(m.standard),
        safeNum(m.ratio),
        safeNum(m.weight),
        safeStr(m.unit, 'g')
      ]
    );
  });
  return Promise.all(promises);
}

// 创建产品（需管理员权限）
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { code, name, type, unit, sales_status, materials } = req.body;

    if (!code || !name) {
      return res.status(400).json({ ok: false, msg: '产品编码和名称不能为空' });
    }

    const info = await runAsync(
      'INSERT INTO products (code, name, type, unit, sales_status) VALUES (?, ?, ?, ?, ?)',
      [code, name, type, unit || '个', sales_status || 'on_sale']
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
    const { name, type, unit, sales_status, factory_name, materials } = req.body;

    await runAsync(
      'UPDATE products SET name = ?, type = ?, unit = ?, sales_status = ?, factory_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, type, unit, sales_status || 'on_sale', factory_name || null, id]
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
