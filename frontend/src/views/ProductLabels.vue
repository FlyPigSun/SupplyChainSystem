<template>
  <div class="product-labels-page">
    <el-card>
      <div class="header">
        <el-input v-model="keyword" placeholder="搜索产品编码、名称或配料" clearable style="width: 300px" @keyup.enter="handleSearch" />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="keyword = ''; loadData()">重置</el-button>
        <div class="actions" v-if="isAdmin">
          <el-button type="success" @click="handleImport">导入</el-button>
          <el-button type="warning" @click="handleExport">导出</el-button>
          <el-button @click="handleDownloadTemplate">下载模板</el-button>
        </div>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="code" label="产品编码" width="120" />
        <el-table-column prop="name" label="产品名称" width="180" />
        <el-table-column prop="type" label="产品类型" width="100" />
        <el-table-column prop="supplier" label="生产工厂" width="150" />
        <el-table-column prop="ingredients" label="产品配料表" min-width="300">
          <template #default="{ row }">
            <div class="ingredients-cell">{{ row.ingredients }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="level1Count" label="一级配料数量" width="100" align="center" />
        <el-table-column prop="totalCount" label="所有配料数量" width="100" align="center" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showDetail(row.code)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @size-change="loadData"
        @current-change="loadData"
        style="margin-top: 16px; justify-content: flex-end"
      />
    </el-card>

    <!-- 导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入配料表" width="500px">
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="handleFileChange"
        drag
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽文件到此处或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">只支持 .xlsx 或 .xls 文件</div>
        </template>
      </el-upload>
      <el-radio-group v-model="importMode" style="margin-top: 16px">
        <el-radio value="upsert">更新模式：已有产品更新，新产品新增</el-radio>
        <el-radio value="skip">跳过模式：已有产品跳过，只导入新产品</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitImport" :loading="importLoading">导入</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" :title="detailData?.name || '配料详情'" width="600px">
      <div v-if="detailLoading" style="text-align: center; padding: 20px;">加载中...</div>
      <div v-else-if="detailData" class="detail-content">
        <div class="detail-info">
          <span><strong>产品编码：</strong>{{ detailData.code }}</span>
          <span><strong>产品类型：</strong>{{ detailData.type }}</span>
          <span><strong>生产工厂：</strong>{{ detailData.supplier }}</span>
        </div>
        <el-divider />
        <div class="ingredient-tree">
          <div v-for="item in getLevel1Ingredients()" :key="item.id" class="ingredient-item">
            <div class="level1">{{ item.name }}</div>
            <div v-if="getLevel2Ingredients(item.name).length > 0" class="level2-list">
              <div v-for="child in getLevel2Ingredients(item.name)" :key="child.id" class="level2">
                {{ child.name }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import api from '../api'

const keyword = ref('')
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const importDialogVisible = ref(false)
const importLoading = ref(false)
const importMode = ref('upsert')
const importFile = ref(null)
const uploadRef = ref(null)

const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref(null)

const isAdmin = computed(() => {
  try { return JSON.parse(localStorage.getItem('user'))?.role === 'admin' } catch { return false }
})

onMounted(() => loadData())

async function loadData() {
  loading.value = true
  try {
    const res = await api.get('/product-labels', { params: { page: pagination.page, pageSize: pagination.pageSize, keyword: keyword.value } })
    if (res.ok) {
      tableData.value = res.data
      pagination.total = res.pagination.total
    } else {
      ElMessage.error(res.msg || '加载失败')
    }
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  loadData()
}

function handleImport() {
  importFile.value = null
  importMode.value = 'upsert'
  uploadRef.value?.clearFiles()
  importDialogVisible.value = true
}

function handleFileChange(file) {
  importFile.value = file.raw
}

async function submitImport() {
  if (!importFile.value) {
    ElMessage.warning('请选择文件')
    return
  }
  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    formData.append('mode', importMode.value)
    const res = await api.post('/product-labels/import', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
    if (res.ok) {
      ElMessage.success(`导入成功：${res.created}新增，${res.updated}更新，${res.skipped}跳过`)
      if (res.errorCount > 0) ElMessage.warning(`有 ${res.errorCount} 条记录导入失败`)
      importDialogVisible.value = false
      loadData()
    } else {
      ElMessage.error(res.msg || '导入失败')
    }
  } catch (e) {
    ElMessage.error(e.msg || '导入失败')
  } finally {
    importLoading.value = false
  }
}

async function handleExport() {
  try {
    const res = await api.get('/product-labels/export', { params: { keyword: keyword.value }, responseType: 'blob' })
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'product_labels.xlsx'; a.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    ElMessage.error('导出失败')
  }
}

async function handleDownloadTemplate() {
  try {
    const res = await api.get('/product-labels/template', { responseType: 'blob' })
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'product_labels_template.xlsx'; a.click()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('下载失败')
  }
}

async function showDetail(code) {
  detailDialogVisible.value = true
  detailLoading.value = true
  detailData.value = null
  try {
    const res = await api.get(`/product-labels/detail/${code}`)
    if (res.ok) {
      detailData.value = res.data
    } else {
      ElMessage.error(res.msg || '加载失败')
      detailDialogVisible.value = false
    }
  } catch (e) {
    ElMessage.error('加载失败')
    detailDialogVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

function getLevel1Ingredients() {
  if (!detailData.value?.ingredients) return []
  return detailData.value.ingredients.filter(i => i.level === 1)
}

function getLevel2Ingredients(parentName) {
  if (!detailData.value?.ingredients) return []
  return detailData.value.ingredients.filter(i => i.level === 2 && i.parent === parentName)
}
</script>

<style scoped>
.product-labels-page { padding: 0; }
.header { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.actions { margin-left: auto; display: flex; gap: 8px; }
.ingredients-cell { white-space: pre-wrap; line-height: 1.5; }
.detail-info { display: flex; gap: 24px; flex-wrap: wrap; color: #606266; font-size: 14px; }
.ingredient-tree { max-height: 500px; overflow-y: auto; }
.ingredient-item { margin-bottom: 8px; }
.level1 { font-weight: 500; color: #303133; font-size: 14px; }
.level2-list { padding-left: 20px; margin-top: 4px; border-left: 2px solid #e4e7ed; }
.level2 { color: #606266; font-size: 13px; padding: 2px 0; }
@media (max-width: 768px) { .header { flex-direction: column; } .actions { margin-left: 0; width: 100%; } }
</style>