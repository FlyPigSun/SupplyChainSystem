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
    const { page = 1, pageSize = 20, keyword = '', sortBy = '', sortOrder = 'asc' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    const params = [];
    let where = '';
    if (keyword) {
      where = 'WHERE (product_code LIKE ? OR product_name LIKE ? OR ingredient LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    // 排序字段映射
    const sortFieldMap = {
      'supplier': 'supplier',
      'type': 'product_type',
      'level1Count': 'level1_count',
      'totalCount': 'total_count'
    };
    const orderField = sortFieldMap[sortBy] || 'product_code';
    const orderDir = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    
    // 先查产品列表（含配料数量统计）
    const productSql = `SELECT DISTINCT product_code as code, product_name as name, product_type as type, supplier,
      (SELECT COUNT(*) FROM product_labels pl2 WHERE pl2.product_code = pl.product_code AND pl2.level = 1) as level1_count,
      (SELECT COUNT(*) FROM product_labels pl2 WHERE pl2.product_code = pl.product_code) as total_count
      FROM product_labels pl ${where} ORDER BY ${orderField} ${orderDir} LIMIT ? OFFSET ?`;
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
    
    // 构建层级配料字符串（有二级配料的一级原料加粗，含括号的二级配料名称加粗但括号内容不加粗）
    function buildIngredientStr(items) {
      const level1 = items.filter(i => i.level === 1);
      return level1.map(l1 => {
        const children = items.filter(i => i.level === 2 && i.parent === l1.name);
        if (children.length > 0) {
          const childStr = children.map(c => {
            // 含括号的二级配料：名称加粗，括号内容不加粗
            const parenIdx = c.name.search(/[（(]/);
            if (parenIdx > 0) {
              const name = c.name.substring(0, parenIdx);
              const rest = c.name.substring(parenIdx);
              return `<strong>${name}</strong>${rest}`;
            }
            return c.name;
          }).join('、');
          return `<strong>${l1.name}</strong>（${childStr}）`;
        }
        return l1.name;
      }).join('、');
    }
    
    res.json({ ok: true, data: products.map(p => {
      const items = ingredientMap[p.code] || [];
      return {
        code: p.code, name: p.name, type: p.type, supplier: p.supplier,
        ingredients: buildIngredientStr(items),
        level1Count: p.level1_count,
        totalCount: p.total_count
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

// 按顿号/逗号分隔，但跳过括号内的分隔符（处理嵌套括号）
function splitRespectingParens(str) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '（') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === '）') {
      depth--;
      current += ch;
    } else if (depth === 0 && /[、,，]/.test(ch)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// 解析配料层级：复配膨松剂(焦磷酸二氢二钠、碳酸氢钠) → 一级+二级
// 支持全角/半角括号，正确处理嵌套括号，排除含量标注和单一成分说明
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
  
  // 判断括号内是否是含量标注（如 ≥4%、＞4%、≥10%、添加量≥23%、≥80克/份 等）
  const isContentMarker = /^(添加量)?[≥＞><≤≈≥]?\d+(\.\d+)?[%％克\/份]*$/.test(inner.replace(/\s/g, ''));
  
  // 判断括号内是否含分隔符（顿号/逗号），有分隔符才拆分为二级配料
  const hasSeparator = /[、,，]/.test(inner);
  
  if (isContentMarker || !hasSeparator) {
    // 含量标注或单一成分说明：整体作为一级配料，不拆分
    result.push({ name: str, level: 1, parent: null });
  } else {
    // 按顿号分隔，但跳过括号内的分隔符（处理嵌套括号）
    const parts = splitRespectingParens(inner);
    
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
    
    result.push({ name: main, level: 1, parent: null });
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
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) return res.status(400).json({ ok: false, msg: 'Excel为空' });
    
    // 按产品分组，解析配料
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
    
    // 删除 Excel 中涵盖的产品，重新插入
    const codes = Object.keys(pm);
    await runAsync(`DELETE FROM product_labels WHERE product_code IN (${codes.map(() => '?').join(',')})`, codes);
    
    let total = 0, errors = [];
    for (const code of codes) {
      const p = pm[code];
      try {
        for (const i of p.ingredients) {
          await runAsync('INSERT INTO product_labels (product_code,product_name,product_type,supplier,ingredient,level,parent_ingredient) VALUES (?,?,?,?,?,?,?)', [code, p.name, p.type, p.supplier, i.name, i.level, i.parent]);
        }
        total++;
      } catch (e) { errors.push({ code, error: e.message }); }
    }
    
    await runAsync('INSERT INTO operation_logs (operator,action,detail) VALUES (?,?,?)', [req.user.username, 'import_product_labels', `${total}产品导入,${errors.length}错误`]);
    res.json({ ok: true, total, errorCount: errors.length, errors: errors.slice(0, 10) });
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
