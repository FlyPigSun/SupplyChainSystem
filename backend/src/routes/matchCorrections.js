/**
 * 匹配修正路由
 * 记住用户人工修正的原料匹配关系，后续自动应用
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { queryAsync, getAsync, runAsync } = require('../utils/db');

const router = express.Router();

/**
 * GET /api/match-corrections
 * 获取所有修正记录
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const corrections = await queryAsync(`
      SELECT mc.*, mp.material_name as target_name, mp.brand as target_brand, 
             mp.model as target_model, mp.price as target_price, mp.unit as target_unit,
             mp.supplier as target_supplier
      FROM match_corrections mc
      LEFT JOIN material_prices mp ON mc.target_price_id = mp.id
      ORDER BY mc.created_at DESC
    `);
    res.json({ ok: true, corrections });
  } catch (error) {
    console.error('获取修正记录失败:', error);
    res.status(500).json({ ok: false, msg: '获取失败' });
  }
});

/**
 * POST /api/match-corrections
 * 保存一条修正记录（INSERT OR REPLACE）
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { sourceName, sourceBrandSpec, sourceSupplier, targetPriceId } = req.body;

    if (!sourceName || !targetPriceId) {
      return res.status(400).json({ ok: false, msg: '缺少必要参数' });
    }

    // 验证目标价格存在
    const price = await getAsync('SELECT id FROM material_prices WHERE id = ?', [targetPriceId]);
    if (!price) {
      return res.status(400).json({ ok: false, msg: '目标原料不存在' });
    }

    await runAsync(`
      INSERT OR REPLACE INTO match_corrections (source_name, source_brand_spec, source_supplier, target_price_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [sourceName.trim(), (sourceBrandSpec || '').trim(), (sourceSupplier || '').trim(), targetPriceId, req.user.username]);

    res.json({ ok: true, msg: '修正已保存' });
  } catch (error) {
    console.error('保存修正失败:', error);
    res.status(500).json({ ok: false, msg: '保存失败' });
  }
});

/**
 * DELETE /api/match-corrections/:id
 * 删除一条修正记录
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await runAsync('DELETE FROM match_corrections WHERE id = ?', [id]);
    res.json({ ok: true, msg: '已删除' });
  } catch (error) {
    console.error('删除修正失败:', error);
    res.status(500).json({ ok: false, msg: '删除失败' });
  }
});

/**
 * POST /api/match-corrections/lookup
 * 批量查找修正记录：传入一组 { sourceName, sourceBrandSpec, sourceSupplier }
 * 返回匹配到的修正记录
 */
router.post('/lookup', authMiddleware, async (req, res) => {
  try {
    const { sources } = req.body; // [{ sourceName, sourceBrandSpec, sourceSupplier }]
    if (!Array.isArray(sources)) {
      return res.status(400).json({ ok: false, msg: '参数格式错误' });
    }
    if (sources.length > 200) {
      return res.status(400).json({ ok: false, msg: '查询数量超出限制（最多200条）' });
    }

    const results = [];
    for (const src of sources) {
      const correction = await getAsync(`
        SELECT mc.*, mp.material_name as target_name, mp.brand as target_brand,
               mp.model as target_model, mp.price as target_price, mp.unit as target_unit,
               mp.supplier as target_supplier, mp.spec as target_spec
        FROM match_corrections mc
        LEFT JOIN material_prices mp ON mc.target_price_id = mp.id
        WHERE mc.source_name = ? AND mc.source_brand_spec = ? AND mc.source_supplier = ?
      `, [(src.sourceName || '').trim(), (src.sourceBrandSpec || '').trim(), (src.sourceSupplier || '').trim()]);

      if (correction) {
        results.push({
          key: `${src.sourceName}||${src.sourceBrandSpec || ''}||${src.sourceSupplier || ''}`,
          correction
        });
      }
    }

    res.json({ ok: true, results });
  } catch (error) {
    console.error('查找修正失败:', error);
    res.status(500).json({ ok: false, msg: '查找失败' });
  }
});

module.exports = router;
