/**
 * 用量计算路由（含价格匹配 + 修正记忆）
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync } = require('../utils/db');
const { matchPrices } = require('../utils/priceMatcher');
const { calcWeightInPriceUnit } = require('../utils/unitConversion');
const { round2 } = require('../utils/money');

const router = express.Router();

// 用量计算（含价格匹配 + 修正记忆）
router.post('/calculate', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body; // [{ productId, quantity }]
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, msg: '请提供计算项' });
    }
    if (items.length > 100) {
      return res.status(400).json({ ok: false, msg: '计算项数量超出限制（最多100条）' });
    }

    const results = [];

    // 获取所有价格数据
    const allPrices = await queryAsync('SELECT * FROM material_prices ORDER BY category, brand, model');

    // 加载所有修正记录（一次查询，避免循环查库）
    const corrections = await queryAsync(`
      SELECT mc.source_name, mc.source_brand_spec, mc.source_supplier,
             mc.target_price_id, mp.material_name as target_name, mp.brand as target_brand,
             mp.model as target_model, mp.price as target_price, mp.unit as target_unit,
             mp.supplier as target_supplier, mp.spec as target_spec, mp.category as target_category
      FROM match_corrections mc
      LEFT JOIN material_prices mp ON mc.target_price_id = mp.id
    `);
    const correctionMap = {};
    for (const c of corrections) {
      const key = `${c.source_name}||${c.source_brand_spec || ''}||${c.source_supplier || ''}`;
      correctionMap[key] = c;
    }

    for (const item of items) {
      const { productId, quantity } = item;
      if (!productId || !quantity || quantity <= 0) continue;

      const product = await getAsync('SELECT * FROM products WHERE id = ?', [productId]);
      if (!product) continue;

      const materials = await queryAsync(
        'SELECT * FROM product_materials WHERE product_id = ?',
        [productId]
      );

      const matchResults = matchPrices(materials, allPrices);

      for (const match of matchResults) {
        const m = match.material;
        
        // 查找是否有人工修正
        const correctionKey = `${m.material_name || ''}||${m.brand_spec || ''}||${m.supplier || ''}`;
        const correction = correctionMap[correctionKey];
        
        let priceInfo = match.priceInfo;
        let matchType = match.matchType;
        let matchDetail = match.matchDetail;
        let corrected = false;

        if (correction && correction.target_price_id) {
          const correctedPrice = allPrices.find(p => p.id === correction.target_price_id);
          if (correctedPrice) {
            priceInfo = correctedPrice;
            matchType = 'corrected';
            matchDetail = `人工修正: ${(m.material_name || '')} → ${correctedPrice.brand || ''} ${correctedPrice.model || ''}`;
            corrected = true;
          }
        }

        const unitWeight = parseFloat(m.weight) || 0;
        const totalWeight = unitWeight * (quantity || 0);

        let cost = null;
        let pricePerKg = null;
        let priceUnit = 'kg';

        if (priceInfo && priceInfo.price) {
          pricePerKg = parseFloat(priceInfo.price);
          priceUnit = priceInfo.unit || 'kg';
          const weightInPriceUnit = calcWeightInPriceUnit(totalWeight, pricePerKg, priceUnit, priceInfo.spec);
          cost = weightInPriceUnit !== null ? round2(weightInPriceUnit * pricePerKg) : null;
        }

        results.push({
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          productType: product.type,
          materialName: m.material_name || '',
          unifiedName: m.unified_name || m.material_name || '',
          brandSpec: m.brand_spec || '',
          brand: m.brand || '',
          supplier: m.supplier || '',
          unitWeight,
          totalWeight,
          unit: m.unit || 'g',
          price: round2(pricePerKg),
          priceUnit,
          cost,
          matchType,
          matchDetail,
          corrected,
          originalMatch: corrected ? {
            matchType: match.matchType,
            matchDetail: match.matchDetail,
            priceInfo: match.priceInfo ? {
              id: match.priceInfo.id,
              brand: match.priceInfo.brand,
              model: match.priceInfo.model,
              price: match.priceInfo.price
            } : null
          } : null
        });
      }
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error('计算用量失败:', error);
    res.status(500).json({ ok: false, msg: '计算失败' });
  }
});

module.exports = router;
