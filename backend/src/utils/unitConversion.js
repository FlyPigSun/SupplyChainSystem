/**
 * 单位换算模块
 * 统一处理重量/容积单位的标准化换算（kg/L）
 */

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

/**
 * 从规格字符串中提取重量（单位为 kg）
 * 支持格式："25kg"、"500g"、"10斤"、"25kg/箱"、"500g*20包" 等
 */
function extractWeightKg(spec) {
  if (!spec) return null;

  // 优先处理 "10kg*2袋/箱" 这种乘法规格（提取总重量）
  const multiMatch = String(spec).match(/(\d+(?:\.\d+)?)\s*kg\s*[*×]\s*(\d+)/i);
  if (multiMatch) {
    return Math.round(parseFloat(multiMatch[1]) * parseFloat(multiMatch[2]) * 10000) / 10000;
  }

  const match = String(spec).match(/(\d+(?:\.\d+)?)\s*(kg|克|g|斤|升|L|ml)/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const u = (match[2] || '').toLowerCase();

  let kgValue;
  if (u === 'kg') kgValue = value;
  else if (u === 'g' || u === '克') kgValue = value / 1000;
  else if (u === '斤') kgValue = value * 0.5;
  else if (u === 'l' || u === '升') kgValue = value;
  else if (u.startsWith('m')) kgValue = value / 1000;
  else return null;

  return Math.round(kgValue * 10000) / 10000;
}

/**
 * 将价格换算为标准单位（元/kg 或 元/L）
 * @returns {Object} { originalPrice, originalUnit, standardPrice, standardUnit, factor, source }
 */
function convertToStandardUnit(price, unit, spec) {
  if (price == null || price === 0) {
    return { price: price || null, unit: unit || null, standardPrice: null, standardUnit: null };
  }

  const u = (unit || '').trim();
  const factor = UNIT_CONVERSIONS[u] || UNIT_CONVERSIONS[unit] || null;

  if (factor !== null && factor !== undefined) {
    const stdUnit = (/^[ml]|毫升/i.test(u) ? 'L' : 'kg');
    const stdPrice = Math.round((price / factor) * 100) / 100;
    return { originalPrice: price, originalUnit: unit, standardPrice: stdPrice, standardUnit: stdUnit, factor };
  }

  // 非标准单位（箱/袋/桶等），尝试从规格提取重量
  const weightKg = extractWeightKg(spec);
  if (weightKg && weightKg > 0) {
    const stdPrice = Math.round((price / weightKg) * 100) / 100;
    return {
      originalPrice: price,
      originalUnit: unit || '-',
      standardPrice: stdPrice,
      standardUnit: 'kg',
      factor: weightKg,
      source: `规格 ${spec}`
    };
  }

  // 完全无法识别
  return { price, unit: unit || '-', standardPrice: price, standardUnit: unit || '-' };
}

/**
 * 从规格字符串解析重量（kg）
 * 支持："25kg*2"、"25kg"、"5L"、"500g/包" 等
 */
function parseSpecToKg(spec) {
  if (!spec) return null;
  const match1 = spec.match(/(\d+(?:\.\d+)?)\s*kg\s*\*\s*(\d+)/i);
  if (match1) return parseFloat(match1[1]) * parseFloat(match1[2]);
  const match2 = spec.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (match2) return parseFloat(match2[1]);
  const match3 = spec.match(/(\d+(?:\.\d+)?)\s*[Ll]/);
  if (match3) return parseFloat(match3[1]);
  const match4 = spec.match(/(\d+(?:\.\d+)?)\s*g(?:\s*[/×*])/i);
  if (match4) return parseFloat(match4[1]) / 1000;
  return null;
}

/**
 * 计算原料总用量对应的目标单位重量
 * @param {number} totalWeight - 总重量（g）
 * @param {number} pricePerUnit - 单价
 * @param {string} priceUnit - 价格单位
 * @param {string} spec - 规格描述
 * @returns {number} 目标单位的数量
 */
function calcWeightInPriceUnit(totalWeight, pricePerUnit, priceUnit, spec) {
  if (!pricePerUnit) return null;

  let weightInPriceUnit = totalWeight;

  // g → kg
  if (priceUnit === 'kg') {
    weightInPriceUnit = totalWeight / 1000;
  }
  // kg → g
  else if (priceUnit === 'g') {
    weightInPriceUnit = totalWeight * 1000;
  }
  // 包装单位（袋/箱/桶），从规格提取重量换算
  else if (['袋', '箱', '桶'].includes(priceUnit)) {
    const specKg = parseSpecToKg(spec);
    if (specKg) {
      weightInPriceUnit = (totalWeight / 1000) / specKg;
    } else {
      weightInPriceUnit = totalWeight / 1000;
    }
  }

  return weightInPriceUnit;
}

module.exports = {
  convertToStandardUnit,
  calcWeightInPriceUnit
};
