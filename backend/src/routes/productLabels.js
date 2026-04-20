const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// 查询列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    const params = [];
    let where = '';
    if (keyword) {
      where = 'WHERE (product_code LIKE ? OR product_name LIKE ? OR ingredient LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    // 先查产品列表
    const productSql = `SELECT DISTINCT product_code as code, product_name as name, product_type as type, supplier
      FROM product_labels ${where} ORDER BY product_code LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(DISTINCT product_code) as total FROM product_labels ${where}`;
    const [products, cnt] = await Promise.all([queryAsync(productSql, [...params, limit, offset]), getAsync(countSql, params)]);
    
    // 查每个产品的配料详情，构建层级字符串
    const codes = products.map(p => p.code);
    let ingredientMap = {};
    if (codes.length > 0) {
      const placeholders = codes.map(() => '?').join(',');
      const rows = await queryAsync(`SELECT * FROM product_labels WHERE product_code IN (${placeholders}) ORDER BY id`, codes);
      rows.forEach(r => {
        if (!ingredientMap[r.product_code]) ingredientMap[r.product_code] = [];
        ingredientMap[r.product_code].push({ name: r.ingredient, level: r.level, parent: r.parent_ingredient });
      });
    }
    
    // 构建层级配料字符串
    function buildIngredientStr(items) {
      const level1 = items.filter(i => i.level === 1);
      return level1.map(l1 => {
        const children = items.filter(i => i.level === 2 && i.parent === l1.name);
        if (children.length > 0) {
          return `${l1.name}（${children.map(c => c.name).join('、')}）`;
        }
        return l1.name;
      }).join('、');
    }
    
    res.json({ ok: true, data: products.map(p => {
      const items = ingredientMap[p.code] || [];
      return {
        code: p.code, name: p.name, type: p.type, supplier: p.supplier,
        ingredients: buildIngredientStr(items),
        level1Count: items.filter(i => i.level === 1).length,
        totalCount: items.length
      };
    }), pagination: { page: parseInt(page), pageSize: limit, total: cnt?.total || 0 } });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// 配料详情
router.get('/detail/:code', authMiddleware, async (req, res) => {
  try {
    const rows = await queryAsync('SELECT * FROM product_labels WHERE product_code = ? ORDER BY level, id', [req.params.code]);
    if (!rows.length) return res.status(404).json({ ok: false, msg: '未找到' });
    res.json({ ok: true, data: { code: rows[0].product_code, name: rows[0].product_name, type: rows[0].product_type, supplier: rows[0].supplier, ingredients: rows.map(r => ({ id: r.id, name: r.ingredient, level: r.level, parent: r.parent_ingredient })) } });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// 解析配料层级：复配膨松剂(焦磷酸二氢二钠、碳酸氢钠) → 一级+二级
// 支持全角/半角括号，正确处理嵌套括号，排除含量标注
function parseIngredient(str) {
  const result = [];
  str = str.trim();
  
  // 找到第一个开括号的位置
  const openIdx = str.search(/[(（]/);
  if (openIdx === -1) {
    result.push({ name: str, level: 1, parent: null });
    return result;
  }
  
  const main = str.substring(0, openIdx).trim();
  
  // 找到配对的闭括号（处理嵌套）
  let depth = 0;
  let closeIdx = -1;
  const openChar = str[openIdx];
  const closeChar = openChar === '(' ? ')' : '）';
  
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(' || str[i] === '（') depth++;
    else if (str[i] === ')' || str[i] === '）') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  
  if (closeIdx === -1) {
    // 没找到配对的闭括号，当作一级配料
    result.push({ name: str, level: 1, parent: null });
    return result;
  }
  
  const inner = str.substring(openIdx + 1, closeIdx).trim();
  result.push({ name: main, level: 1, parent: null });
  
  // 判断括号内是否是含量标注（如 ≥4%、＞4%、≥10% 等）
  const isContentMarker = /^[≥＞<≤≈≥]?\d+[%％]?$/.test(inner.replace(/\s/g, ''));
  
  if (!isContentMarker) {
    // 按顿号分隔，但要注意：
    // 1. 分隔后可能还有残留括号（如 "牛奶调味粉（复合调味料"）
    // 2. 有些配料名本身就包含顿号，如"单、双甘油脂肪酸酯"不应拆分
    const parts = inner.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    
    // 合并不应该拆分的配料（如"单"、"双甘油脂肪酸酯" → "单、双甘油脂肪酸酯"）
    const merged = [];
    for (let i = 0; i < parts.length; i++) {
      const curr = parts[i];
      const next = parts[i + 1];
      
      // 如果当前部分是"单"或"双"，且下一部分包含"甘油"、"酸"、"酯"等，则合并
      if ((curr === '单' || curr === '双') && next && /^(甘油|.*酸|.*酯)/.test(next)) {
        merged.push(curr + '、' + next);
        i++; // 跳过下一项
      } else {
        merged.push(curr);
      }
    }
    
    merged.forEach(sub => {
      // 清理残留的不完整括号（如末尾的"（复合调味料"）
      const cleaned = sub.replace(/[（(][^)）]*$/, '').trim();
      if (cleaned) result.push({ name: cleaned, level: 2, parent: main });
    });
  }
  
  return result;
}

// 导入
router.post('/import', authMiddleware, adminMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, msg: '请上传文件' });
    const mode = req.body.mode || 'upsert';
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) return res.status(400).json({ ok: false, msg: 'Excel为空' });
    const pm = {};
    rows.forEach(r => {
      const code = String(r['物品编码'] || '').trim(), ing = String(r['配料'] || '').trim();
      if (!code || !ing) return;
      if (!pm[code]) pm[code] = { code, name: String(r['品名'] || '').trim(), type: String(r['产品类别'] || '').trim(), supplier: String(r['生产工厂名称'] || '').trim(), ingredients: [] };
      pm[code].ingredients.push(...parseIngredient(ing));
    });
    // 去重：同一产品内，(ingredient, level) 相同的只保留第一个
    for (const code of Object.keys(pm)) {
      const seen = new Set();
      pm[code].ingredients = pm[code].ingredients.filter(i => {
        const key = `${i.level}|${i.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    let created = 0, updated = 0, skipped = 0, errors = [];
    for (const code of Object.keys(pm)) {
      const p = pm[code];
      try {
        const ex = await getAsync('SELECT COUNT(*) as c FROM product_labels WHERE product_code = ?', [code]);
        if (ex.c > 0) {
          if (mode === 'upsert') { await runAsync('DELETE FROM product_labels WHERE product_code = ?', [code]); for (const i of p.ingredients) await runAsync('INSERT INTO product_labels (product_code,product_name,product_type,supplier,ingredient,level,parent_ingredient) VALUES (?,?,?,?,?,?,?)', [code, p.name, p.type, p.supplier, i.name, i.level, i.parent]); updated++; }
          else skipped++;
        } else { for (const i of p.ingredients) await runAsync('INSERT INTO product_labels (product_code,product_name,product_type,supplier,ingredient,level,parent_ingredient) VALUES (?,?,?,?,?,?,?)', [code, p.name, p.type, p.supplier, i.name, i.level, i.parent]); created++; }
      } catch (e) { errors.push({ code, error: e.message }); }
    }
    await runAsync('INSERT INTO operation_logs (operator,action,detail) VALUES (?,?,?)', [req.user.username, 'import_product_labels', `${created}新增,${updated}更新,${skipped}跳过,${errors.length}错误`]);
    res.json({ ok: true, total: Object.keys(pm).length, created, updated, skipped, errorCount: errors.length, errors: errors.slice(0, 10) });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// 导出
router.get('/export', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { keyword = '' } = req.query;
    let where = '', params = [];
    if (keyword) { where = 'WHERE (product_code LIKE ? OR product_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    const rows = await queryAsync(`SELECT product_code,product_name,product_type,supplier,ingredient,level,parent_ingredient FROM product_labels ${where} ORDER BY product_code,level,id`, params);
    const data = rows.map(r => ({ '物品编码': r.product_code, '品名': r.product_name, '产品类别': r.product_type, '生产工厂名称': r.supplier, '配料': r.ingredient, '层级': r.level, '上级配料': r.parent_ingredient || '' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '配料表');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=product_labels.xlsx');
    res.send(buf);
    await runAsync('INSERT INTO operation_logs (operator,action,detail) VALUES (?,?,?)', [req.user.username, 'export_product_labels', `导出${rows.length}条`]).catch(() => {});
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// 下载模板
router.get('/template', authMiddleware, (req, res) => {
  const data = [{ '物品编码': 'SP001', '品名': '示例产品', '产品类别': '面包', '生产工厂名称': '示例工厂', '配料': '小麦粉' }, { '物品编码': 'SP001', '品名': '示例产品', '产品类别': '面包', '生产工厂名称': '示例工厂', '配料': '复配膨松剂(焦磷酸二氢二钠、碳酸氢钠)' }];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '配料表模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=product_labels_template.xlsx');
  res.send(buf);
});

module.exports = router;
