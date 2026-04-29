const { runAsync } = require('./db');

/**
 * 记录操作日志
 * @param {string} username - 操作人
 * @param {string} action - 操作动作
 * @param {string} detail - 操作详情
 * @returns {Promise<void>}
 */
async function logOperation(username, action, detail) {
  try {
    await runAsync(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [username, action, detail]
    );
  } catch (err) {
    // 日志记录失败不应影响主流程
    console.error('[logOperation] 记录日志失败:', err.message);
  }
}

module.exports = { logOperation };
