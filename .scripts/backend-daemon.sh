#!/bin/bash
# 供应链产品管理系统 - 后端守护脚本
# 被 launchd 调用，崩溃后自动重启

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Users/sunji/Desktop/Project/SupplyChainSystem/backend
exec /opt/homebrew/bin/node src/app.js
