<template>
  <div class="prices-page">
    <div class="page-header">
      <h2 class="page-title">原料价格管理</h2>
      <div class="header-actions">
        <el-button type="primary" size="small" @click="showAddDialog" v-if="authStore.isAdmin">
          <el-icon><Plus /></el-icon> 新增
        </el-button>
        <el-button type="success" size="small" @click="showImportDialog" v-if="authStore.isAdmin">
          <el-icon><Upload /></el-icon> 导入
        </el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table :data="prices" v-loading="loading" stripe size="small" style="width: 100%">
        <el-table-column prop="category" label="原料类型" width="90" show-overflow-tooltip />
        <el-table-column prop="brand" label="品牌" min-width="100" show-overflow-tooltip />
        <el-table-column prop="model" label="型号" min-width="120" show-overflow-tooltip />
        <el-table-column prop="supplier" label="供应商" min-width="100" show-overflow-tooltip />
        <el-table-column prop="spec" label="规格" width="100" show-overflow-tooltip />
        <el-table-column prop="price" label="含税单价" width="110" align="right">
          <template #default="{ row }">
            ¥{{ row.price?.toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="60" align="center" />
        <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="120" fixed="right" v-if="authStore.isAdmin">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="editPrice(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="deletePrice(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑价格' : '新增价格'" width="480px" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px" size="default">
        <el-form-item label="原料类型">
          <el-input v-model="form.category" placeholder="如：面粉、乳制品" />
        </el-form-item>
        <el-form-item label="品牌" prop="brand">
          <el-input v-model="form.brand" placeholder="品牌名称" />
        </el-form-item>
        <el-form-item label="型号" prop="model">
          <el-input v-model="form.model" placeholder="型号/品名" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-input v-model="form.supplier" placeholder="供应商名称" />
        </el-form-item>
        <el-form-item label="规格">
          <el-input v-model="form.spec" placeholder="如：25kg/袋" />
        </el-form-item>
        <el-form-item label="含税单价" prop="price">
          <el-input-number v-model="form.price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="form.unit" placeholder="如：袋、箱、kg" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入原料价格" width="520px" :close-on-click-modal="false">
      <div class="import-content">
        <el-upload
          ref="uploadRef"
          drag
          :auto-upload="false"
          :limit="1"
          accept=".xlsx,.xls"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
        >
          <el-icon :size="40" style="color: #c0c4cc;"><Upload /></el-icon>
          <div style="margin-top: 8px;">拖拽文件到此处，或<em>点击上传</em></div>
          <template #tip>
            <div class="upload-tip">
              支持 .xlsx / .xls 格式，模板字段：原料类型、品牌、型号、供应商、规格、单位、最小规格单价、备注
            </div>
          </template>
        </el-upload>

        <!-- 导入结果 -->
        <div v-if="importResult" class="import-result">
          <el-alert type="success" :closable="false" show-icon>
            <template #title>
              导入完成：共 {{ importResult.total }} 条，新增 {{ importResult.added }} 条，更新 {{ importResult.updated }} 条
            </template>
          </el-alert>
          <div v-if="importResult.errors > 0" style="margin-top: 8px;">
            <el-alert type="warning" :closable="false" show-icon>
              <template #title>错误 {{ importResult.errors }} 条</template>
            </el-alert>
            <el-table v-if="importResult.errorDetails?.length" :data="importResult.errorDetails" size="small" style="margin-top: 8px;">
              <el-table-column prop="row" label="行号" width="60" />
              <el-table-column prop="msg" label="错误信息" />
            </el-table>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="importDialogVisible = false">关闭</el-button>
        <el-button type="primary" size="small" @click="handleImport" :loading="importLoading" :disabled="!importFile">
          开始导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { priceApi, priceImportApi } from '../api'

const authStore = useAuthStore()
const loading = ref(false)
const prices = ref([])

// 新增/编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  id: null,
  category: '',
  brand: '',
  model: '',
  supplier: '',
  spec: '',
  price: 0,
  unit: '',
  remark: ''
})

const rules = {
  price: [{ required: true, message: '请输入含税单价', trigger: 'blur' }]
}

// 导入
const importDialogVisible = ref(false)
const importLoading = ref(false)
const importFile = ref(null)
const importResult = ref(null)
const uploadRef = ref()

const loadPrices = async () => {
  loading.value = true
  try {
    const res = await priceApi.getList()
    prices.value = res.prices || []
  } catch (error) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const showAddDialog = () => {
  isEdit.value = false
  Object.assign(form, { id: null, category: '', brand: '', model: '', supplier: '', spec: '', price: 0, unit: '', remark: '' })
  dialogVisible.value = true
}

const editPrice = (row) => {
  isEdit.value = true
  Object.assign(form, {
    id: row.id,
    category: row.category || '',
    brand: row.brand || '',
    model: row.model || '',
    supplier: row.supplier || '',
    spec: row.spec || '',
    price: row.price,
    unit: row.unit || '',
    remark: row.remark || ''
  })
  dialogVisible.value = true
}

const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await priceApi.create({
      category: form.category,
      brand: form.brand,
      model: form.model,
      supplier: form.supplier,
      spec: form.spec,
      price: form.price,
      unit: form.unit,
      remark: form.remark
    })
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    loadPrices()
  } catch (error) {
    ElMessage.error(error.msg || '操作失败')
  } finally {
    submitting.value = false
  }
}

const deletePrice = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除 "${row.brand || ''} ${row.model || ''}" 的价格记录吗？`, '提示', {
      type: 'warning'
    })
    await priceApi.delete(row.id)
    ElMessage.success('删除成功')
    loadPrices()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 导入相关
const showImportDialog = () => {
  importFile.value = null
  importResult.value = null
  importDialogVisible.value = true
}

const handleFileChange = (file) => {
  importFile.value = file.raw
  importResult.value = null
}

const handleFileRemove = () => {
  importFile.value = null
}

const handleImport = async () => {
  if (!importFile.value) return

  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    const res = await priceImportApi.import(formData)
    if (res.ok) {
      importResult.value = res.result
      loadPrices()
    } else {
      ElMessage.error(res.msg || '导入失败')
    }
  } catch (error) {
    ElMessage.error(error.msg || '导入失败')
  } finally {
    importLoading.value = false
  }
}

onMounted(loadPrices)
</script>

<style scoped>
.prices-page {
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

.header-actions {
  display: flex;
  gap: 8px;
}

.import-content {
  min-height: 180px;
}

.upload-tip {
  font-size: 12px;
  color: #86909c;
  margin-top: 4px;
}

.import-result {
  margin-top: 16px;
}

@media (max-width: 768px) {
  .prices-page {
    padding: 12px;
  }

  .page-header {
    margin-bottom: 12px;
  }

  .page-title {
    font-size: 18px;
  }

  .header-actions {
    gap: 4px;
  }
}
</style>
