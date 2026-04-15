/**
 * 配方导入路由
 * 支持上传 Excel 文件批量导入产品配方
 * 模板列：物料编码、产品名称、产品类型、规格、供应商、原料名称、统一名称、品牌规格、品牌、原料生产商、产地、执行标准、对应比例、单个克重(g)
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getAsync, runAsync } = require('../utils/db');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 文件'));
    }
  }
});

/**
 * POST /api/recipe-import
 */
router.post('/', authMiddleware, adminMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, msg: '请上传文件' });
    }

    const mode = req.body.mode || 'upsert';
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, msg: 'Excel 文件为空' });
    }

    const result = await importRecipes(rows, mode, req.user.username);

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('配方导入失败:', error);
    res.status(500).json({ ok: false, msg: '导入失败: ' + error.message });
  }
});

async function importRecipes(rows, mode, operator) {
  // 按 物料编码 分组
  const productMap = {};
  rows.forEach(row => {
    const code = String(row['物料编码'] || '').trim();
    if (!code) return;

    if (!productMap[code]) {
      productMap[code] = {
        code,
        name: String(row['产品名称'] || '').trim(),
        type: String(row['产品类型'] || '').trim(),
        spec: String(row['规格'] || '').trim(),
        materials: []
      };
    }

    const materialName = String(row['原料名称'] || '').trim();
    if (!materialName) return;

    productMap[code].materials.push({
      materialName,
      unifiedName: String(row['统一名称'] || '').trim(),
      brandSpec: String(row['品牌规格'] || '').trim(),
      brand: String(row['品牌'] || '').trim(),
      supplier: String(row['供应商'] || '').trim(),
      manufacturer: String(row['原料生产商'] || '').trim(),
      origin: String(row['产地'] || '').trim(),
      standard: String(row['执行标准'] || '').trim(),
      ratio: parseFloat(row['对应比例']) || 0,
      weight: parseFloat(row['单个克重(g)']) || 0
    });
  });

  const productCodes = Object.keys(productMap);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const code of productCodes) {
    const pData = productMap[code];

    try {
      const existing = await getAsync('SELECT id, name FROM products WHERE code = ?', [code]);

      if (existing) {
        if (mode === 'upsert') {
          await runAsync('UPDATE products SET name = ?, type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [pData.name, pData.type, existing.id]);
          await runAsync('DELETE FROM product_materials WHERE product_id = ?', [existing.id]);

          for (const m of pData.materials) {
            await runAsync(
              `INSERT INTO product_materials 
               (product_id, material_name, unified_name, brand_spec, brand, supplier, manufacturer, origin, standard, ratio, weight, unit) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'g')`,
              [existing.id, m.materialName, m.unifiedName, m.brandSpec, m.brand, m.supplier, m.manufacturer, m.origin, m.standard, m.ratio, m.weight]
            );
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        const info = await runAsync('INSERT INTO products (code, name, type, unit) VALUES (?, ?, ?, ?)', [code, pData.name, pData.type, '个']);
        const productId = info.lastID;

        for (const m of pData.materials) {
          await runAsync(
            `INSERT INTO product_materials 
             (product_id, material_name, unified_name, brand_spec, brand, supplier, manufacturer, origin, standard, ratio, weight, unit) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'g')`,
            [productId, m.materialName, m.unifiedName, m.brandSpec, m.brand, m.supplier, m.manufacturer, m.origin, m.standard, m.ratio, m.weight]
          );
        }
        created++;
      }
    } catch (e) {
      errors.push({ code, name: pData.name, error: e.message });
    }
  }

  // 记录操作日志
  try {
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [operator, 'import_recipes', `导入配方: ${created}新增, ${updated}更新, ${skipped}跳过, ${errors.length}错误`]
    );
  } catch (e) {}

  return {
    total: productCodes.length,
    created,
    updated,
    skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 10)
  };
}

module.exports = router;
