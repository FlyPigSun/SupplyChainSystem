<template>
  <div class="backups-page">
    <div class="page-header">
      <h2 class="page-title">备份管理</h2>
      <el-button type="primary" @click="createBackup" :loading="creating">
        <el-icon><Plus /></el-icon> 创建备份
      </el-button>
    </div>
    
    <el-card shadow="never">
      <el-table :data="backups" v-loading="loading" stripe>
        <el-table-column prop="name" label="备份文件名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="size" label="大小" width="100" align="right">
          <template #default="{ row }">
            {{ formatSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="time" label="备份时间" width="170">
          <template #default="{ row }">
            {{ formatDate(row.time) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="restoreBackup(row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { backupApi } from '../api'

const loading = ref(false)
const creating = ref(false)
const backups = ref([])

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const loadBackups = async () => {
  loading.value = true
  try {
    const res = await backupApi.getList()
    backups.value = res.backups || []
  } catch (error) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const createBackup = async () => {
  creating.value = true
  try {
    await backupApi.create()
    ElMessage.success('备份创建成功')
    loadBackups()
  } catch (error) {
    ElMessage.error('备份失败')
  } finally {
    creating.value = false
  }
}

const restoreBackup = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要从备份 "${row.name}" 恢复数据吗？当前数据将被覆盖！`,
      '警告',
      {
        type: 'warning',
        confirmButtonText: '确定恢复',
        cancelButtonText: '取消'
      }
    )
    await backupApi.restore(row.name)
    ElMessage.success('恢复成功，请刷新页面')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('恢复失败')
    }
  }
}

onMounted(loadBackups)
</script>

<style scoped>
.backups-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}

@media (max-width: 768px) {
  .backups-page {
    padding: 12px;
  }

  .page-header {
    margin-bottom: 12px;
  }

  .page-title {
    font-size: 18px;
  }
}
</style>
