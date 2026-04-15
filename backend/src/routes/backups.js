/**
 * 备份管理路由
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDatabase, DB_PATH, closeDatabase } = require('../models/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
const BACKUP_DIR = path.join(__dirname, '../../backups');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 获取备份列表
router.get('/', authMiddleware, adminMiddleware, (req, res) => {
  fs.readdir(BACKUP_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ ok: false, msg: '读取备份失败' });
    }
    
    const backups = files
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name: f,
          size: stat.size,
          time: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.time) - new Date(a.time));
    
    res.json({ ok: true, backups });
  });
});

// 创建备份
router.post('/create', authMiddleware, adminMiddleware, (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  
  fs.copyFile(DB_PATH, backupPath, (err) => {
    if (err) {
      return res.status(500).json({ ok: false, msg: '备份失败' });
    }
    // 记录操作日志
    const db = getDatabase();
    db.run(
      'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
      [req.user.username, 'create_backup', `创建备份: ${backupName}`]
    );
    res.json({ ok: true, msg: '备份成功', name: backupName });
  });
});

// 恢复备份
router.post('/restore', authMiddleware, adminMiddleware, (req, res) => {
  const { name } = req.body;
  
  // 安全校验：只允许合法备份文件名（防止路径遍历）
  if (!name || !/^[a-zA-Z0-9_\-:.]+\.db$/.test(name)) {
    return res.status(400).json({ ok: false, msg: '无效的备份文件名' });
  }
  
  const backupPath = path.join(BACKUP_DIR, name);
  
  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ ok: false, msg: '备份文件不存在' });
  }
  
  // 先备份当前数据
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const currentBackup = path.join(BACKUP_DIR, `before_restore_${timestamp}.db`);
  
  fs.copyFile(DB_PATH, currentBackup, () => {
    fs.copyFile(backupPath, DB_PATH, (err) => {
      if (err) {
        return res.status(500).json({ ok: false, msg: '恢复失败' });
      }
      // 关闭旧连接并重新初始化，使后续请求使用恢复后的数据库
      closeDatabase();
      const db = getDatabase();
      db.run(
        'INSERT INTO operation_logs (operator, action, detail) VALUES (?, ?, ?)',
        [req.user.username, 'restore_backup', `恢复备份: ${name}`]
      );
      res.json({ ok: true, msg: '恢复成功，数据库已重新加载' });
    });
  });
});

module.exports = router;
