/**
 * 认证与权限中间件
 */

const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('❌ 环境变量 JWT_SECRET 未设置，服务拒绝启动。请在 .env 或启动命令中设置。')
  process.exit(1)
}

/**
 * Token 验证中间件
 */
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ ok: false, msg: '未提供认证令牌' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ ok: false, msg: '令牌无效或已过期' })
  }
}

/**
 * 管理员权限中间件
 */
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, msg: '需要管理员权限' })
  }
  next()
}

module.exports = { authMiddleware, adminMiddleware, JWT_SECRET }
