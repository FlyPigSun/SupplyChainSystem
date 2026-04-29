/**
 * Express 异步路由处理包装器
 * 自动捕获异步函数中的异常并传递给 next(err)
 * 用法：router.get('/', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
