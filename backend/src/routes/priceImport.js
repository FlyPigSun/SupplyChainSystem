/**
 * 原料价格导入路由
 */

const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { getAsync, runAsync } = require('../utils/db');
const { round2 } = require('../utils/money');

const router = express.Router();

// 文件上传配置（使用内存存储，避免残留临时文件）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true)
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 文件'))
    }
  }
});

// 所有路由需要管理员权限
router.use(authMiddleware, adminMiddleware);

// 导入原料价格
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, msg: '请上传文件' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, msg: '文件内容为空' });
    }

    // 字段映射：模板列名 → 数据库字段
    const fieldMap = {
      '原料类型': 'category',
      '品牌': 'brand',
      '型号': 'model',
      '供应商': 'supplier',
      '规格': 'spec',
      '单位': 'unit',
      '最小规格单价': 'price',
      '备注': 'remark'
    };

    let added = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const data = {};
        for (const [colName, dbField] of Object.entries(fieldMap)) {
          if (row[colName] !== undefined && row[colName] !== null) {
            data[dbField] = String(row[colName]).trim();
          } else {
            data[dbField] = '';
          }
        }

        // 必填校验
        if (!data.brand && !data.model) {
          errors.push({ row: rowNum, msg: '品牌和型号至少填一项' });
          continue;
        }
        if (!data.price || isNaN(parseFloat(data.price)) || parseFloat(data.price) <= 0) {
          errors.push({ row: rowNum, msg: '最小规格单价无效' });
          continue;
        }

        data.price = round2(data.price);
        data.unit = data.unit || 'kg';
        data.material_name = `${data.brand || ''} ${data.model || ''} ${data.supplier || ''}`.trim() || `item_${Date.now()}_${i}`;

        const existing = await getAsync(
          'SELECT id FROM material_prices WHERE brand = ? AND model = ? AND supplier = ?',
          [data.brand, data.model, data.supplier]
        );

        if (existing) {
          await runAsync(
            `UPDATE material_prices SET category = ?, spec = ?, unit = ?, price = ?, remark = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [data.category, data.spec, data.unit, data.price, data.remark, existing.id]
          );
          updated++;
        } else {
          await runAsync(
            `INSERT INTO material_prices (material_name, category, brand, model, supplier, spec, unit, price, remark) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.material_name, data.category, data.brand, data.model, data.supplier, data.spec, data.unit, data.price, data.remark]
          );
          added++;
        }
      } catch (e) {
        errors.push({ row: rowNum, msg: '处理失败: ' + e.message });
      }
    }

    // 记录日志
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'import_prices', `导入原料价格: 新增${added}条, 更新${updated}条, 错误${errors.length}条`]
    );

    res.json({
      ok: true,
      msg: '导入完成',
      result: {
        total: rows.length,
        added,
        updated,
        errors: errors.length,
        errorDetails: errors.slice(0, 20)
      }
    });

  } catch (err) {
    console.error('导入失败:', err);
    res.status(500).json({ ok: false, msg: '文件解析失败: ' + err.message });
  }
});

module.exports = router;
