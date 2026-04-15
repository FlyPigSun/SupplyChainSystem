/**
 * 用量计算模板导入路由
 * 模板列：序号、产品名称、供应商、数量
 * 校验：产品名称和供应商必须与数据库完全一致
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const { queryAsync } = require('../utils/db');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 文件'));
    }
  }
});

/**
 * GET /api/calculator-import/template
 * 下载用量计算模板
 */
router.get('/template', authMiddleware, (req, res) => {
  const filePath = path.join(__dirname, '../../templates/calculator-template.xlsx');
  res.download(filePath, '用量计算模板.xlsx', (err) => {
    if (err) {
      console.error('模板下载失败:', err);
      res.status(404).json({ ok: false, msg: '模板文件不存在' });
    }
  });
});

/**
 * POST /api/calculator-import
 * 校验模板数据，返回校验结果和匹配的产品ID
 */
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, msg: '请上传文件' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ ok: false, msg: 'Excel 文件为空' });
    }

    // 获取数据库中所有产品（名称 → 产品信息映射）
    const dbProducts = await queryAsync('SELECT id, code, name, type FROM products');
    const productNameMap = {};
    dbProducts.forEach(p => {
      productNameMap[p.name] = p;
    });

    // 获取数据库中所有产品-供应商关系（产品名 → 供应商集合）
    const dbProductSuppliers = await queryAsync(
      `SELECT p.name as product_name, pm.supplier 
       FROM product_materials pm 
       JOIN products p ON pm.product_id = p.id 
       WHERE pm.supplier IS NOT NULL AND pm.supplier != ''`
    );
    const productSupplierMap = {};
    dbProductSuppliers.forEach(r => {
      if (!productSupplierMap[r.product_name]) {
        productSupplierMap[r.product_name] = new Set();
      }
      productSupplierMap[r.product_name].add(r.supplier);
    });

    // 校验每行数据
    const validItems = [];
    const errors = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // Excel 行号（第1行是表头）
      const productName = String(row['产品名称'] || '').trim();
      const supplier = String(row['供应商'] || '').trim();
      const quantity = parseInt(row['数量']) || 0;

      if (!productName) {
        errors.push({ row: rowNum, field: '产品名称', msg: '产品名称不能为空' });
        return;
      }
      if (!supplier) {
        errors.push({ row: rowNum, field: '供应商', msg: '供应商不能为空' });
        return;
      }
      if (quantity <= 0) {
        errors.push({ row: rowNum, field: '数量', msg: '数量必须大于0' });
        return;
      }

      // 校验产品名称
      const dbProduct = productNameMap[productName];
      if (!dbProduct) {
        // 找最接近的产品名称供用户参考
        const suggestions = dbProducts
          .map(p => p.name)
          .filter(name => name.includes(productName) || productName.includes(name))
          .slice(0, 3);
        errors.push({
          row: rowNum,
          field: '产品名称',
          msg: `数据库中不存在产品"${productName}"`,
          excelValue: productName,
          dbValue: suggestions.length > 0 ? `您是否指: ${suggestions.join('、')}` : '请检查产品名称是否与数据库完全一致'
        });
        return;
      }

      // 校验供应商
      const dbSuppliers = productSupplierMap[productName];
      if (!dbSuppliers || !dbSuppliers.has(supplier)) {
        const availableSuppliers = dbSuppliers ? [...dbSuppliers] : [];
        errors.push({
          row: rowNum,
          field: '供应商',
          msg: `产品"${productName}"下不存在供应商"${supplier}"`,
          excelValue: supplier,
          dbValue: availableSuppliers.length > 0 ? `数据库中的供应商: ${availableSuppliers.join('、')}` : '该产品下无供应商信息'
        });
        return;
      }

      validItems.push({
        productId: dbProduct.id,
        productCode: dbProduct.code,
        productName: dbProduct.name,
        productType: dbProduct.type,
        supplier,
        quantity
      });
    });

    // 按产品+供应商合并数量
    const mergedMap = {};
    validItems.forEach(item => {
      const key = `${item.productId}__${item.supplier}`;
      if (mergedMap[key]) {
        mergedMap[key].quantity += item.quantity;
      } else {
        mergedMap[key] = { ...item };
      }
    });
    const mergedItems = Object.values(mergedMap);

    res.json({
      ok: errors.length === 0,
      total: rows.length,
      validCount: mergedItems.length,
      errorCount: errors.length,
      errors,
      items: mergedItems
    });

  } catch (error) {
    console.error('用量计算模板导入失败:', error);
    res.status(500).json({ ok: false, msg: '导入失败: ' + error.message });
  }
});

module.exports = router;
