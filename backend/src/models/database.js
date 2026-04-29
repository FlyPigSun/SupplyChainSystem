/**
 * 数据库初始化模块
 * 使用 SQLite3
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = process.env.TEST_DB_PATH || path.join(DB_DIR, 'supply_chain.db');

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('数据库连接失败:', err);
      } else {
        console.log('数据库连接成功');
      }
    });
    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');
    // 启用 WAL 模式，提高写入性能和数据安全性
    db.run('PRAGMA journal_mode = WAL');
    // 设置同步模式为 NORMAL（性能和安全性平衡）
    db.run('PRAGMA synchronous = NORMAL');
    // 设置缓存大小为 10000 页（约 40MB）
    db.run('PRAGMA cache_size = 10000');
  }
  return db;
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    
    // 序列执行SQL
    database.serialize(() => {
      // 产品配方表
      database.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          type TEXT,
          unit TEXT DEFAULT '个',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 配方明细表
      database.run(`
        CREATE TABLE IF NOT EXISTS product_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          material_name TEXT NOT NULL,
          unified_name TEXT,
          brand_spec TEXT,
          brand TEXT,
          supplier TEXT,
          manufacturer TEXT,
          origin TEXT,
          standard TEXT,
          ratio REAL DEFAULT 0,
          weight REAL NOT NULL,
          unit TEXT DEFAULT 'g',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
      `);

      // 原料价格表
      database.run(`
        CREATE TABLE IF NOT EXISTS material_prices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          material_name TEXT UNIQUE NOT NULL,
          price REAL NOT NULL,
          unit TEXT DEFAULT 'kg',
          supplier TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 操作日志表
      database.run(`
        CREATE TABLE IF NOT EXISTS operation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operator TEXT NOT NULL,
          action TEXT NOT NULL,
          detail TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 匹配修正表（记住人工修正的原料匹配关系）
      database.run(`
        CREATE TABLE IF NOT EXISTS match_corrections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_name TEXT NOT NULL,
          source_brand_spec TEXT DEFAULT '',
          source_supplier TEXT DEFAULT '',
          target_price_id INTEGER NOT NULL,
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_name, source_brand_spec, source_supplier)
        )
      `);

      // 供应商表
      database.run(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          contact TEXT,
          phone TEXT,
          remark TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 产品配料表（配料表管理 / 产品标签）
      database.run(`
        CREATE TABLE IF NOT EXISTS product_labels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_code TEXT NOT NULL,
          product_name TEXT NOT NULL,
          product_type TEXT,
          supplier TEXT,
          ingredient TEXT NOT NULL,
          level INTEGER DEFAULT 1,
          parent_ingredient TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(product_code, ingredient, level)
        )
      `);

      // 用户表
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('创建用户表失败:', err);
          reject(err);
          return;
        }
        
        // 为已有表添加 status 字段（兼容旧数据库）
        database.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`, () => {
          // 忽略错误（字段已存在时会报错，不影响）
        });
        
        // 为已有表添加 must_change_pwd 字段
        database.run(`ALTER TABLE users ADD COLUMN must_change_pwd INTEGER DEFAULT 0`, () => {
          // 忽略错误（字段已存在时会报错，不影响）
        });
        
        // products 表扩展字段（销售状态、供应商/生产工厂）
        database.run(`ALTER TABLE products ADD COLUMN sales_status TEXT DEFAULT 'on_sale'`, () => {});
        database.run(`ALTER TABLE products ADD COLUMN supplier_id INTEGER`, () => {});
        database.run(`ALTER TABLE products ADD COLUMN factory_name TEXT`, () => {});
        // 将现有产品的销售状态全部设为 on_sale
        database.run(`UPDATE products SET sales_status = 'on_sale' WHERE sales_status IS NULL OR sales_status = ''`, () => {});

        // material_prices 表扩展字段
        const priceNewCols = [
          'category TEXT',    // 原料类型
          'brand TEXT',       // 品牌
          'model TEXT',       // 型号
          'spec TEXT',        // 规格
          'remark TEXT'       // 备注
        ];
        priceNewCols.forEach(col => {
          database.run(`ALTER TABLE material_prices ADD COLUMN ${col}`, () => {});
        });
        
        // 插入默认管理员 admin/admin
        const bcrypt = require('bcryptjs');
        const hashedAdminPassword = bcrypt.hashSync('admin', 10);
        database.run(
          `INSERT OR IGNORE INTO users (username, password, role, status) VALUES (?, ?, ?, ?)`,
          ['admin', hashedAdminPassword, 'admin', 'active'],
          (err) => {
            if (err) {
              console.error('插入默认管理员失败:', err);
              reject(err);
              return;
            }
            // 插入原有管理员 yangbin（兼容旧数据）
            const hashedYangbinPassword = bcrypt.hashSync('yangbin', 10);
            database.run(
              `INSERT OR IGNORE INTO users (username, password, role, status) VALUES (?, ?, ?, ?)`,
              ['yangbin', hashedYangbinPassword, 'admin', 'active'],
              (err) => {
                if (err) {
                  console.error('插入默认用户失败:', err);
                  reject(err);
                } else {
                  console.log('数据库表初始化完成');
                  resolve();
                }
              }
            );
          }
        );
      });
    });
  });
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDatabase,
  initDatabase,
  closeDatabase,
  DB_PATH
};
