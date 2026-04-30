/**
 * 金额/数值格式化工具
 * 统一处理所有金额相关的精度问题，确保数据库存储和接口返回均为两位小数
 */

/**
 * 将数值保留两位小数后转回 Number
 * @param {number|string|null} val
 * @returns {number|null} 保留两位小数后的数值，输入无效时返回 null
 */
function round2(val) {
  if (val == null || val === '' || isNaN(val)) return null;
  return parseFloat(parseFloat(val).toFixed(2));
}

/**
 * 将对象中指定的金额字段统一保留两位小数（原地修改）
 * @param {Object} obj
 * @param {string[]} fields 需要格式化的字段名数组
 */
function roundFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return;
  for (const field of fields) {
    if (obj[field] !== undefined && obj[field] !== null) {
      obj[field] = round2(obj[field]);
    }
  }
}

/**
 * 将数组中每个对象的指定金额字段统一保留两位小数（原地修改）
 * @param {Array} arr
 * @param {string[]} fields
 */
function roundArrayFields(arr, fields) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    roundFields(item, fields);
  }
}

module.exports = {
  round2,
  roundFields,
  roundArrayFields
};
