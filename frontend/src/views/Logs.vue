<template>
  <div class="logs-page">
    <h2 class="page-title">操作日志</h2>
    
    <el-card shadow="never" class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="操作人/动作/详情" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadLogs">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <el-card shadow="never">
      <el-table :data="logs" v-loading="loading" stripe>
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="action" label="动作" width="130">
          <template #default="{ row }">
            <el-tag :type="getActionType(row.action)" size="small">{{ getActionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { logApi } from '../api'

const loading = ref(false)
const logs = ref([])

const searchForm = reactive({
  keyword: ''
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const getActionType = (action) => {
  const typeMap = {
    'create_product': 'success',
    'update_product': 'primary',
    'delete_product': 'danger',
    'update_price': 'warning',
    'add_price': 'success',
    'import_prices': 'primary',
    'import_recipes': 'primary',
    'create_backup': '',
    'restore_backup': 'warning',
    'bom_check': 'primary',
    'calculator': 'info',
    'change_role': 'warning',
    'login': 'info'
  }
  return typeMap[action] || ''
}

const getActionLabel = (action) => {
  const labelMap = {
    'create_product': '创建产品',
    'update_product': '更新产品',
    'delete_product': '删除产品',
    'add_price': '新增价格',
    'update_price': '更新价格',
    'import_prices': '导入价格',
    'import_recipes': '导入配方',
    'create_backup': '创建备份',
    'restore_backup': '恢复备份',
    'bom_check': '成本核查',
    'calculator': '用量计算',
    'change_role': '修改角色',
    'login': '登录'
  }
  return labelMap[action] || action
}

const loadLogs = async () => {
  loading.value = true
  try {
    const res = await logApi.getList(searchForm)
    logs.value = res.logs || []
  } catch (error) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  searchForm.keyword = ''
  loadLogs()
}

onMounted(loadLogs)
</script>

<style scoped>
.logs-page {
  padding: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
  margin: 0 0 16px 0;
}

.search-card {
  margin-bottom: 16px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .logs-page {
    padding: 12px;
  }

  .page-title {
    font-size: 18px;
    margin-bottom: 12px;
  }
}
</style>
