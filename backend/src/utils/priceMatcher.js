/**
 * 价格匹配引擎
 * 
 * 匹配规则（优先级从高到低）：
 * 1. 精确匹配：配方原料有 brand+supplier，价格库 brand+supplier 完全一致
 * 2. 品牌+型号匹配：配方原料名称包含品牌和型号（如"牛佰仕黄油25kg"），价格库 brand+model 匹配
 * 3. 供应商+型号匹配：配方 supplier+unified_name 匹配价格库 supplier+model
 * 4. 模糊匹配：仅型号(model)匹配但品牌不同，标记为"非同一品牌，仅供参考"
 * 
 * 模糊匹配条件：型号必须≥2个字符，且不是通用词（如"水"、"盐"等）
 */

// 通用词列表 - 太短的通用名称不进行模糊匹配
const GENERIC_WORDS = ['水', '盐', '油', '糖', '粉', '奶', '酱', '蛋', '面', '肉', '酒', '醋', '茶'];

// 常见口味关键词
const FLAVOR_KEYWORDS = [
  '咸蛋黄', '奶酪', '酸奶', '巧克力', '豆乳', '原味', '草莓', '蓝莓', '芒果',
  '抹茶', '香草', '焦糖', '柠檬', '芝士', '榴莲', '椰子', '紫薯', '红糖',
  '蜂蜜', '黑糖', '白桃', '葡萄', '橙子', '苹果', '香蕉', '菠萝', '蔓越莓'
];

/**
 * 从原料名称中尝试拆解出品牌和型号
 * 例如："牛佰仕黄油25kg" → { brand: "牛佰仕", model: "黄油" }
 * 例如："贝一35可丝达酱(奶酪味)" → { brand: "贝一", model: "35可丝达酱(奶酪味)" }
 * 注意：只去掉末尾的明确规格标注（如"25kg/箱"），保留型号中的数字
 */
function extractBrandAndModel(materialName, knownBrands) {
  if (!materialName) return null;
  
  const name = materialName.trim();
  
  // 遍历已知品牌列表，看原料名称是否以某个品牌开头
  for (const brand of knownBrands) {
    if (name.startsWith(brand)) {
      let remaining = name.slice(brand.length).trim();
      if (remaining) {
        // 只去掉末尾明确的规格后缀（如 "/25kg"、"25kg/箱"、" 25kg"等）
        // 注意：保留型号中间的数字（如 "35可丝达酱" 中的 35）
        remaining = remaining.replace(/[\/\s]\d+(\.\d+)?\s*(kg|g|ml|L|升|克|千克)(\/\S*)?$/i, '').trim();
        if (remaining) {
          return { brand, model: remaining };
        }
      }
    }
  }
  
  // 品牌在后：如 "黄油牛佰仕" → brand=牛佰仕, model=黄油
  for (const brand of knownBrands) {
    if (name.endsWith(brand) && name.length > brand.length) {
      let remaining = name.slice(0, name.length - brand.length).trim();
      if (remaining) {
        remaining = remaining.replace(/[\/\s]\d+(\.\d+)?\s*(kg|g|ml|L|升|克|千克)(\/\S*)?$/i, '').trim();
        if (remaining) {
          return { brand, model: remaining };
        }
      }
    }
  }
  
  return null;
}

/**
 * 规范化名称：去掉括号内容和常见后缀，便于模糊匹配
 * 例如："35可丝达酱(咸蛋黄味)YWTT" → "35可丝达酱"
 * 例如："巴氏杀菌全蛋液" → "巴氏杀菌全蛋液"
 */
function normalize(name) {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')   // 去掉括号及其内容
    .replace(/YWTT/gi, '')                // 去掉常见后缀码
    .replace(/\s+/g, '')                  // 去掉空格
    .trim();
}

/**
 * 提取核心关键词
 * 例如："35可丝达咸蛋黄酱" → ["可丝达", "咸蛋黄", "酱"]
 * 例如："巴氏杀菌全蛋液" → ["巴氏杀菌", "蛋液"]
 */
function extractKeywords(name) {
  const norm = normalize(name);
  const keywords = [];
  // 按常见分隔符拆分
  const parts = norm.split(/[，、,/\s]+/).filter(p => p.length >= 2);
  keywords.push(...parts);
  // 如果没有分隔，尝试提取2-4字的片段
  if (parts.length <= 1 && norm.length >= 4) {
    for (let len = Math.min(norm.length, 4); len >= 2; len--) {
      for (let i = 0; i <= norm.length - len; i++) {
        const seg = norm.slice(i, i + len);
        if (!keywords.includes(seg) && seg.length >= 2) {
          keywords.push(seg);
        }
      }
    }
  }
  return keywords;
}

/**
 * 判断是否为字母+数字的型号编码（如 YF042, MS01T）
 * 这类编码不应做模糊匹配（YF042 ≠ YF052）
 */
function isAlphanumericCode(name) {
  return /^[A-Za-z]+\d+[A-Za-z]*$/.test(name.trim());
}

/**
 * 计算两个字符串的包含相似度
 * 要求：
 * - 短字符串长度≥2
 * - 短字符串不是通用词
 * - 长字符串包含短字符串，或两者完全相同
 * - 同时对规范化后的字符串也做检查
 * - 关键词匹配：两者有足够多的共同关键词
 * - 字母+数字编码不做模糊匹配（YF042 ≠ YF052）
 */
function isSimilar(a, b) {
  if (!a || !b) return false;
  const sa = a.trim().toLowerCase();
  const sb = b.trim().toLowerCase();
  
  if (sa === sb) return true;
  
  // 字母+数字编码精确匹配，不做模糊
  if (isAlphanumericCode(sa) || isAlphanumericCode(sb)) {
    return sa === sb;
  }
  
  // 规范化后再比较
  const na = normalize(sa);
  const nb = normalize(sb);
  if (na === nb) return true;
  
  // 规范化后的编码也不做模糊
  if (isAlphanumericCode(na) || isAlphanumericCode(nb)) {
    return na === nb;
  }
  
  // 找出较短的（原始和规范化都试）
  for (const [shorter, longer] of [[sa, sb], [sb, sa], [na, nb], [nb, na]]) {
    if (shorter.length < 2) continue;
    if (GENERIC_WORDS.includes(shorter)) continue;
    if (longer.includes(shorter)) return true;
  }
  
  // 关键词匹配：计算共同关键词的覆盖率
  const kwA = extractKeywords(na);
  const kwB = extractKeywords(nb);
  if (kwA.length > 0 && kwB.length > 0) {
    const commonCount = kwA.filter(ka => kwB.some(kb => kb.includes(ka) || ka.includes(kb))).length;
    const coverage = commonCount / Math.min(kwA.length, kwB.length);
    // 覆盖率≥0.6且共同关键词≥2个
    if (coverage >= 0.6 && commonCount >= 2) return true;
  }
  
  return false;
}

/**
 * 检测口味差异
 * @param {string} auditDesc - 核算表中的描述（原料名+品牌规格）
 * @param {string} priceModel - 价格库中的型号
 * @returns {Object} { hasFlavorDiff, auditFlavor, priceFlavor }
 */
function detectFlavorDiff(auditDesc, priceModel) {
  const auditNorm = normalize(auditDesc || '');
  const priceNorm = normalize(priceModel || '');
  
  let auditFlavors = [];
  let priceFlavors = [];
  
  for (const flavor of FLAVOR_KEYWORDS) {
    if (auditNorm.includes(flavor)) auditFlavors.push(flavor);
    if (priceNorm.includes(flavor)) priceFlavors.push(flavor);
  }
  
  // 一方有口味另一方没有，或者口味不一致
  const hasDiff = (auditFlavors.length > 0 || priceFlavors.length > 0) && 
    JSON.stringify(auditFlavors.sort()) !== JSON.stringify(priceFlavors.sort());
  
  return {
    hasFlavorDiff: hasDiff,
    auditFlavor: auditFlavors.join('、'),
    priceFlavor: priceFlavors.join('、')
  };
}

/**
 * 为配方原料匹配价格（用量计算场景）
 * @param {Object} material - 配方原料 { material_name, unified_name, brand, supplier, brand_spec }
 * @param {Array} prices - 价格库列表 [{ id, material_name, brand, model, supplier, price, unit, spec, category }]
 * @param {Array} knownBrands - 已知品牌列表（从价格库提取）
 * @returns {Object} { priceInfo, matchType, matchDetail }
 *   matchType: 'exact' | 'brand_model' | 'supplier_model' | 'fuzzy' | null(未匹配)
 */
function matchPrice(material, prices, knownBrands) {
  const matName = (material.material_name || '').trim();
  const matBrand = (material.brand || '').trim();
  const matSupplier = (material.supplier || '').trim();
  const matUnifiedName = (material.unified_name || '').trim();
  const matBrandSpec = (material.brand_spec || '').trim();

  // ===== 优先级1：精确匹配（brand + supplier 完全一致） =====
  if (matBrand && matSupplier) {
    const exact = prices.find(p =>
      p.brand === matBrand && p.supplier === matSupplier
    );
    if (exact) {
      return {
        priceInfo: exact,
        matchType: 'exact',
        matchDetail: `品牌+供应商精确匹配: ${matBrand} / ${matSupplier}`
      };
    }
  }

  // ===== 优先级2：品牌+型号匹配 =====
  // 如果原料已有 brand，从 material_name 中去掉 brand 前缀获取 model
  let brandToMatch = matBrand;
  let modelToMatch = matUnifiedName || matName;
  
  if (matBrand && matName.startsWith(matBrand)) {
    // 原料名以品牌开头，提取剩余部分作为 model
    let remaining = matName.slice(matBrand.length).trim();
    // 去掉末尾规格
    remaining = remaining.replace(/[\/\s]\d+(\.\d+)?\s*(kg|g|ml|L|升|克|千克)(\/\S*)?$/i, '').trim();
    if (remaining) {
      modelToMatch = remaining;
    }
  } else if (!matBrand) {
    // 没有品牌，尝试从名称中提取
    const extracted = extractBrandAndModel(matName, knownBrands);
    if (extracted) {
      brandToMatch = extracted.brand;
      modelToMatch = extracted.model;
    }
  }

  if (brandToMatch && modelToMatch) {
    // 先尝试 brand+model 精确匹配
    const brandModel = prices.find(p =>
      p.brand === brandToMatch && p.model === modelToMatch
    );
    if (brandModel) {
      return {
        priceInfo: brandModel,
        matchType: 'brand_model',
        matchDetail: `品牌+型号匹配: ${brandToMatch} / ${modelToMatch}`
      };
    }

    // 尝试 brand 相同 + model 相似匹配
    const brandSimilar = prices.find(p =>
      p.brand === brandToMatch && isSimilar(p.model, modelToMatch)
    );
    if (brandSimilar) {
      return {
        priceInfo: brandSimilar,
        matchType: 'brand_model',
        matchDetail: `品牌+型号相似匹配: ${brandToMatch} / ${brandSimilar.model} ≈ ${modelToMatch}`
      };
    }
  }

  // ===== 优先级3：供应商+型号匹配 =====
  if (matSupplier && modelToMatch) {
    // 从原料的供应商和统一名称匹配
    const supplierModel = prices.find(p =>
      p.supplier === matSupplier && isSimilar(p.model, modelToMatch)
    );
    if (supplierModel) {
      if (brandToMatch && supplierModel.brand !== brandToMatch) {
        // 供应商匹配但品牌不同 → 模糊匹配
        return {
          priceInfo: supplierModel,
          matchType: 'fuzzy',
          matchDetail: `供应商+型号匹配但品牌不同: 价格库品牌"${supplierModel.brand}" ≠ 原料品牌"${brandToMatch}"`
        };
      }
      return {
        priceInfo: supplierModel,
        matchType: 'supplier_model',
        matchDetail: `供应商+型号匹配: ${matSupplier} / ${supplierModel.model}`
      };
    }
  }

  // ===== 优先级4：仅型号模糊匹配（品牌不同） =====
  if (modelToMatch) {
    const fuzzyByModel = prices.find(p => isSimilar(p.model, modelToMatch));
    if (fuzzyByModel) {
      // 确认品牌确实不同
      if (!brandToMatch || fuzzyByModel.brand !== brandToMatch) {
        return {
          priceInfo: fuzzyByModel,
          matchType: 'fuzzy',
          matchDetail: `仅型号匹配，品牌不同: 价格库"${fuzzyByModel.brand}" ≠ 原料"${brandToMatch || '未知'}"，仅供参考`
        };
      }
      // 品牌也相同，视为精确匹配
      return {
        priceInfo: fuzzyByModel,
        matchType: 'brand_model',
        matchDetail: `型号相似匹配: ${fuzzyByModel.brand} / ${fuzzyByModel.model} ≈ ${modelToMatch}`
      };
    }
  }

  // ===== 优先级5：brand_spec 包含匹配 =====
  if (matBrandSpec) {
    const specBrand = knownBrands.find(b => matBrandSpec.startsWith(b));
    if (specBrand) {
      const specModel = matBrandSpec.slice(specBrand.length).trim();
      if (specModel) {
        const specMatch = prices.find(p =>
          p.brand === specBrand && isSimilar(p.model, specModel)
        );
        if (specMatch) {
          return {
            priceInfo: specMatch,
            matchType: 'brand_model',
            matchDetail: `品牌规格匹配: ${specBrand} / ${specModel}`
          };
        }
      }
    }
  }

  return { priceInfo: null, matchType: null, matchDetail: '未找到匹配价格' };
}

/**
 * 成本核查专用匹配函数
 * 
 * 与 matchPrice 不同，成本核查场景中：
 * - 输入来自 Excel 的原料名称 + 品牌规格（不是结构化的配方数据）
 * - 需要检测口味差异
 * - 需要更细粒度的匹配提示
 * 
 * @param {string} materialName - 核算表中的原料名称（如"黄油"、"可丝达酱"）
 * @param {string} brandSpec - 核算表中的品牌/规格（如"牛佰仕"、"贝一35"）
 * @param {Array} prices - 价格库列表
 * @param {Array} knownBrands - 已知品牌列表
 * @returns {Object} { priceInfo, matchType, matchDetail, warnings }
 *   matchType: 'exact' | 'brand_model' | 'model_similar' | 'flavor_diff' | 'fuzzy' | null
 *   warnings: 提示信息数组
 */
function matchPriceForAudit(materialName, brandSpec, prices, knownBrands) {
  const name = (materialName || '').trim();
  const spec = (brandSpec || '').trim();
  const warnings = [];
  
  // 组合完整描述用于匹配
  const fullDesc = spec ? `${spec}${name}` : name; // 如 "牛佰仕黄油"
  
  // 从完整描述中尝试提取品牌+型号
  let extractedBrand = '';
  let extractedModel = name;
  
  // 1. 从 brandSpec 中提取品牌
  if (spec) {
    const specBrand = knownBrands.find(b => spec.startsWith(b) || spec.endsWith(b));
    if (specBrand) {
      extractedBrand = specBrand;
      // 品牌后面的部分可能包含型号信息
      let specRemain = spec.startsWith(specBrand) 
        ? spec.slice(specBrand.length).trim()
        : spec.slice(0, spec.length - specBrand.length).trim();
      // 去掉规格后缀
      specRemain = specRemain.replace(/\d+(\.\d+)?\s*(kg|g|ml|L|升|克|千克)(\/\S*)?$/i, '').trim();
      if (specRemain) {
        extractedModel = specRemain + name; // 如 "35可丝达酱"
      }
    } else {
      // 品牌规格不是已知品牌，可能是型号描述（如"清透水牛奶"是型号而非品牌）
      // 尝试直接用品牌规格匹配价格库的 model
      const specAsModel = prices.find(p =>
        p.model === spec || normalize(p.model) === normalize(spec) || isSimilar(p.model, spec)
      );
      if (specAsModel) {
        extractedBrand = specAsModel.brand;
        extractedModel = specAsModel.model;
      } else {
        // 也组合原料名尝试匹配
        extractedModel = spec + name;
      }
    }
  }
  
  // 2. 从原料名称中提取品牌（品牌在前或品牌在后）
  if (!extractedBrand) {
    const extracted = extractBrandAndModel(name, knownBrands);
    if (extracted) {
      extractedBrand = extracted.brand;
      extractedModel = extracted.model;
    }
  }
  
  // ===== 优先级1：品牌+型号精确匹配 =====
  if (extractedBrand) {
    // 品牌相同 + 型号精确匹配
    const exactMatch = prices.find(p =>
      p.brand === extractedBrand && (p.model === extractedModel || normalize(p.model) === normalize(extractedModel))
    );
    if (exactMatch) {
      // 检查口味差异
      const flavorDiff = detectFlavorDiff(fullDesc, exactMatch.model);
      if (flavorDiff.hasFlavorDiff) {
        warnings.push(`口味不一致: 核算表[${flavorDiff.auditFlavor || '未标注'}] vs 原料库[${flavorDiff.priceFlavor}]`);
        return {
          priceInfo: exactMatch,
          matchType: 'flavor_diff',
          matchDetail: `品牌匹配但口味不同: ${extractedBrand} / ${exactMatch.model}`,
          warnings
        };
      }
      return {
        priceInfo: exactMatch,
        matchType: 'exact',
        matchDetail: `品牌+型号精确匹配: ${extractedBrand} / ${exactMatch.model}`,
        warnings
      };
    }
    
    // 品牌相同 + 型号相似匹配
    const similarMatch = prices.find(p =>
      p.brand === extractedBrand && isSimilar(p.model, extractedModel)
    );
    if (similarMatch) {
      // 检查口味差异
      const flavorDiff = detectFlavorDiff(fullDesc, similarMatch.model);
      if (flavorDiff.hasFlavorDiff) {
        warnings.push(`口味不一致: 核算表[${flavorDiff.auditFlavor || '未标注'}] vs 原料库[${flavorDiff.priceFlavor}]`);
        return {
          priceInfo: similarMatch,
          matchType: 'flavor_diff',
          matchDetail: `品牌匹配但口味不同: ${extractedBrand} / ${similarMatch.model}`,
          warnings
        };
      }
      return {
        priceInfo: similarMatch,
        matchType: 'brand_model',
        matchDetail: `品牌+型号相似匹配: ${extractedBrand} / ${similarMatch.model} ≈ ${extractedModel}`,
        warnings
      };
    }
  }
  
  // ===== 优先级2：品牌匹配但型号不完全一致（品牌下有多个型号） =====
  if (extractedBrand) {
    const brandMatches = prices.filter(p => p.brand === extractedBrand);
    if (brandMatches.length === 1) {
      // 品牌下只有一个型号，直接匹配
      const onlyMatch = brandMatches[0];
      const flavorDiff = detectFlavorDiff(fullDesc, onlyMatch.model);
      if (flavorDiff.hasFlavorDiff) {
        warnings.push(`口味不一致: 核算表[${flavorDiff.auditFlavor || '未标注'}] vs 原料库[${flavorDiff.priceFlavor}]`);
        return {
          priceInfo: onlyMatch,
          matchType: 'flavor_diff',
          matchDetail: `品牌匹配但口味不同: ${extractedBrand} / ${onlyMatch.model}`,
          warnings
        };
      }
      return {
        priceInfo: onlyMatch,
        matchType: 'brand_model',
        matchDetail: `品牌唯一型号匹配: ${extractedBrand} / ${onlyMatch.model}`,
        warnings
      };
    }
    if (brandMatches.length > 1) {
      // 品牌下有多个型号，找最相似的
      let bestMatch = null;
      let bestScore = 0;
      for (const p of brandMatches) {
        const normP = normalize(p.model);
        const normM = normalize(extractedModel);
        if (normP === normM) {
          bestMatch = p;
          bestScore = 100;
          break;
        }
        // 计算关键词覆盖率
        const kwP = extractKeywords(normP);
        const kwM = extractKeywords(normM);
        const common = kwM.filter(km => kwP.some(kp => kp.includes(km) || km.includes(kp)));
        const score = common.length / Math.max(kwM.length, 1);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = p;
        }
      }
      if (bestMatch) {
        const flavorDiff = detectFlavorDiff(fullDesc, bestMatch.model);
        if (flavorDiff.hasFlavorDiff) {
          warnings.push(`口味不一致: 核算表[${flavorDiff.auditFlavor || '未标注'}] vs 原料库[${flavorDiff.priceFlavor}]`);
          return {
            priceInfo: bestMatch,
            matchType: 'flavor_diff',
            matchDetail: `品牌匹配但口味不同: ${extractedBrand} / ${bestMatch.model}`,
            warnings
          };
        }
        return {
          priceInfo: bestMatch,
          matchType: 'brand_model',
          matchDetail: `品牌匹配,选择最相似型号: ${extractedBrand} / ${bestMatch.model}`,
          warnings
        };
      }
    }
  }
  
  // ===== 优先级3：仅型号匹配（品牌不同或未标注品牌） =====
  if (extractedModel && !GENERIC_WORDS.includes(extractedModel) && extractedModel.length >= 2) {
    // 型号精确或相似匹配
    const modelMatches = prices.filter(p =>
      p.model === extractedModel || normalize(p.model) === normalize(extractedModel) || isSimilar(p.model, extractedModel)
    );
    
    if (modelMatches.length === 1) {
      // 唯一匹配：型号能唯一确定品牌
      const modelMatch = modelMatches[0];
      if (extractedBrand && modelMatch.brand !== extractedBrand) {
        warnings.push(`与原料库非同一原料，成本仅供参考: 核算表品牌[${extractedBrand}] vs 原料库品牌[${modelMatch.brand}]`);
        return {
          priceInfo: modelMatch,
          matchType: 'fuzzy',
          matchDetail: `品牌不同但型号唯一匹配: 核算表"${extractedBrand}" vs 原料库"${modelMatch.brand}" / ${modelMatch.model}`,
          warnings
        };
      }
      // 未标注品牌但型号唯一 → 需要判断型号是否为品牌专属编码
      if (!extractedBrand) {
        // 字母+数字编码（如YF042, MS01T）是品牌专属的，可可靠推断品牌
        if (isAlphanumericCode(extractedModel)) {
          return {
            priceInfo: modelMatch,
            matchType: 'brand_model',
            matchDetail: `型号编码唯一匹配: ${modelMatch.brand} / ${modelMatch.model}`,
            warnings
          };
        }
        // 通用原料名虽然型号唯一，但不能确定是同一品牌
        warnings.push('未标注品牌，与原料库非同一原料，成本仅供参考');
        return {
          priceInfo: modelMatch,
          matchType: 'fuzzy',
          matchDetail: `未标注品牌,型号唯一匹配: 原料库"${modelMatch.brand}" / ${modelMatch.model}`,
          warnings
        };
      }
    }
    
    if (modelMatches.length > 1) {
      // 多个匹配，优先选同品牌的
      const sameBrand = extractedBrand ? modelMatches.find(m => m.brand === extractedBrand) : null;
      const chosen = sameBrand || modelMatches[0];
      
      if (extractedBrand && chosen.brand !== extractedBrand) {
        warnings.push(`与原料库非同一原料，成本仅供参考: 核算表品牌[${extractedBrand}] vs 原料库品牌[${chosen.brand}]`);
        return {
          priceInfo: chosen,
          matchType: 'fuzzy',
          matchDetail: `品牌不同但型号匹配: 核算表"${extractedBrand}" vs 原料库"${chosen.brand}" / ${chosen.model}`,
          warnings
        };
      }
      if (!extractedBrand) {
        warnings.push('未标注品牌，与原料库非同一原料，成本仅供参考');
        return {
          priceInfo: chosen,
          matchType: 'fuzzy',
          matchDetail: `未标注品牌,型号匹配到多个: 原料库"${chosen.brand}" / ${chosen.model}`,
          warnings
        };
      }
    }
    
    // 用原料名直接模糊搜索（适用于原料名比较通用的场景）
    if (name.length >= 2 && !GENERIC_WORDS.includes(name)) {
      const nameMatch = prices.find(p =>
        isSimilar(p.model, name) && p.model !== extractedModel && !modelMatches.includes(p)
      );
      if (nameMatch && (!extractedBrand || nameMatch.brand !== extractedBrand)) {
        warnings.push(`与原料库非同一原料，成本仅供参考: 核算表[${extractedBrand || name}] vs 原料库[${nameMatch.brand}${nameMatch.model}]`);
        return {
          priceInfo: nameMatch,
          matchType: 'fuzzy',
          matchDetail: `仅型号模糊匹配: 核算表"${name}" vs 原料库"${nameMatch.brand} ${nameMatch.model}"`,
          warnings
        };
      }
    }
  }
  
  return { priceInfo: null, matchType: null, matchDetail: '未找到匹配价格', warnings };
}

/**
 * 批量匹配（用量计算场景）
 * @param {Array} materials - 配方原料列表
 * @param {Array} prices - 价格库列表
 * @returns {Array} 匹配结果列表
 */
function matchPrices(materials, prices) {
  // 从价格库提取所有已知品牌（按长度降序排列，优先匹配更长的品牌名）
  const knownBrands = [...new Set(prices.map(p => p.brand).filter(Boolean))].sort((a, b) => b.length - a.length);
  
  return materials.map(m => {
    const result = matchPrice(m, prices, knownBrands);
    return {
      material: m,
      ...result
    };
  });
}

/**
 * 批量匹配（成本核查场景）
 * @param {Array} auditMaterials - 核算表原料列表 [{ name, brandSpec, ... }]
 * @param {Array} prices - 价格库列表
 * @returns {Array} 匹配结果列表
 */
function matchPricesForAudit(auditMaterials, prices) {
  const knownBrands = [...new Set(prices.map(p => p.brand).filter(Boolean))].sort((a, b) => b.length - a.length);
  
  return auditMaterials.map(m => {
    const result = matchPriceForAudit(m.name, m.brandSpec, prices, knownBrands);
    return {
      auditMaterial: m,
      ...result
    };
  });
}

module.exports = { matchPrice, matchPrices, matchPriceForAudit, matchPricesForAudit, extractBrandAndModel, isSimilar, normalize };
