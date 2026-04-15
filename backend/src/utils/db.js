/**
 * 数据库异步操作工具
 * 将 SQLite3 回调风格封装为 Promise
 */

const { getDatabase } = require('../models/database')

/**
 * 异步查询，返回多行
 */
function queryAsync(sql, params = []) {
  const db = getDatabase()
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []))
  })
}

/**
 * 异步查询单行
 */
function getAsync(sql, params = []) {
  const db = getDatabase()
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null))
  })
}

/**
 * 异步执行写操作，返回 { lastID, changes }
 */
function runAsync(sql, params = []) {
  const db = getDatabase()
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

module.exports = { queryAsync, getAsync, runAsync }
