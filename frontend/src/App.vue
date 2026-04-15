<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'

const authStore = useAuthStore()

onMounted(() => {
  // 初始化认证状态
  authStore.initAuth()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: #f0f2f5;
  font-size: 14px;
  color: #1d2129;
  -webkit-font-smoothing: antialiased;
}

/* 全局卡片统一样式 */
.el-card {
  border-radius: 8px !important;
  border: 1px solid #e5e6eb !important;
}

.el-card__header {
  padding: 14px 20px !important;
  border-bottom: 1px solid #f0f0f0 !important;
}

.el-card__body {
  padding: 16px 20px !important;
}

/* 全局表格统一样式 */
.el-table {
  font-size: 13px !important;
}

.el-table th {
  font-weight: 600 !important;
  color: #1d2129 !important;
  background-color: #f7f8fa !important;
}

.el-table td {
  color: #4e5969 !important;
}

/* 全局按钮统一样式 */
.el-button {
  font-size: 13px !important;
}

.el-button--default {
  border-radius: 6px;
}

/* 全局 Tag 统一 */
.el-tag {
  border-radius: 4px !important;
}

/* 全局 Dialog */
.el-dialog {
  border-radius: 10px !important;
}

.el-dialog__header {
  padding: 16px 20px !important;
  border-bottom: 1px solid #f0f0f0;
}

.el-dialog__title {
  font-size: 16px !important;
  font-weight: 600 !important;
  color: #1d2129 !important;
}

.el-dialog__body {
  padding: 20px !important;
}

.el-dialog__footer {
  padding: 12px 20px 16px !important;
  border-top: 1px solid #f0f0f0;
}

/* 全局 Form */
.el-form-item__label {
  font-size: 13px !important;
  color: #4e5969 !important;
}

/* 全局 Input */
.el-input__inner {
  font-size: 13px !important;
}

/* 响应式基础 */
@media (max-width: 768px) {
  .el-dialog {
    width: 92% !important;
    margin: 10px auto !important;
  }

  .el-card__body {
    padding: 12px 14px !important;
  }

  .el-card__header {
    padding: 12px 14px !important;
  }

  .el-form--inline .el-form-item {
    margin-right: 0 !important;
    margin-bottom: 8px !important;
  }

  /* 表格在移动端横向滚动 */
  .el-table {
    min-width: 600px;
  }
}
</style>
