<template>
  <div class="products-page">
    <div class="page-header">
      <h2 class="page-title">产品配方管理</h2>
      <div class="header-actions">
        <el-button type="success" @click="exportProducts" :loading="exportLoading">
          <el-icon><Download /></el-icon> 导出配方
        </el-button>
        <el-button type="primary" @click="showImportDialog" v-if="authStore.isAdmin">
          <el-icon><Upload /></el-icon> 导入配方
        </el-button>
      </div>
    </div>
    
    <el-card class="search-card" shadow="never">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="产品名称/编码" clearable />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.type" placeholder="全部类型" clearable style="width: 160px">
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="销售状态">
          <el-select v-model="searchForm.sales_status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="在售" value="on_sale" />
            <el-option label="下架" value="off_sale" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadProducts">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    
    <el-card shadow="never">
      <el-table :data="products" v-loading="loading" stripe>
        <el-table-column prop="code" label="产品编码" width="120" />
        <el-table-column prop="name" label="产品名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column label="销售状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.sales_status === 'on_sale'" type="success" size="small">在售</el-tag>
            <el-tag v-else type="info" size="small">下架</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生产工厂" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.factory_name">{{ row.factory_name }}</span>
            <span v-else class="no-supplier">未指定</span>
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column label="原料数量" width="90" align="center">
          <template #default="{ row }">
            <span class="count-badge">{{ row.materials?.length || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">详情</el-button>
            <el-button type="primary" link size="small" @click="editProduct(row)" v-if="authStore.isAdmin">编辑</el-button>
            <el-button type="danger" link size="small" @click="deleteProduct(row)" v-if="authStore.isAdmin">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <!-- 导入配方对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入配方" width="650px" :close-on-click-modal="false">
      <!-- 上传区域 -->
      <div
        class="upload-zone"
        :class="{ 'drag-over': isDragging }"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
        @click="$refs.fileInput.click()"
      >
        <el-icon :size="40" class="upload-icon"><Upload /></el-icon>
        <div class="upload-text">
          <div class="main-text">点击或拖拽上传配方文件 (.xlsx)</div>
          <div class="sub-text">列：物料编码、产品名称、产品类型、规格、供应商、原料名称、统一名称、品牌规格、品牌、原料生产商、产地、执行标准、对应比例、单个克重(g)</div>
        </div>
      </div>
      
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.xls"
        style="display: none"
        @change="handleFileChange"
      />

      <div v-if="fileInfo" class="file-info">
        <el-icon><Document /></el-icon>
        <span>{{ fileInfo }}</span>
        <span v-if="importLoading" style="margin-left: 8px"><el-icon class="is-loading"><Loading /></el-icon></span>
      </div>

      <!-- 导入选项 -->
      <div class="import-options" v-if="selectedFile">
        <el-form :inline="true">
          <el-form-item label="导入模式">
            <el-radio-group v-model="importMode">
              <el-radio value="upsert">新增+更新</el-radio>
              <el-radio value="overwrite">仅新增</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </div>

      <!-- 导入结果 -->
      <div v-if="importResult" class="result-section">
        <el-row :gutter="12" class="summary-row">
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-label">文件产品总数</div>
              <div class="summary-value">{{ importResult.total }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-label">新增</div>
              <div class="summary-value" style="color: #67c23a;">{{ importResult.created }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-item">
              <div class="summary-label">更新</div>
              <div class="summary-value" style="color: #409eff;">{{ importResult.updated }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="summary-item" :class="{ 'has-diff': importResult.errorCount > 0 }">
              <div class="summary-label">错误</div>
              <div class="summary-value" :class="{ 'diff-text': importResult.errorCount > 0 }">
                {{ importResult.errorCount }}
              </div>
            </div>
          </el-col>
        </el-row>

        <el-alert
          v-if="importResult.skipped > 0"
          :title="`${importResult.skipped} 个产品已存在并被跳过（仅新增模式）`"
          type="info"
          :closable="false"
          class="result-alert"
        />

        <el-card v-if="importResult.errors?.length" shadow="never" class="result-card">
          <template #header>
            <span>导入错误</span>
          </template>
          <el-table :data="importResult.errors" stripe size="small">
            <el-table-column prop="code" label="物料编码" width="120" />
            <el-table-column prop="name" label="产品名称" min-width="200" />
            <el-table-column prop="error" label="错误信息" min-width="200" />
          </el-table>
        </el-card>
      </div>
      
      <template #footer>
        <el-button @click="closeImportDialog">关闭</el-button>
        <el-button type="primary" @click="doImport" :loading="importLoading" :disabled="!selectedFile">
          开始导入
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" title="编辑产品" width="650px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="产品编码" prop="code">
          <el-input v-model="form.code" disabled />
        </el-form-item>
        <el-form-item label="产品名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入产品名称" />
        </el-form-item>
        <el-form-item label="产品类型">
          <el-input v-model="form.type" placeholder="请输入产品类型" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="form.unit" placeholder="默认：个" />
        </el-form-item>
        <el-form-item label="销售状态">
          <el-radio-group v-model="form.sales_status">
            <el-radio value="on_sale">在售</el-radio>
            <el-radio value="off_sale">下架</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生产工厂">
          <el-select
            v-model="form.factory_name"
            placeholder="请选择生产工厂"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="name in factoryOptions"
              :key="name"
              :label="name"
              :value="name"
            />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">配方原料</el-divider>
        
        <div v-for="(material, index) in form.materials" :key="index" class="material-row">
          <el-row :gutter="8">
            <el-col :span="10">
              <el-input v-model="material.name" placeholder="原料名称" size="small" />
            </el-col>
            <el-col :span="6">
              <el-input-number v-model="material.weight" :min="0" placeholder="用量" size="small" style="width: 100%" />
            </el-col>
            <el-col :span="4">
              <el-input v-model="material.unit" placeholder="单位" size="small" />
            </el-col>
            <el-col :span="4">
              <el-button type="danger" link size="small" @click="removeMaterial(index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-col>
          </el-row>
        </div>
        
        <el-button type="primary" link size="small" @click="addMaterial">
          <el-icon><Plus /></el-icon> 添加原料
        </el-button>
      </el-form>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
    
    <!-- 详情对话框 -->
    <el-dialog v-model="detailVisible" title="产品详情" width="580px">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="产品编码">{{ currentProduct.code }}</el-descriptions-item>
        <el-descriptions-item label="产品名称">{{ currentProduct.name }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentProduct.type }}</el-descriptions-item>
        <el-descriptions-item label="单位">{{ currentProduct.unit }}</el-descriptions-item>
        <el-descriptions-item label="销售状态">
          <el-tag v-if="currentProduct.sales_status === 'on_sale'" type="success" size="small">在售</el-tag>
          <el-tag v-else type="info" size="small">下架</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="生产工厂">{{ currentProduct.factory_name || '-' }}</el-descriptions-item>
      </el-descriptions>
      
      <h4 style="margin: 16px 0 8px; font-size: 14px; color: #1d2129;">配方明细</h4>
      <el-table :data="currentProduct.materials" border size="small">
        <el-table-column prop="material_name" label="原料名称" min-width="120" />
        <el-table-column prop="supplier" label="供应商" width="100">
          <template #default="{ row }">
            <span v-if="row.supplier">{{ row.supplier }}</span>
            <span v-else class="no-supplier">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="brand" label="品牌" width="100" />
        <el-table-column prop="manufacturer" label="原料生产商" min-width="120" show-overflow-tooltip />
        <el-table-column prop="weight" label="用量" width="100" />
        <el-table-column prop="unit" label="单位" width="70" align="center" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Document, Loading, Plus, Delete, Search, Download } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { productApi, recipeImportApi } from '../api'

const authStore = useAuthStore()
const loading = ref(false)
const products = ref([])
const typeOptions = ref([])

const searchForm = reactive({
  keyword: '',
  type: '',
  sales_status: ''
})

// 编辑对话框
const dialogVisible = ref(false)
const detailVisible = ref(false)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  id: null,
  code: '',
  name: '',
  type: '',
  unit: '个',
  sales_status: 'on_sale',
  factory_name: '',
  materials: []
})

const factoryOptions = ref([])

const currentProduct = ref({})

const rules = {
  code: [{ required: true, message: '请输入产品编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }]
}

// 导入配方相关
const importDialogVisible = ref(false)
const fileInput = ref(null)
const isDragging = ref(false)
const fileInfo = ref('')
const selectedFile = ref(null)
const importMode = ref('upsert')
const importResult = ref(null)
const importLoading = ref(false)

// 导出相关
const exportLoading = ref(false)

const showImportDialog = () => {
  importResult.value = null
  selectedFile.value = null
  fileInfo.value = ''
  importMode.value = 'upsert'
  importLoading.value = false
  importDialogVisible.value = true
  setTimeout(() => {
    if (fileInput.value) fileInput.value.value = ''
  }, 0)
}

const closeImportDialog = () => {
  importDialogVisible.value = false
  if (importResult.value && importResult.value.ok) {
    loadProducts()
  }
}

const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (file) selectFile(file)
}

const handleDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file) selectFile(file)
}

const selectFile = (file) => {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    ElMessage.error('只支持 .xlsx 或 .xls 文件')
    return
  }
  selectedFile.value = file
  fileInfo.value = `已选择：${file.name}`
  importResult.value = null
}

const doImport = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要导入「${selectedFile.value.name}」吗？${importMode.value === 'upsert' ? '已有产品的配方将被覆盖更新。' : '已有产品将被跳过。'}`,
      '确认导入',
      { confirmButtonText: '确定导入', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  importLoading.value = true
  fileInfo.value = `正在导入：${selectedFile.value.name}...`

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('mode', importMode.value)

    const res = await recipeImportApi.import(formData)

    if (res.ok) {
      importResult.value = res
      fileInfo.value = `${selectedFile.value.name} 导入完成`
      if (res.errorCount > 0) {
        ElMessage.warning(`导入完成，有 ${res.errorCount} 个错误`)
      } else {
        ElMessage.success(`导入成功！新增 ${res.created}，更新 ${res.updated}`)
      }
    } else {
      ElMessage.error(res.msg || '导入失败')
      fileInfo.value = ''
    }
  } catch (error) {
    console.error('导入失败:', error)
    ElMessage.error('导入失败：' + (error.msg || '未知错误'))
    fileInfo.value = ''
  } finally {
    importLoading.value = false
  }
}

// 产品列表操作
const loadProducts = async () => {
  loading.value = true
  try {
    const res = await productApi.getList(searchForm)
    products.value = res.products || []
  } catch (error) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadTypes = async () => {
  try {
    const res = await productApi.getTypes()
    typeOptions.value = res.types || []
  } catch (error) {
    // 静默失败，不影响主功能
  }
}

const resetSearch = () => {
  searchForm.keyword = ''
  searchForm.type = ''
  searchForm.sales_status = ''
  loadProducts()
}

const editProduct = (row) => {
  form.id = row.id
  form.code = row.code
  form.name = row.name
  form.type = row.type
  form.unit = row.unit
  form.sales_status = row.sales_status || 'on_sale'
  form.factory_name = row.factory_name || ''
  form.materials = row.materials?.map(m => ({
    name: m.material_name,
    weight: m.weight,
    unit: m.unit
  })) || []
  dialogVisible.value = true
}

const viewDetail = (row) => {
  currentProduct.value = row
  detailVisible.value = true
}

const addMaterial = () => {
  form.materials.push({ name: '', weight: 0, unit: 'g' })
}

const removeMaterial = (index) => {
  form.materials.splice(index, 1)
}

const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const data = {
      code: form.code,
      name: form.name,
      type: form.type,
      unit: form.unit,
      sales_status: form.sales_status,
      factory_name: form.factory_name,
      materials: form.materials.filter(m => m.name && m.weight > 0)
    }

    await productApi.update(form.id, data)
    ElMessage.success('更新成功')
    dialogVisible.value = false
    loadProducts()
  } catch (error) {
    ElMessage.error(error.msg || '操作失败')
  } finally {
    submitting.value = false
  }
}

const deleteProduct = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除产品 "${row.name}" 吗？`, '提示', {
      type: 'warning'
    })
    await productApi.delete(row.id)
    ElMessage.success('删除成功')
    loadProducts()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 导出产品配方
const exportProducts = async () => {
  if (products.value.length === 0) {
    ElMessage.warning('没有可导出的产品')
    return
  }

  exportLoading.value = true
  try {
    const productIds = products.value.map(p => p.id)
    const blob = await productApi.export(productIds)

    // 下载文件
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    link.download = `产品配方导出_${timestamp}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    ElMessage.success(`成功导出 ${products.value.length} 个产品的配方`)
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败：' + (error.msg || '未知错误'))
  } finally {
    exportLoading.value = false
  }
}

const loadFactories = async () => {
  try {
    const res = await productApi.getFactories()
    factoryOptions.value = res.factories || []
  } catch (error) {
    // 静默失败
  }
}

onMounted(() => {
  loadTypes()
  loadFactories()
  loadProducts()
})
</script>

<style scoped>
.products-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}

.search-card {
  margin-bottom: 16px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.count-badge {
  display: inline-block;
  min-width: 24px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  background: #f2f3f5;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #1d2129;
  padding: 0 6px;
}

.no-supplier {
  color: #f56c6c;
  font-size: 12px;
}

.material-row {
  margin-bottom: 8px;
}

/* 导入相关 */
.upload-zone {
  border: 2px dashed #d0d7e3;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafbfd;
}

.upload-zone:hover,
.upload-zone.drag-over {
  border-color: #409eff;
  background: #ecf5ff;
}

.upload-icon {
  color: #409eff;
  margin-bottom: 8px;
}

.upload-text .main-text {
  font-size: 14px;
  color: #606266;
  margin-bottom: 4px;
}

.upload-text .sub-text {
  font-size: 12px;
  color: #909399;
}

.file-info {
  margin-top: 12px;
  padding: 10px 14px;
  background: #ecf5ff;
  border-radius: 6px;
  font-size: 13px;
  color: #409eff;
  display: flex;
  align-items: center;
  gap: 6px;
}

.import-options {
  margin-top: 12px;
}

.result-section {
  margin-top: 16px;
}

.result-alert {
  margin-bottom: 12px;
}

.summary-row {
  margin-bottom: 12px;
}

.summary-item {
  text-align: center;
  padding: 14px 0;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
}

.summary-item.has-diff {
  border-top: 3px solid #f56c6c;
}

.summary-label {
  font-size: 12px;
  color: #86909c;
  margin-bottom: 6px;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #1d2129;
}

.summary-value.diff-text {
  color: #f56c6c;
}

.result-card {
  margin-bottom: 12px;
}

/* 响应式 */
@media (max-width: 768px) {
  .products-page {
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
