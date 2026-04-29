/**
 * BOM检查（成本核查）路由
 * 含价格匹配 + 修正记忆 + 成本占比预警 + 单位换算
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const { queryAsync } = require('../utils/db');
const { runAsync } = require('../utils/db');
const { matchPricesForAudit } = require('../utils/priceMatcher');

const router = express.Router();

// ========== 单位换算表 ==========
// 换算为 kg（重量）或 L（容积）的倍数
const UNIT_CONVERSIONS = {
  // 重量 → kg
  'kg': 1, '千克': 1, '公斤': 1,
  'g': 0.001, '克': 0.001,
  '斤': 0.5,
  '500g': 0.5, '250g': 0.25, '100g': 0.1, '50g': 0.05, '25g': 0.025, '10g': 0.01, '5g': 0.005,
  // 容积 → L
  'l': 1, 'L': 1, '升': 1,
  'ml': 0.001, '毫升': 0.001,
};

// 从规格字符串中提取重量（单位为 kg）
// 支持格式："25kg"、"500g"、"10斤"、"25kg/箱"、"500g*20包" 等
function extractWeightKg(spec) {
  if (!spec) return null;
  // 匹配数字+单位的模式
  const match = String(spec).match(/(\d+(?:\.\d+)?)\s*(kg|克|g|斤|升|L|ml)/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const u = (match[2] || '').toLowerCase();

  let kgValue;
  if (u === 'kg') kgValue = value;
  else if (u === 'g' || u === '克') kgValue = value / 1000;
  else if (u === '斤') kgValue = value * 0.5;
  else if (u === 'l' || u === '升') kgValue = value;   // 液体按体积等价
  else if (u.startsWith('m')) kgValue = value / 1000;   // ml
  else return null;

  return Math.round(kgValue * 10000) / 10000;
}

// 将价格换算为标准单位（元/kg 或 元/L）
function convertToStandardUnit(price, unit, spec) {
  if (price == null || price === 0) {
    return { price: price || null, unit: unit || null, standardPrice: null, standardUnit: null };
  }

  const u = (unit || '').trim();
  const factor = UNIT_CONVERSIONS[u] || UNIT_CONVERSIONS[unit] || null;

  if (factor !== null && factor !== undefined) {
    // 已知标准单位，直接换算
    const stdUnit = (/^[ml]|毫升/i.test(u) ? 'L' : 'kg');
    const stdPrice = Math.round((price / factor) * 1000000) / 1000000;
    return { originalPrice: price, originalUnit: unit, standardPrice: stdPrice, standardUnit: stdUnit, factor };
  }

  // 单位不是标准计量单位（如"箱"、"袋"、"桶"等），尝试从规格中提取重量
  const weightKg = extractWeightKg(spec);
  if (weightKg && weightKg > 0) {
    const stdPrice = Math.round((price / weightKg) * 1000000) / 1000000;
    return {
      originalPrice: price,
      originalUnit: unit || '-',
      standardPrice: stdPrice,
      standardUnit: 'kg',
      factor: weightKg,
      source: `规格 ${spec}`
    };
  }

  // 完全无法识别，返回原始值
  return { price, unit: unit || '-', standardPrice: price, standardUnit: unit || '-' };
}

// ========== 编码检测与修复 ==========

/**
 * 检测字符串是否可能是乱码（Mojibake）
 * 特征：包含大量 Latin-1 扩展字符（â, æ, é, ¹, è, ¼, « 等）但没有中文字符
 */
function looksLikeMojibake(str) {
  if (!str || typeof str !== 'string') return false;
  const latinExtended = (str.match(/[\u00c0-\u00ff]/g) || []).length;
  const chinese = (str.match(/[\u4e00-\u9fff]/g) || []).length;
  const total = str.length;
  // Latin 扩展字符 >3 个且完全没有中文，或占比超过 30%
  if (latinExtended > 3 && chinese === 0) return true;
  if (latinExtended > total * 0.3 && chinese < total * 0.1) return true;
  return false;
}

/**
 * 尝试修复 UTF-8 Mojibake：将字符串按 Latin-1 编码为字节后再用 UTF-8 解码
 */
function tryFixMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  try {
    const bytes = Buffer.from(str, 'binary');
    const fixed = bytes.toString('utf8');
    // 修复成功：包含中文且没有替换字符，且长度合理
    if (/[\u4e00-\u9fff]/.test(fixed) && !/\uFFFD/.test(fixed) && fixed.length <= str.length * 2) {
      return fixed;
    }
  } catch (e) {}
  return str;
}

/**
 * 从文件名提取产品名称（移除《日配》《周配》前缀和扩展名）
 */
function extractProductNameFromFileName(fileName) {
  if (!fileName) return '';
  return fileName
    .replace(/^《(日配|周配)》/, '')
    .replace(/\.xlsx?$/i, '')
    .trim();
}

/**
 * 清理并获取可靠的产品名称
 */
function sanitizeProductName(excelName, fileName) {
  const fromFile = extractProductNameFromFileName(fileName);
  if (!excelName) return fromFile;
  // 优先尝试修复编码
  const fixed = tryFixMojibake(excelName);
  if (fixed !== excelName && !looksLikeMojibake(fixed)) {
    return fixed;
  }
  // 如果仍像乱码，回退到文件名
  if (looksLikeMojibake(excelName)) {
    return fromFile;
  }
  return excelName || fromFile;
}

// 成本占比预警规则：每次请求时重新读取文件，修改后无需重启
function loadCostRules() {
  try {
    const rulesPath = path.join(__dirname, '..', 'config', 'cost-rules.json');
    const content = fs.readFileSync(rulesPath, 'utf-8');
    return JSON.parse(content).rules;
  } catch (err) {
    console.error('加载成本规则文件失败:', err.message);
    return [];
  }
}

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 或 .xls 文件'));
    }
  }
});

// 新模板列索引常量
const COL_NAME = 2;       // 原材料名称 (C列)
const COL_BRAND = 3;      // 品牌/型号 (D列)
const COL_WEIGHT = 4;     // 重量(g)/数量 (E列)
const COL_TAX_PRICE = 5;  // 含税单价 (F列)
const COL_EX_PRICE = 6;   // 不含税单价 (G列)
const COL_COST = 7;       // 金额 (H列)
const COL_PERCENT = 8;    // 百分比 (I列)

function parseNumOrNull(val) {
  if (val == null || val === '') return null;
  const str = String(val).trim();
  if (str === '' || str === '-' || str.includes('公式') || str.includes('一致') || str.startsWith('#')) return null;
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parsePercent(val) {
  if (val == null || val === '') return null;
  const str = String(val).trim();
  if (str === '' || str === '-' || str.startsWith('#')) return null;
  const n = parseFloat(str);
  if (isNaN(n)) return null;
  // Excel 百分比公式结果通常是小数（0~1），转换为百分比
  if (n > 0 && n < 1) return parseFloat((n * 100).toFixed(2));
  return parseFloat(n.toFixed(2));
}

// ========== 模板表头校验 ==========

// 将单元格值统一为字符串并清理
function cellStr(val) {
  if (val == null) return '';
  return String(val).trim().replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '');
}

// 检查一行中是否包含指定关键词（模糊匹配）
function rowHasKeywords(row, keywords) {
  const cells = row.map(cellStr);
  return keywords.map(kw => {
    const cleanKw = kw.replace(/\s+/g, '');
    return cells.some(c => c.includes(cleanKw));
  });
}

// 校验模板表头结构
// 返回 { valid: boolean, errors: string[], details: object }
function validateTemplateHeaders(rows) {
  const errors = [];
  const details = {
    productComposition: { found: false, rowIndex: -1, missing: [] },
    packaging: { found: false, rowIndex: -1, missing: [] },
    singleProduct: { found: false, rowIndex: -1, missing: [] },
    bomCost: { found: false, rowIndex: -1, missing: [] }
  };

  // 1. 产品组成区域表头校验
  // 需要包含：工艺、组成、原材料、品牌/型号、重量、含税单价、不含税单价、金额、百分比、备注
  const productCompKeywords = ['工艺', '组成', '原材料', '品牌', '型号', '重量', '含税单价', '不含税单价', '金额', '百分比', '备注'];
  let foundProductComp = false;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;
    const cell0 = cellStr(r[0]);
    // 跳过标题行和区域标记行
    if (cell0 === '产品组成' || cell0 === '成本核算') continue;
    const matches = rowHasKeywords(r, productCompKeywords);
    // 必须同时包含：工艺、组成、原材料
    const hasCraft = matches[0];      // 工艺
    const hasComp = matches[1];       // 组成
    const hasMaterial = matches[2];   // 原材料
    if (hasCraft && hasComp && hasMaterial) {
      foundProductComp = true;
      details.productComposition.found = true;
      details.productComposition.rowIndex = i;
      const requiredForProduct = ['工艺', '组成', '原材料', '重量', '含税单价', '不含税单价', '金额'];
      const requiredMatches = rowHasKeywords(r, requiredForProduct);
      const missing = requiredForProduct.filter((_, idx) => !requiredMatches[idx]);
      if (missing.length > 0) {
        details.productComposition.missing = missing;
        errors.push(`产品组成表头（第${i + 1}行）缺少必填字段：${missing.join('、')}`);
      }
      break;
    }
  }
  if (!foundProductComp) {
    details.productComposition.found = false;
    errors.push('未找到「产品组成」区域表头，请检查模板格式');
  }

  // 2. 单个产品包材组成区域表头校验
  // 需要包含：包材名称、数量、含税单价、不含税单价、金额、百分比、备注
  const packagingKeywords = ['包材名称', '数量', '含税单价', '不含税单价', '金额', '百分比', '备注'];
  let foundPackaging = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;
    const cell0 = cellStr(r[0]);
    // 跳过区域标记行
    if (cell0 === '单个产品包材组成') continue;
    // 如果当前行上方有"单个产品包材组成"标记，则检查
    let hasPackagingMarker = false;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (cellStr(rows[j][0]) === '单个产品包材组成') {
        hasPackagingMarker = true;
        break;
      }
    }
    if (!hasPackagingMarker) continue;

    const matches = rowHasKeywords(r, packagingKeywords);
    const hasName = matches[0];  // 包材名称
    if (hasName) {
      foundPackaging = true;
      details.packaging.found = true;
      details.packaging.rowIndex = i;
      const requiredForPackaging = ['包材名称', '数量', '金额'];
      const requiredMatches = rowHasKeywords(r, requiredForPackaging);
      const missing = requiredForPackaging.filter((_, idx) => !requiredMatches[idx]);
      if (missing.length > 0) {
        details.packaging.missing = missing;
        errors.push(`包材组成表头（第${i + 1}行）缺少必填字段：${missing.join('、')}`);
      }
      break;
    }
  }
  if (!foundPackaging) {
    details.packaging.found = false;
    errors.push('未找到「单个产品包材组成」区域表头，请检查模板格式');
  }

  // 3. 单个成品组成区域表头校验（该区域为汇总区域，仅做基本结构校验）
  // 需要包含：工艺分项、组成、不含税单价、金额、百分比、备注
  const singleProductKeywords = ['工艺分项', '组成', '不含税单价', '金额', '百分比', '备注'];
  let foundSingleProduct = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;
    const cell0 = cellStr(r[0]);
    if (cell0 === '单个成品组成') continue;
    let hasMarker = false;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (cellStr(rows[j][0]) === '单个成品组成') {
        hasMarker = true;
        break;
      }
    }
    if (!hasMarker) continue;

    const matches = rowHasKeywords(r, singleProductKeywords);
    const hasCraft = matches[0];  // 工艺分项
    const hasComp = matches[1];   // 组成
    if (hasCraft || hasComp) {
      foundSingleProduct = true;
      details.singleProduct.found = true;
      details.singleProduct.rowIndex = i;
      break;
    }
  }
  // 单个成品组成是可选的汇总区域，找不到不报错

  // 4. BOM成本合计区域表头校验
  // 需要包含：项目、金额、百分比、备注
  const bomCostKeywords = ['项目', '金额', '百分比', '备注'];
  let foundBomCost = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;
    const cell0 = cellStr(r[0]);
    if (cell0 === 'BOM成本合计') continue;
    let hasMarker = false;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (cellStr(rows[j][0]) === 'BOM成本合计') {
        hasMarker = true;
        break;
      }
    }
    if (!hasMarker) continue;

    const matches = rowHasKeywords(r, bomCostKeywords);
    const hasItem = matches[0];   // 项目
    const hasAmount = matches[1]; // 金额
    if (hasItem && hasAmount) {
      foundBomCost = true;
      details.bomCost.found = true;
      details.bomCost.rowIndex = i;
      const requiredForBom = ['项目', '金额'];
      const requiredMatches = rowHasKeywords(r, requiredForBom);
      const missing = requiredForBom.filter((_, idx) => !requiredMatches[idx]);
      if (missing.length > 0) {
        details.bomCost.missing = missing;
        errors.push(`BOM成本合计表头（第${i + 1}行）缺少必填字段：${missing.join('、')}`);
      }
      break;
    }
  }
  if (!foundBomCost) {
    details.bomCost.found = false;
    errors.push('未找到「BOM成本合计」区域表头，请检查模板格式');
  }

  return {
    valid: errors.length === 0,
    errors,
    details
  };
}

// ========== 模板数据非空校验 ==========

// 判断单元格是否为空（null, undefined, 空字符串, 公式错误）
function isEmptyCell(val) {
  if (val == null || val === undefined) return true;
  const str = String(val).trim();
  if (str === '' || str === '-' || str.startsWith('#')) return true;
  return false;
}

// 判断单元格是否有值（非空）
function hasValue(val) {
  return !isEmptyCell(val);
}

// 校验模板数据非空
// headerDetails 是 validateTemplateHeaders 返回的 details
function validateTemplateData(rows, headerDetails) {
  const errors = [];

  // ========== 合法性校验辅助函数 ==========

  // 解析数字（支持字符串数字、百分比等）
  function parseNumberValue(val) {
    if (val == null || val === undefined) return null;
    const str = String(val).trim();
    if (str === '' || str === '-' || str.startsWith('#')) return null;
    // 去掉可能的分隔符（如千分位逗号）
    const cleaned = str.replace(/,/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  // 解析百分比（支持 "95%"、0.95、95 等格式）
  function parsePercentValue(val) {
    if (val == null || val === undefined) return null;
    const str = String(val).trim();
    if (str === '' || str === '-' || str.startsWith('#')) return null;
    // 去掉可能的分隔符
    const cleaned = str.replace(/,/g, '');
    // 含百分号
    if (cleaned.includes('%')) {
      const numStr = cleaned.replace(/%/g, '');
      const n = parseFloat(numStr);
      return isNaN(n) ? null : n;
    }
    // 纯数字（可能是小数 0.95 或整数 95）
    const n = parseFloat(cleaned);
    if (isNaN(n)) return null;
    // 如果值在 0~1 之间，可能是小数形式的百分比，转换为百分数
    if (n > 0 && n < 1) return parseFloat((n * 100).toFixed(4));
    return n;
  }

  // 检查数值范围
  function checkRange(val, min, max, fieldName, rowNum, prefix) {
    const n = parseNumberValue(val);
    if (n === null) return false; // 为空，不在这里报（由非空校验处理）
    if (min !== null && n < min) {
      errors.push(`${prefix}第${rowNum}行「${fieldName}」必须 ≥ ${min}，当前值为 ${n}`);
      return false;
    }
    if (max !== null && n > max) {
      errors.push(`${prefix}第${rowNum}行「${fieldName}」必须 ≤ ${max}，当前值为 ${n}`);
      return false;
    }
    return true;
  }

  // 检查金额公式：金额 ≈ 重量(g) × 含税单价(元/kg) / 1000
  function checkAmountFormula(weight, taxPrice, amount, rowNum, prefix) {
    const w = parseNumberValue(weight);
    const p = parseNumberValue(taxPrice);
    const a = parseNumberValue(amount);
    if (w === null || p === null || a === null) return; // 有空值，不检查公式

    // 重量必须 > 0 才能检查公式
    if (w <= 0) return;

    // 金额为0时跳过公式校验（用户允许金额为0，如免费样品）
    if (a === 0) return;

    const expected = w * p / 1000;
    const absDiff = Math.abs(a - expected);
    const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : (a !== 0 ? 1 : 0);

    // 允许微小误差：绝对误差 ≤ 0.05 或 相对误差 ≤ 5%
    const ABS_TOLERANCE = 0.05;
    const REL_TOLERANCE = 0.05;

    if (absDiff > ABS_TOLERANCE && relDiff > REL_TOLERANCE) {
      errors.push(
        `${prefix}第${rowNum}行「金额」公式异常：金额=${a.toFixed(4)}，但 重量×含税单价/1000=${expected.toFixed(4)}，` +
        `相差 ${absDiff.toFixed(4)}（${(relDiff * 100).toFixed(1)}%）`
      );
    }
  }

  // 检查百分比范围
  function checkPercentRange(val, fieldName, rowNum, prefix) {
    const n = parsePercentValue(val);
    if (n === null) return false;
    if (n < 0 || n > 100) {
      errors.push(`${prefix}第${rowNum}行「${fieldName}」百分比必须在 0~100 之间，当前值为 ${n}`);
      return false;
    }
    return true;
  }

  // 辅助：收集某行指定列的非空字段名
  function getNonEmptyFields(row, colMap) {
    const nonEmpty = [];
    for (const [field, colIdx] of Object.entries(colMap)) {
      if (hasValue(row[colIdx])) nonEmpty.push(field);
    }
    return nonEmpty;
  }

  // 辅助：检查某行指定列是否全部非空
  function checkAllNonEmpty(row, colMap) {
    const missing = [];
    for (const [field, colIdx] of Object.entries(colMap)) {
      if (isEmptyCell(row[colIdx])) missing.push(field);
    }
    return missing;
  }

  // ========== 1. 产品组成数据校验 ==========
  if (headerDetails.productComposition.found) {
    const startIdx = headerDetails.productComposition.rowIndex + 1;
    let endIdx = rows.length;
    if (headerDetails.packaging.found) {
      endIdx = headerDetails.packaging.rowIndex;
    }

    const fieldMap = {
      '原料名': COL_NAME,
      '重量': COL_WEIGHT,
      '含税价': COL_TAX_PRICE,
      '不含税价': COL_EX_PRICE,
      '金额': COL_COST
    };

    for (let i = startIdx; i < endIdx && i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const cell0 = String(r[0] || '').trim();
      const cell1 = String(r[1] || '').trim();
      const cellName = String(r[COL_NAME] || '').trim();

      // 跳过区域标题
      if (cell0 === '单个产品包材组成') break;
      // 跳过汇总行
      if (['加总', '每克成本', '原料成本', '合计'].includes(cell1)) continue;
      if (['胚体成本', '成型成本', '冷加工成本', '包材成本', '成品合计'].includes(cell0)) continue;
      // 跳过分节行（col1 有分节名且 col2 原料名为空）
      if (cell1 && !cellName && !['组成', '原材料', '原料'].includes(cell1)) continue;
      // 跳过表头行
      if (cell1 === '组成' && cell0 === '工艺') continue;

      const nonEmpty = getNonEmptyFields(r, fieldMap);
      // 排除仅金额为0的空行（模板预留行常见情况）
      const isEmptyRow = nonEmpty.length === 0 || (nonEmpty.length === 1 && nonEmpty[0] === '金额' && (parseFloat(r[COL_COST]) || 0) === 0);
      if (isEmptyRow) continue;

      // (a) 非空校验
      const missing = checkAllNonEmpty(r, fieldMap);
      if (missing.length > 0) {
        errors.push(`产品组成第${i + 1}行数据不完整，缺少：${missing.join('、')}`);
        continue; // 有空值，跳过合法性校验
      }

      // (b) 合法性校验
      checkRange(r[COL_WEIGHT], 0, null, '重量', i + 1, '产品组成'); // >0
      checkRange(r[COL_TAX_PRICE], 0, null, '含税单价', i + 1, '产品组成'); // ≥0
      checkRange(r[COL_EX_PRICE], 0, null, '不含税单价', i + 1, '产品组成'); // ≥0
      // 金额公式校验
      checkAmountFormula(r[COL_WEIGHT], r[COL_TAX_PRICE], r[COL_COST], i + 1, '产品组成');
    }
  }

  // ========== 2. 单个产品包材组成数据校验 ==========
  if (headerDetails.packaging.found) {
    const startIdx = headerDetails.packaging.rowIndex + 1;
    let endIdx = rows.length;
    if (headerDetails.singleProduct.found) {
      endIdx = headerDetails.singleProduct.rowIndex;
    }

    const fieldMap = {
      '包材名称': 0,
      '数量': COL_WEIGHT,
      '含税单价': COL_TAX_PRICE,
      '不含税单价': COL_EX_PRICE,
      '金额': COL_COST,
      '百分比': COL_PERCENT
    };

    for (let i = startIdx; i < endIdx && i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const cell0 = String(r[0] || '').trim();
      // 跳过区域标题、汇总行
      if (cell0 === '单个产品包材成本' || cell0 === '单个成品组成') break;
      if (cell0 === '包材名称') continue; // 表头行

      const nonEmpty = getNonEmptyFields(r, fieldMap);
      if (nonEmpty.length === 0) continue;

      // (a) 非空校验
      const missing = checkAllNonEmpty(r, fieldMap);
      if (missing.length > 0) {
        errors.push(`包材组成第${i + 1}行数据不完整，缺少：${missing.join('、')}`);
        continue;
      }

      // (b) 合法性校验
      checkRange(r[COL_WEIGHT], 0, null, '数量', i + 1, '包材组成'); // >0
      checkRange(r[COL_TAX_PRICE], 0, null, '含税单价', i + 1, '包材组成'); // ≥0
      checkRange(r[COL_EX_PRICE], 0, null, '不含税单价', i + 1, '包材组成'); // ≥0
      checkPercentRange(r[COL_PERCENT], '百分比', i + 1, '包材组成');
      // 金额公式校验（包材也用同样的公式：数量 × 含税单价 / 1000）
      checkAmountFormula(r[COL_WEIGHT], r[COL_TAX_PRICE], r[COL_COST], i + 1, '包材组成');
    }
  }

  // ========== 3. 单个成品组成数据校验 ==========
  if (headerDetails.singleProduct.found) {
    const startIdx = headerDetails.singleProduct.rowIndex + 1;
    let endIdx = rows.length;
    if (headerDetails.bomCost.found) {
      endIdx = headerDetails.bomCost.rowIndex;
    }

    const fieldMap = {
      '工艺分项': 0,
      '组成': COL_WEIGHT,
      '不含税单价': COL_EX_PRICE,
      '金额': COL_COST,
      '百分比': COL_PERCENT
    };

    for (let i = startIdx; i < endIdx && i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const cell0 = String(r[0] || '').trim();
      // 跳过区域标题
      if (cell0 === 'BOM成本合计') break;
      if (cell0 === '工艺分项') continue; // 表头行

      const nonEmpty = getNonEmptyFields(r, fieldMap);
      if (nonEmpty.length === 0) continue;

      // (a) 非空校验
      const missing = checkAllNonEmpty(r, fieldMap);
      if (missing.length > 0) {
        errors.push(`单个成品组成第${i + 1}行数据不完整，缺少：${missing.join('、')}`);
        continue;
      }

      // (b) 合法性校验
      checkRange(r[COL_WEIGHT], 0, null, '组成', i + 1, '单个成品组成'); // >0
      checkRange(r[COL_EX_PRICE], 0, null, '不含税单价', i + 1, '单个成品组成'); // ≥0
      checkPercentRange(r[COL_PERCENT], '百分比', i + 1, '单个成品组成');
    }
  }

  // ========== 4. BOM成本合计特定行校验 ==========
  if (headerDetails.bomCost.found) {
    const startIdx = headerDetails.bomCost.rowIndex + 1;
    let endIdx = rows.length;
    // 找到产品名称行作为结束
    for (let i = startIdx; i < rows.length; i++) {
      const cell0 = String(rows[i][0] || '').trim();
      if (cell0.includes('产品名称')) {
        endIdx = i;
        break;
      }
    }

    // 定义必填项及其匹配关键词（支持模糊匹配）
    const requiredItems = [
      { name: '成品合计', keywords: ['成品合计'] },
      { name: '人工费用', keywords: ['人工费用', '人工'] },
      { name: '水电费用', keywords: ['水电费用', '水电'] },
      { name: '物流费用', keywords: ['物流费用', '物流'] },
      { name: '税收', keywords: ['税收', '税'] },
      { name: '折旧费用', keywords: ['折旧费用', '折旧'] },
      { name: '管理费用', keywords: ['管理费用', '管理'] },
      { name: '利润费用', keywords: ['利润费用', '利润'] },
      { name: '房租费用', keywords: ['房租费用', '房租'] },
      { name: '合计成本', keywords: ['合计成本', '成本合计'] }
    ];

    for (let i = startIdx; i < endIdx && i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const itemName = String(r[0] || '').trim();
      if (!itemName || itemName === '项目') continue;

      const matchedItem = requiredItems.find(req => req.keywords.some(kw => itemName.includes(kw)));
      if (matchedItem) {
        const missing = [];
        if (isEmptyCell(r[COL_COST])) missing.push('金额');
        if (isEmptyCell(r[COL_PERCENT])) missing.push('百分比');
        if (missing.length > 0) {
          errors.push(`BOM成本合计「${matchedItem.name}」${missing.join('、')}不能为空`);
          continue;
        }

        // 合法性校验
        checkRange(r[COL_COST], null, null, '金额', i + 1, 'BOM成本合计'); // 仅检查是否为数字
        checkPercentRange(r[COL_PERCENT], '百分比', i + 1, 'BOM成本合计');
      }
    }
  }

  // ========== 5. 产品信息校验 ==========
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const cell0 = String(r[0] || '').trim();
    if (cell0.includes('产品名称')) {
      // (a) 非空校验
      if (isEmptyCell(r[COL_NAME])) {
        errors.push('产品名称不能为空');
      }
      if (isEmptyCell(r[COL_TAX_PRICE])) {
        errors.push('出成率不能为空');
      }
      if (isEmptyCell(r[COL_COST])) {
        errors.push('实际出厂价不能为空');
      }
      if (isEmptyCell(r[9])) {
        errors.push('净含量不能为空');
      }

      // (b) 合法性校验
      const yieldRateVal = parsePercentValue(r[COL_TAX_PRICE]);
      if (yieldRateVal !== null && (yieldRateVal < 0 || yieldRateVal > 100)) {
        errors.push(`出成率必须在 0~100 之间，当前值为 ${yieldRateVal}`);
      }
      const factoryPriceVal = parseNumberValue(r[COL_COST]);
      if (factoryPriceVal !== null && factoryPriceVal < 0) {
        errors.push(`实际出厂价必须 ≥ 0，当前值为 ${factoryPriceVal}`);
      }
      const netWeightVal = parseNumberValue(r[9]);
      if (netWeightVal !== null && netWeightVal <= 0) {
        errors.push(`净含量必须 > 0，当前值为 ${netWeightVal}`);
      }
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function parseAuditSheet(rows) {
  const materials = [];
  const costBreakdown = {};  // 成本组成：{ 食材成本: 2.735629, 人工费用: 0.6712, ... }
  const costRows = [];       // 成本组成原始行数据（按顺序，供前端展示）
  let currentSection = '';
  let productName = '';
  let productWeight = 0;
  let yieldRate = null;      // 出成率
  let factoryPrice = null;   // 实际出厂价
  let netWeight = null;      // 净含量
  let totalPrice = 0;        // 抹零合计
  let inCostSection = false; // 是否进入BOM成本合计区域
  let inPackagingSection = false; // 是否进入包材区域
  let skipSection = false;   // 是否跳过当前区域（如单个成品组成）

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cell0 = String(r[0] || '').trim();
    const cell1 = String(r[1] || '').trim();
    const cellName = String(r[COL_NAME] || '').trim();

    if (cell0 === '成本核算') continue;
    if (cell0 === '产品组成') continue;
    if (cell1 === '原材料' || cell1 === '原料') continue;

    // 识别包材区域
    if (cell0 === '单个产品包材组成') {
      inPackagingSection = true;
      currentSection = '包材';
      inCostSection = false;
      skipSection = false;
      continue;
    }

    // 识别成本组成区域
    if (cell0 === 'BOM成本合计') {
      inCostSection = true;
      inPackagingSection = false;
      skipSection = false;
      currentSection = '';
      continue;
    }

    // 识别需要跳过的汇总区域
    if (cell0 === '单个成品组成' || cell0 === '单个产品包材成本') {
      inPackagingSection = false;
      inCostSection = false;
      skipSection = true;
      currentSection = '';
      continue;
    }

    // 识别分节（动态：col1 有值、col2 为空、不是汇总/表头关键字）
    const isSummaryKeyword = ['合计', '每克成本', '组成'].includes(cell1);
    if (cell1 && !cellName && !isSummaryKeyword && !inPackagingSection && !inCostSection && !skipSection) {
      currentSection = cell1;
      inPackagingSection = false;
      inCostSection = false;
      skipSection = false;
      continue;
    }

    // 提取品名和新增字段
    if (cell0.includes('产品名称')) {
      productName = cellName;  // col2
      yieldRate = parseNumOrNull(r[5]);     // col5 出成率
      factoryPrice = parseNumOrNull(r[7]);  // col7 实际出厂价
      netWeight = parseNumOrNull(r[9]);     // col9 净含量
      continue;
    }

    // 跳过汇总行和表头行
    if (['加总', '每克成本', '包材成本', '原料成本', '合计'].includes(cell1)) continue;
    if (['加总', '每克成本', '工艺分项', '项目'].includes(cell0)) continue;
    if (['胚体成本', '成型成本', '冷加工成本', '包材成本', '成品合计'].includes(cell0)) continue;

    // 提取成本组成原始数据（BOM成本合计区域）
    if (inCostSection) {
      const costName = cell0;  // col0 = 费用名称
      const costAmountRaw = r[COL_COST];
      const costAmount = parseFloat(costAmountRaw);
      const costPercent = parsePercent(r[COL_PERCENT]);
      // 收集所有有费用名称的行（包括空值），用于前端展示
      if (costName && !costName.includes('BOM') && costName !== '项目') {
        costRows.push({
          name: costName,
          amount: isNaN(costAmount) ? null : costAmount,
          rawValue: costAmountRaw !== undefined ? String(costAmountRaw).trim() : '',
          percent: costPercent,
        });
        // 同时构建 costBreakdown 对象（仅有效数值）
        if (!isNaN(costAmount)) {
          costBreakdown[costName] = costAmount;
        }
      }
      continue;
    }

    // 跳过非原料区域
    if (skipSection) continue;

    // 提取原料/包材数据
    let name, brandSpec, weightG, taxPrice, exTaxPrice, cost, percent;

    if (inPackagingSection) {
      // 包材区域：名称在 col0，无品牌/型号列
      name = cell0;
      brandSpec = '';
      weightG = parseFloat(r[COL_WEIGHT]) || 0;
      taxPrice = parseFloat(r[COL_TAX_PRICE]) || 0;
      exTaxPrice = parseFloat(r[COL_EX_PRICE]) || 0;
      cost = parseFloat(r[COL_COST]) || 0;
      percent = parsePercent(r[COL_PERCENT]);
    } else {
      // 普通原料区域
      name = cellName;
      brandSpec = String(r[COL_BRAND] || '').trim();
      weightG = parseFloat(r[COL_WEIGHT]) || 0;
      taxPrice = parseFloat(r[COL_TAX_PRICE]) || 0;
      exTaxPrice = parseFloat(r[COL_EX_PRICE]) || 0;
      cost = parseFloat(r[COL_COST]) || 0;
      percent = parsePercent(r[COL_PERCENT]);
    }

    if (name && weightG > 0) {
      materials.push({
        section: currentSection,
        name,
        brandSpec,
        weightG,
        taxPrice,
        exTaxPrice,
        cost,
        percent,
        isPackaging: inPackagingSection
      });
    }
  }

  // 提取抹零合计作为占比计算基数
  totalPrice = costBreakdown['抹零合计'] || costBreakdown['合计成本'] || 0;

  // 用净含量作为产品重量
  if (netWeight && netWeight > 0) {
    productWeight = netWeight;
  }

  return {
    materials,
    productName,
    productWeight,
    yieldRate,
    factoryPrice,
    netWeight,
    costBreakdown,
    costRows,
    totalPrice
  };
}

async function runBomCheck(rows, fileName) {
  // 先进行表头结构校验
  const headerValidation = validateTemplateHeaders(rows);
  if (!headerValidation.valid) {
    return {
      productName: fileName,
      productWeight: 0,
      yieldRate: null,
      factoryPrice: null,
      netWeight: null,
      matchedProductCount: 0,
      matchedProducts: [],
      auditMaterialCount: 0,
      auditSections: [],
      systemMaterialCount: 0,
      formulaDiffCount: 0,
      priceDiffCount: 0,
      fuzzyCount: 0,
      flavorDiffCount: 0,
      noPriceCount: 0,
      correctedCount: 0,
      formulaDiffs: [],
      priceDiffs: [],
      costBreakdown: {},
      costRows: [],
      totalPrice: 0,
      costItems: [],
      costWarnings: headerValidation.errors.map(msg => ({ type: 'error', message: msg })),
      _validationErrors: headerValidation.errors,
      _validationDetails: headerValidation.details
    };
  }

  // 表头校验通过后，进行数据非空校验
  const dataValidation = validateTemplateData(rows, headerValidation.details);
  if (!dataValidation.valid) {
    return {
      productName: fileName,
      productWeight: 0,
      yieldRate: null,
      factoryPrice: null,
      netWeight: null,
      matchedProductCount: 0,
      matchedProducts: [],
      auditMaterialCount: 0,
      auditSections: [],
      systemMaterialCount: 0,
      formulaDiffCount: 0,
      priceDiffCount: 0,
      fuzzyCount: 0,
      flavorDiffCount: 0,
      noPriceCount: 0,
      correctedCount: 0,
      formulaDiffs: [],
      priceDiffs: [],
      costBreakdown: {},
      costRows: [],
      totalPrice: 0,
      costItems: [],
      costWarnings: dataValidation.errors.map(msg => ({ type: 'error', message: msg })),
      _validationErrors: dataValidation.errors,
      _validationDetails: headerValidation.details
    };
  }

  const {
    materials: auditMaterials,
    productName: excelProductName,
    productWeight,
    yieldRate,
    factoryPrice,
    netWeight,
    costBreakdown,
    costRows,
    totalPrice
  } = parseAuditSheet(rows);

  // 修复可能的编码乱码问题
  const productName = sanitizeProductName(excelProductName, fileName);
  const hasEncodingIssue = looksLikeMojibake(excelProductName);

  // ===== 成本占比预警（支持占比区间 + 金额绝对值区间） =====
  const costWarnings = [];
  const costItems = [];
  if (totalPrice > 0 || costRows.length > 0) {
    const rules = loadCostRules();
    for (const rule of rules) {
      // 在 costBreakdown 中查找匹配的费用项
      let matchedKey = null;
      let matchedValue = null;
      for (const [key, val] of Object.entries(costBreakdown)) {
        if (rule.keywords.some(kw => key.includes(kw))) {
          matchedKey = key;
          matchedValue = val;
          break;
        }
      }
      const percent = matchedValue !== null && totalPrice > 0 ? (matchedValue / totalPrice * 100) : null;

      // 构建费用项详情
      const item = {
        id: rule.id,
        label: rule.label,
        excelKey: matchedKey || '-',
        amount: matchedValue,
        percent: percent !== null ? parseFloat(percent.toFixed(2)) : null,
        // 前端展示用（min/max 别名）
        min: rule.minPercent ?? rule.min,
        max: rule.maxPercent ?? rule.max,
        // 原始值（用于预警判断和前端参考）
        minPercent: rule.minPercent ?? rule.min,
        maxPercent: rule.maxPercent ?? rule.max,
        minAmount: rule.minAmount ?? null,
        maxAmount: rule.maxAmount ?? null,
        status: 'ok'
      };

      // 检查占比规则
      let pctWarning = false;
      let pctMsg = '';
      if (percent !== null) {
        const pctMin = rule.minPercent ?? rule.min;
        const pctMax = rule.maxPercent ?? rule.max;
        const minOk = pctMin === null || percent >= pctMin;
        const maxOk = pctMax === null || percent <= pctMax;
        if (!minOk || !maxOk) {
          pctWarning = true;
          pctMsg = `${rule.message}，实际 ${percent.toFixed(1)}%`;
          if (!minOk) pctMsg += `（低于下限 ${pctMin}%）`;
          else if (maxOk !== true && maxOk === false) pctMsg += `（超过上限 ${pctMax}%）`;
        }
      }

      // 检查金额绝对值规则
      let amtWarning = false;
      let amtMsg = '';
      if (matchedValue !== null) {
        const amtMin = rule.minAmount;
        const amtMax = rule.maxAmount;
        if (amtMin !== undefined && amtMin !== null && matchedValue < amtMin) {
          amtWarning = true;
          amtMsg = `${rule.label}金额 ${matchedValue.toFixed(4)} 低于下限 ${amtMin}`;
        }
        if (amtMax !== undefined && amtMax !== null && matchedValue > amtMax) {
          amtWarning = true;
          amtMsg = `${rule.label}金额 ${matchedValue.toFixed(4)} 超过上限 ${amtMax}`;
        }
      }

      // 综合判断状态
      if (pctWarning || amtWarning) {
        item.status = 'warning';
        costWarnings.push({
          id: rule.id,
          label: rule.label,
          amount: matchedValue,
          percent: percent !== null ? parseFloat(percent.toFixed(1)) : null,
          message: pctMsg || amtMsg
        });
      } else if (percent === null && matchedValue === null) {
        // 费用项在 Excel 中未找到
        const pctMin = rule.minPercent ?? rule.min;
        if (pctMin !== null && pctMin > 0) {
          item.status = 'missing';
          costWarnings.push({ id: rule.id, label: rule.label, percent: null, message: `未找到"${rule.label}"数据` });
        }
      }

      costItems.push(item);
    }
  }

  let matchedProducts = await queryAsync('SELECT id, code, name FROM products WHERE name = ?', [productName]);
  if (matchedProducts.length === 0) {
    const name2 = productName.replace(/^《日配》/, '').replace(/^《周配》/, '').trim();
    matchedProducts = await queryAsync('SELECT id, code, name FROM products WHERE name LIKE ? OR name LIKE ?', [`%${name2}%`, `%${productName}%`]);
  }

  let systemMaterials = [];
  if (matchedProducts.length > 0) {
    const ids = matchedProducts.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    systemMaterials = await queryAsync(
      `SELECT pm.*, p.name as product_name, p.code as product_code
       FROM product_materials pm JOIN products p ON pm.product_id = p.id
       WHERE p.id IN (${placeholders})`, ids
    );
  }

  const formulaDiffs = [];
  const doughMaterials = auditMaterials.filter(m => m.section === '面团' || m.section === '');
  doughMaterials.forEach(am => {
    const sysRec = systemMaterials.find(r =>
      (r.unified_name && (r.unified_name === am.name || r.unified_name.includes(am.name) || am.name.includes(r.unified_name))) ||
      (r.material_name && (r.material_name === am.name || r.material_name.includes(am.name) || am.name.includes(r.material_name)))
    );
    if (!sysRec) {
      formulaDiffs.push({ name: am.name, brandSpec: am.brandSpec, auditWeightG: am.weightG, sysWeightG: null, status: 'missing' });
    } else {
      const sysWeightG = sysRec.weight || 0;
      const weightDiff = Math.abs(am.weightG - sysWeightG);
      formulaDiffs.push({ name: am.name, brandSpec: am.brandSpec, auditWeightG: am.weightG, sysWeightG, weightDiff, status: weightDiff > 0.5 ? 'diff' : 'ok' });
    }
  });
  systemMaterials.forEach(r => {
    const found = doughMaterials.find(am =>
      (r.unified_name && (r.unified_name === am.name || r.unified_name.includes(am.name) || am.name.includes(r.unified_name))) ||
      (r.material_name && (r.material_name === am.name || r.material_name.includes(am.name) || am.name.includes(r.material_name)))
    );
    if (!found) {
      formulaDiffs.push({ name: r.unified_name || r.material_name, brandSpec: r.brand_spec || '', auditWeightG: null, sysWeightG: r.weight || 0, status: 'extra' });
    }
  });

  // ===== 价格差异核查（含修正记忆） =====
  const priceRecords = await queryAsync('SELECT * FROM material_prices');

  // 加载所有修正记录
  const corrections = await queryAsync(`
    SELECT mc.source_name, mc.source_brand_spec, mc.source_supplier, mc.target_price_id,
           mp.material_name as target_name, mp.brand as target_brand, mp.model as target_model,
           mp.price as target_price, mp.unit as target_unit, mp.supplier as target_supplier,
           mp.spec as target_spec, mp.category as target_category
    FROM match_corrections mc LEFT JOIN material_prices mp ON mc.target_price_id = mp.id
  `);
  const correctionMap = {};
  for (const c of corrections) {
    const key = `${c.source_name}||${c.source_brand_spec || ''}||${c.source_supplier || ''}`;
    correctionMap[key] = c;
  }

  const matchResults = matchPricesForAudit(auditMaterials, priceRecords);

  const priceDiffs = matchResults.map(mr => {
    const am = mr.auditMaterial;
    // 查找人工修正（成本核查场景 source_supplier 为空）
    const correctionKey = `${am.name}||${am.brandSpec || ''}||`;
    const correction = correctionMap[correctionKey];

    let priceInfo = mr.priceInfo;
    let matchType = mr.matchType;
    let matchDetail = mr.matchDetail;
    let warnings = [...(mr.warnings || [])];
    let corrected = false;

    if (correction && correction.target_price_id) {
      const correctedPrice = priceRecords.find(p => p.id === correction.target_price_id);
      if (correctedPrice) {
        priceInfo = correctedPrice;
        matchType = 'corrected';
        matchDetail = `人工修正: ${am.name}${am.brandSpec ? '(' + am.brandSpec + ')' : ''} → ${correctedPrice.brand || ''} ${correctedPrice.model || ''}`;
        warnings = [];
        corrected = true;
      }
    }

    if (!priceInfo) {
      return {
        name: am.name, brandSpec: am.brandSpec, section: am.section,
        auditTaxPrice: am.taxPrice, auditExTaxPrice: am.exTaxPrice,
        auditStdPrice: parseFloat((am.taxPrice || am.exTaxPrice || 0).toFixed(4)),
        sysPrice: null, sysSpec: null, sysBrand: null, sysModel: null,
        sysUnit: null,
        sysStandardPrice: null, sysStandardUnit: null,
        originalSysUnit: null,
        unitFactor: null,
        unitSource: null,
        diff: null, diffPercent: null, matchType: null, matchDetail: mr.matchDetail,
        warnings: [], status: 'noprice', corrected: false,
        percent: am.percent
      };
    }

    const sysPrice = priceInfo.price;
    const sysUnit = priceInfo.unit;
    const sysSpec = priceInfo.spec || '';

    // 价格为 null 或 0 时视为无效，直接返回无价格状态
    if (sysPrice == null || sysPrice === 0) {
      return {
        name: am.name, brandSpec: am.brandSpec, section: am.section,
        auditTaxPrice: am.taxPrice, auditExTaxPrice: am.exTaxPrice,
        auditStdPrice: parseFloat((am.taxPrice || am.exTaxPrice || 0).toFixed(4)),
        sysPrice: null, sysSpec, sysBrand: null, sysModel: null,
        sysUnit: sysUnit || '-',
        sysStandardPrice: null, sysStandardUnit: null,
        originalSysUnit: sysUnit || null,
        unitFactor: null,
        unitSource: null,
        diff: null, diffPercent: null, matchType: mr.matchType, matchDetail: mr.matchDetail,
        warnings: mr.warnings || [], status: 'noprice', corrected,
        percent: am.percent
      };
    }

    // 单位换算：将系统价格统一为 元/kg 或 元/L
    // 对于"箱"、"袋"等包装单位，从规格中提取重量换算
    const converted = convertToStandardUnit(sysPrice, sysUnit, sysSpec);
    // 差异对比使用含税价（与核查表含税价一致）
    const auditTaxPriceForDiff = am.taxPrice || am.exTaxPrice || 0;

    // 用换算后的标准价格与核查表含税价比较
    const standardSysPrice = converted.standardPrice !== null ? converted.standardPrice : sysPrice;
    const diff = Math.abs(auditTaxPriceForDiff - standardSysPrice);
    const hasDiff = diff > 0.5;
    const diffPercent = auditTaxPriceForDiff > 0 ? ((diff / auditTaxPriceForDiff) * 100).toFixed(1) : null;

    let status = 'ok';
    if (corrected) {
      status = hasDiff ? 'diff' : 'ok';
    } else if (hasDiff && matchType !== 'fuzzy' && matchType !== 'flavor_diff') {
      status = 'diff';
    } else if (matchType === 'fuzzy') {
      status = 'fuzzy';
    } else if (matchType === 'flavor_diff') {
      status = 'flavor_diff';
    }

    return {
      name: am.name, brandSpec: am.brandSpec, section: am.section,
      auditTaxPrice: am.taxPrice, auditExTaxPrice: am.exTaxPrice,
      auditStdPrice: parseFloat(auditTaxPriceForDiff.toFixed(4)),
      sysPrice, sysSpec: priceInfo.spec || '',
      sysBrand: priceInfo.brand || '', sysModel: priceInfo.model || '',
      sysUnit: sysUnit,
      sysStandardPrice: standardSysPrice,
      sysStandardUnit: converted.standardUnit || sysUnit,
      originalSysUnit: converted.originalUnit,
      unitFactor: converted.factor || null,
      unitSource: converted.source || null,
      diff, diffPercent, matchType, matchDetail, warnings, status, corrected,
      percent: am.percent
    };
  });

  const formulaDiffCount = formulaDiffs.filter(d => d.status !== 'ok').length;
  const priceDiffCount = priceDiffs.filter(d => d.status === 'diff').length;
  const fuzzyCount = priceDiffs.filter(d => d.matchType === 'fuzzy').length;
  const flavorDiffCount = priceDiffs.filter(d => d.matchType === 'flavor_diff').length;
  const noPriceCount = priceDiffs.filter(d => d.status === 'noprice').length;
  const correctedCount = priceDiffs.filter(d => d.corrected).length;

  return {
    productName, productWeight,
    yieldRate,
    factoryPrice,
    netWeight,
    matchedProductCount: matchedProducts.length,
    matchedProducts: matchedProducts.map(p => ({ code: p.code, name: p.name })),
    auditMaterialCount: auditMaterials.length,
    auditSections: [...new Set(auditMaterials.map(m => m.section))].filter(Boolean),
    systemMaterialCount: systemMaterials.length,
    formulaDiffCount, priceDiffCount, fuzzyCount, flavorDiffCount, noPriceCount, correctedCount,
    formulaDiffs, priceDiffs,
    costBreakdown, costRows, totalPrice, costItems, costWarnings,
    _encodingIssue: hasEncodingIssue
  };
}

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, msg: '请上传文件' });

    const fileName = req.body.productName || req.file.originalname.replace(/\.xlsx?$/i, '').trim();
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    const result = await runBomCheck(rows, fileName);

    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'bom_check', `成本核查: ${result.productName}, 配方差异${result.formulaDiffCount}项, 价格差异${result.priceDiffCount}项`]
    );

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('BOM检查失败:', error);
    res.status(500).json({ ok: false, msg: '检查失败: ' + error.message });
  }
});

module.exports = router;
