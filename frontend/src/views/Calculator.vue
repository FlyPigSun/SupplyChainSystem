<template>
  <div class="calculator-page">
    <h2 class="page-title">用量计算器</h2>
    
    <!-- 产品选择 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-header-title">选择产品与数量</span>
          <div class="card-header-actions">
            <el-button size="small" @click="downloadTemplate">
              <el-icon><Download /></el-icon> 下载模板
            </el-button>
            <el-upload
              ref="uploadRef"
              :auto-upload="false"
              :show-file-list="false"
              accept=".xlsx,.xls"
              @change="handleTemplateImport"
            >
              <el-button type="success" size="small">
                <el-icon><Upload /></el-icon> 模板导入
              </el-button>
            </el-upload>
            <el-button type="primary" size="small" @click="addProduct" :disabled="products.length === 0">
              <el-icon><Plus /></el-icon> 添加产品
            </el-button>
          </div>
        </div>
      </template>
      
      <div v-for="(item, index) in selectedProducts" :key="index" class="product-row">
        <el-row :gutter="8" align="middle">
          <el-col :xs="24" :sm="10">
            <el-select 
              v-model="item.productId" 
              placeholder="选择产品"
              filterable
              style="width: 100%"
              size="small"
              @change="onProductChange(index)"
            >
              <el-option 
                v-for="product in products" 
                :key="product.id" 
                :label="`${product.code} - ${product.name}`" 
                :value="product.id" 
              />
            </el-select>
          </el-col>
          <el-col :xs="14" :sm="4">
            <el-input-number v-model="item.quantity" :min="1" :max="99999" size="small" style="width: 100%" />
          </el-col>
          <el-col :xs="4" :sm="2">
            <span class="unit-label">个</span>
          </el-col>
          <el-col :xs="6" :sm="2">
            <el-button type="danger" size="small" @click="removeProduct(index)" :disabled="selectedProducts.length <= 1" link>
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-col>
        </el-row>
      </div>

      <div class="calc-action">
        <el-button type="primary" @click="calculate" :disabled="selectedProducts.every(p => !p.productId)" :loading="calculating">
          <el-icon><EditPen /></el-icon> 计算用量
        </el-button>
        <el-button @click="resetForm">重置</el-button>
      </div>
    </el-card>

    <!-- 导入校验错误对话框 -->
    <el-dialog v-model="showImportErrors" title="模板校验结果" width="600px" :close-on-click-modal="false">
      <el-alert type="error" :closable="false" show-icon style="margin-bottom: 16px">
        <template #title>
          共 {{ importResult.total }} 条数据，{{ importResult.errorCount }} 条校验不通过
        </template>
      </el-alert>
      <el-table :data="importResult.errors" stripe size="small" max-height="360">
        <el-table-column prop="row" label="行号" width="60" align="center" />
        <el-table-column prop="field" label="字段" width="90" />
        <el-table-column label="Excel中的值" width="140">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: 600;">{{ row.excelValue }}</span>
          </template>
        </el-table-column>
        <el-table-column label="数据库中的值" min-width="200">
          <template #default="{ row }">
            <span style="color: #67c23a;">{{ row.dbValue }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="msg" label="说明" min-width="200" show-overflow-tooltip />
      </el-table>
      <template #footer>
        <el-button @click="showImportErrors = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 人工修正对话框 -->
    <CorrectionDialog
      v-model="showCorrectionDialog"
      :source="correctingItem"
      source-label="配方原料信息"
      @saved="onCorrectionSaved"
    />

    <!-- 统计维度切换 -->
    <el-card v-if="calculationDone" shadow="never" class="result-card">
      <template #header>
        <div class="card-header">
          <span class="card-header-title">计算结果</span>
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="product">按产品明细</el-radio-button>
            <el-radio-button value="supplier">按供应商</el-radio-button>
            <el-radio-button value="material">按原料</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 匹配说明 -->
      <div class="match-legend" v-if="hasFuzzyMatch || correctedCount > 0">
        <el-tag v-if="hasFuzzyMatch" type="warning" size="small" effect="dark">非同一品牌，仅供参考</el-tag>
        <el-tag v-if="correctedCount > 0" type="success" size="small" effect="dark">人工修正</el-tag>
        <span class="legend-text">
          <template v-if="hasFuzzyMatch">标记的单价为模糊匹配结果，实际采购价格可能不同</template>
          <template v-if="correctedCount > 0">；绿色标记为人工修正后的匹配</template>
        </span>
      </div>

      <!-- 按产品明细 -->
      <template v-if="viewMode === 'product'">
        <div v-for="(group, pName) in productGroups" :key="pName" class="product-group">
          <div class="group-header">
            <span>{{ pName }}</span>
            <span class="group-cost">成本: ¥{{ group.totalCost.toFixed(2) }}</span>
          </div>
          
          <!-- PC端表格 -->
          <el-table v-if="!isMobile" :data="group.items" stripe size="small">
            <el-table-column prop="materialName" label="原料名称" min-width="120" show-overflow-tooltip />
            <el-table-column prop="unifiedName" label="统一名称" width="90" show-overflow-tooltip />
            <el-table-column prop="supplier" label="供应商" width="80" show-overflow-tooltip />
            <el-table-column prop="brandSpec" label="品牌规格" min-width="120" show-overflow-tooltip />
            <el-table-column label="单个用量" width="90">
              <template #default="{ row }">{{ row.unitWeight.toFixed(2) }}{{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="总用量" width="100">
              <template #default="{ row }">
                <strong>{{ row.totalWeight.toFixed(2) }}{{ row.unit }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="单价(元/kg)" width="140">
              <template #default="{ row }">
                <template v-if="row.price">
                  <span>¥{{ row.price.toFixed(2) }}/{{ row.priceUnit }}</span>
                  <el-tag v-if="row.corrected" type="success" size="small" effect="dark" style="margin-left:4px">已修正</el-tag>
                  <el-tag v-else-if="row.matchType === 'fuzzy'" type="warning" size="small" effect="dark" style="margin-left:4px">非同一品牌</el-tag>
                </template>
                <el-tag v-else type="warning" size="small">未设置</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成本" width="90">
              <template #default="{ row }">
                <strong v-if="row.cost" style="color: #f56c6c;">¥{{ row.cost.toFixed(2) }}</strong>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openCorrectionDialog(row)">修正</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <!-- 移动端卡片 -->
          <div v-else class="mobile-cards">
            <div v-for="(row, idx) in group.items" :key="idx" class="mobile-card">
              <div class="mobile-card-header">
                <div class="mobile-card-title">{{ row.materialName }}</div>
                <el-tag v-if="row.corrected" type="success" size="small" effect="dark">已修正</el-tag>
                <el-tag v-else-if="row.matchType === 'fuzzy'" type="warning" size="small" effect="dark">非同一品牌</el-tag>
              </div>
              <div class="mobile-card-body">
                <div class="mobile-card-row">
                  <span class="mobile-card-label">统一名称</span>
                  <span class="mobile-card-value">{{ row.unifiedName || '-' }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">供应商</span>
                  <span class="mobile-card-value">{{ row.supplier || '-' }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">品牌规格</span>
                  <span class="mobile-card-value">{{ row.brandSpec || '-' }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">单个用量</span>
                  <span class="mobile-card-value">{{ row.unitWeight.toFixed(2) }}{{ row.unit }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">总用量</span>
                  <span class="mobile-card-value mobile-card-strong">{{ row.totalWeight.toFixed(2) }}{{ row.unit }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">单价</span>
                  <span class="mobile-card-value">
                    <template v-if="row.price">¥{{ row.price.toFixed(2) }}/{{ row.priceUnit }}</template>
                    <el-tag v-else type="warning" size="small">未设置</el-tag>
                  </span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">成本</span>
                  <span class="mobile-card-value mobile-card-cost">¥{{ row.cost ? row.cost.toFixed(2) : '-' }}</span>
                </div>
              </div>
              <div class="mobile-card-footer">
                <el-button type="primary" size="small" @click="openCorrectionDialog(row)">修正</el-button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 按供应商 -->
      <template v-if="viewMode === 'supplier'">
        <div v-for="(group, sName) in supplierGroups" :key="sName" class="product-group">
          <div class="group-header">
            <span>{{ sName || '未指定供应商' }}</span>
            <span class="group-cost">合计: ¥{{ group.totalCost.toFixed(2) }} / {{ group.totalWeight.toFixed(2) }}g</span>
          </div>
          
          <!-- PC端表格 -->
          <el-table v-if="!isMobile" :data="group.items" stripe size="small">
            <el-table-column prop="productName" label="产品" width="160" show-overflow-tooltip />
            <el-table-column prop="materialName" label="原料名称" min-width="120" show-overflow-tooltip />
            <el-table-column prop="brandSpec" label="品牌规格" min-width="120" show-overflow-tooltip />
            <el-table-column label="总用量" width="100">
              <template #default="{ row }">
                <strong>{{ row.totalWeight.toFixed(2) }}{{ row.unit }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="单价(元/kg)" width="140">
              <template #default="{ row }">
                <template v-if="row.price">
                  <span>¥{{ row.price.toFixed(2) }}/{{ row.priceUnit }}</span>
                  <el-tag v-if="row.corrected" type="success" size="small" effect="dark" style="margin-left:4px">已修正</el-tag>
                  <el-tag v-else-if="row.matchType === 'fuzzy'" type="warning" size="small" effect="dark" style="margin-left:4px">非同一品牌</el-tag>
                </template>
                <el-tag v-else type="warning" size="small">未设置</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成本" width="90">
              <template #default="{ row }">
                <strong v-if="row.cost" style="color: #f56c6c;">¥{{ row.cost.toFixed(2) }}</strong>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openCorrectionDialog(row)">修正</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <!-- 移动端卡片 -->
          <div v-else class="mobile-cards">
            <div v-for="(row, idx) in group.items" :key="idx" class="mobile-card">
              <div class="mobile-card-header">
                <div class="mobile-card-title">{{ row.productName }}</div>
                <el-tag v-if="row.corrected" type="success" size="small" effect="dark">已修正</el-tag>
                <el-tag v-else-if="row.matchType === 'fuzzy'" type="warning" size="small" effect="dark">非同一品牌</el-tag>
              </div>
              <div class="mobile-card-body">
                <div class="mobile-card-row">
                  <span class="mobile-card-label">原料名称</span>
                  <span class="mobile-card-value">{{ row.materialName }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">品牌规格</span>
                  <span class="mobile-card-value">{{ row.brandSpec || '-' }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">总用量</span>
                  <span class="mobile-card-value mobile-card-strong">{{ row.totalWeight.toFixed(2) }}{{ row.unit }}</span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">单价</span>
                  <span class="mobile-card-value">
                    <template v-if="row.price">¥{{ row.price.toFixed(2) }}/{{ row.priceUnit }}</template>
                    <el-tag v-else type="warning" size="small">未设置</el-tag>
                  </span>
                </div>
                <div class="mobile-card-row">
                  <span class="mobile-card-label">成本</span>
                  <span class="mobile-card-value mobile-card-cost">¥{{ row.cost ? row.cost.toFixed(2) : '-' }}</span>
                </div>
              </div>
              <div class="mobile-card-footer">
                <el-button type="primary" size="small" @click="openCorrectionDialog(row)">修正</el-button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 按原料汇总 -->
      <template v-if="viewMode === 'material'">
        <!-- PC端表格 -->
        <el-table v-if="!isMobile" :data="materialSummary" stripe show-summary :summary-method="getMaterialSummary" size="small">
          <el-table-column prop="unifiedName" label="统一名称" min-width="100" show-overflow-tooltip />
          <el-table-column prop="materialName" label="原料名称" min-width="120" show-overflow-tooltip />
          <el-table-column prop="brandSpec" label="品牌规格" min-width="120" show-overflow-tooltip />
          <el-table-column prop="supplier" label="供应商" width="80" show-overflow-tooltip />
          <el-table-column label="总用量" width="100">
            <template #default="{ row }">
              <strong>{{ row.totalWeight.toFixed(2) }}{{ row.unit }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="单价(元/kg)" width="140">
            <template #default="{ row }">
              <template v-if="row.price">
                <span>¥{{ row.price.toFixed(2) }}/{{ row.priceUnit }}</span>
                <el-tag v-if="row.corrected" type="success" size="small" effect="dark" style="margin-left:4px">已修正</el-tag>
                <el-tag v-else-if="row.matchType === 'fuzzy'" type="warning" size="small" effect="dark" style="margin-left:4px">非同一品牌</el-tag>
              </template>
              <el-tag v-else type="warning" size="small">未设置</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="总成本" width="90">
            <template #default="{ row }">
              <strong v-if="row.cost" style="color: #f56c6c;">¥{{ row.cost.toFixed(2) }}</strong>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 移动端卡片 -->
        <div v-else class="mobile-cards">
          <div v-for="(row, idx) in materialSummary" :key="idx" class="mobile-card">
            <div class="mobile-card-header">
              <div class="mobile-card-title">{{ row.unifiedName || row.materialName }}</div>
              <el-tag v-if="row.corrected" type="success" size="small" effect="dark">已修正</el-tag>
              <el-tag v-else-if="row.matchType === 'fuzzy'" type="warning" size="small" effect="dark">非同一品牌</el-tag>
            </div>
            <div class="mobile-card-body">
              <div class="mobile-card-row" v-if="row.unifiedName">
                <span class="mobile-card-label">原料名称</span>
                <span class="mobile-card-value">{{ row.materialName }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">品牌规格</span>
                <span class="mobile-card-value">{{ row.brandSpec || '-' }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">供应商</span>
                <span class="mobile-card-value">{{ row.supplier || '-' }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">总用量</span>
                <span class="mobile-card-value mobile-card-strong">{{ row.totalWeight.toFixed(2) }}{{ row.unit }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">单价</span>
                <span class="mobile-card-value">
                  <template v-if="row.price">¥{{ row.price.toFixed(2) }}/{{ row.priceUnit }}</template>
                  <el-tag v-else type="warning" size="small">未设置</el-tag>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">总成本</span>
                <span class="mobile-card-value mobile-card-cost">¥{{ row.cost ? row.cost.toFixed(2) : '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 总成本汇总 -->
      <div class="total-cost-bar">
        <div class="total-item">
          <span class="total-label">原料总成本</span>
          <span class="total-value">¥{{ grandTotal.toFixed(2) }}</span>
        </div>
        <div class="total-item" v-if="productCount > 0">
          <span class="total-label">产品数量</span>
          <span class="total-value">{{ productCount }} 种 / {{ totalQuantity }} 个</span>
        </div>
        <div class="total-item" v-if="productCount > 0">
          <span class="total-label">平均单个成本</span>
          <span class="total-value">¥{{ (grandTotal / totalQuantity).toFixed(2) }}</span>
        </div>
        <div class="total-item" v-if="unmatchedCount > 0">
          <span class="total-label">未匹配价格</span>
          <span class="total-value" style="color: #e6a23c;">{{ unmatchedCount }} 项</span>
        </div>
        <div class="total-item" v-if="fuzzyCount > 0">
          <span class="total-label">模糊匹配</span>
          <span class="total-value" style="color: #e6a23c;">{{ fuzzyCount }} 项</span>
        </div>
        <div class="total-item" v-if="correctedCount > 0">
          <span class="total-label">人工修正</span>
          <span class="total-value" style="color: #67c23a;">{{ correctedCount }} 项</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, EditPen, Upload, Download } from '@element-plus/icons-vue'
import { productApi, calculatorApi, logApi, calculatorImportApi } from '../api'
import CorrectionDialog from '../components/CorrectionDialog.vue'

const products = ref([])
const selectedProducts = ref([{ productId: null, quantity: 100 }])
const calculationResult = ref([])
const calculationDone = ref(false)
const viewMode = ref('product')
const calculating = ref(false)

// 响应式布局
const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const handleResize = () => {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// 导入相关
const showImportErrors = ref(false)
const importResult = ref({ total: 0, validCount: 0, errorCount: 0, errors: [], items: [] })

// 修正相关
const showCorrectionDialog = ref(false)
const correctingItem = ref(null)

const addProduct = () => {
  selectedProducts.value.push({ productId: null, quantity: 100 })
}

const removeProduct = (index) => {
  selectedProducts.value.splice(index, 1)
}

const onProductChange = () => {
  calculationDone.value = false
}

const resetForm = () => {
  selectedProducts.value = [{ productId: null, quantity: 100 }]
  calculationResult.value = []
  calculationDone.value = false
}

const loadData = async () => {
  try {
    const res = await productApi.getList()
    products.value = Array.isArray(res.products) ? res.products : []
  } catch (error) {
    console.error('加载数据失败:', error)
    ElMessage.error('加载数据失败')
    products.value = []
  }
}

// 下载模板
const downloadTemplate = async () => {
  try {
    const res = await calculatorImportApi.downloadTemplate()
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '用量计算模板.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('下载模板失败:', error)
    ElMessage.error('下载模板失败')
  }
}

// 模板导入
const handleTemplateImport = async (uploadFile) => {
  if (!uploadFile?.raw) return
  const formData = new FormData()
  formData.append('file', uploadFile.raw)
  try {
    const res = await calculatorImportApi.import(formData)
    if (res.errorCount > 0) {
      importResult.value = res
      showImportErrors.value = true
      return
    }
    if (res.items.length > 0) {
      selectedProducts.value = res.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity
      }))
      calculationDone.value = false
      ElMessage.success(`成功导入 ${res.items.length} 条产品数据`)
    } else {
      ElMessage.warning('模板中无有效数据')
    }
  } catch (error) {
    console.error('模板导入失败:', error)
    ElMessage.error(error.msg || '模板导入失败')
  }
}

// 打开修正对话框
const openCorrectionDialog = (row) => {
  correctingItem.value = row
  showCorrectionDialog.value = true
}

// 修正保存后重新计算
const onCorrectionSaved = async () => {
  await calculate()
}

const calculate = async () => {
  const validItems = selectedProducts.value.filter(p => p.productId && p.quantity > 0)
  if (validItems.length === 0) {
    ElMessage.warning('请至少选择一个产品')
    return
  }

  calculating.value = true
  try {
    const res = await calculatorApi.calculate(validItems)
    if (res.ok) {
      calculationResult.value = res.results
      calculationDone.value = true

      const fuzzyItems = res.results.filter(r => r.matchType === 'fuzzy')
      const unmatchedItems = res.results.filter(r => !r.matchType)
      const correctedItems = res.results.filter(r => r.corrected)
      if (fuzzyItems.length > 0 || unmatchedItems.length > 0 || correctedItems.length > 0) {
        const msgs = []
        if (correctedItems.length > 0) msgs.push(`${correctedItems.length} 项人工修正`)
        if (fuzzyItems.length > 0) msgs.push(`${fuzzyItems.length} 项模糊匹配（非同一品牌）`)
        if (unmatchedItems.length > 0) msgs.push(`${unmatchedItems.length} 项未匹配价格`)
        ElMessage.warning({ message: msgs.join('，'), duration: 5000 })
      }

      const productNames = validItems.map(item => {
        const prod = products.value.find(p => p.id === item.productId)
        return prod ? `${prod.name}×${item.quantity}` : ''
      }).filter(Boolean).join(', ')
      try {
        await logApi.add('calculator', `用量计算: ${productNames}, 总成本¥${res.results.reduce((s, i) => s + (i.cost || 0), 0).toFixed(2)}`)
      } catch (e) {}
    }
  } catch (error) {
    console.error('计算失败:', error)
    ElMessage.error(error.msg || '计算失败')
  } finally {
    calculating.value = false
  }
}

// 按产品分组
const productGroups = computed(() => {
  const groups = {}
  calculationResult.value.forEach(item => {
    const key = `${item.productName} (×${selectedProducts.value.find(p => p.productId === item.productId)?.quantity || 0})`
    if (!groups[key]) groups[key] = { items: [], totalCost: 0 }
    groups[key].items.push(item)
    groups[key].totalCost += (item.cost || 0)
  })
  return groups
})

// 按供应商分组
const supplierGroups = computed(() => {
  const groups = {}
  calculationResult.value.forEach(item => {
    const key = item.supplier || '未指定供应商'
    if (!groups[key]) groups[key] = { items: [], totalCost: 0, totalWeight: 0 }
    groups[key].items.push(item)
    groups[key].totalCost += (item.cost || 0)
    groups[key].totalWeight += item.totalWeight
  })
  return groups
})

// 按原料汇总
const materialSummary = computed(() => {
  const map = {}
  calculationResult.value.forEach(item => {
    const key = `${item.unifiedName}||${item.brandSpec || item.materialName}`
    if (!map[key]) map[key] = { ...item, totalWeight: 0, cost: 0 }
    map[key].totalWeight += item.totalWeight
    map[key].cost = (map[key].cost || 0) + (item.cost || 0)
  })
  return Object.values(map)
})

const grandTotal = computed(() => {
  return calculationResult.value.reduce((sum, item) => sum + (item.cost || 0), 0)
})

const productCount = computed(() => {
  return new Set(calculationResult.value.map(i => i.productId)).size
})

const totalQuantity = computed(() => {
  return selectedProducts.value.filter(p => p.productId && p.quantity > 0).reduce((sum, p) => sum + p.quantity, 0)
})

const hasFuzzyMatch = computed(() => {
  return calculationResult.value.some(r => r.matchType === 'fuzzy')
})

const fuzzyCount = computed(() => {
  return calculationResult.value.filter(r => r.matchType === 'fuzzy').length
})

const unmatchedCount = computed(() => {
  return calculationResult.value.filter(r => !r.matchType).length
})

const correctedCount = computed(() => {
  return calculationResult.value.filter(r => r.corrected).length
})

const getMaterialSummary = ({ columns, data }) => {
  const sums = []
  columns.forEach((col, index) => {
    if (index === 0) {
      sums[index] = '合计'
    } else if (col.property === 'totalWeight') {
      sums[index] = data.reduce((s, r) => s + r.totalWeight, 0).toFixed(2)
    } else if (col.property === 'cost') {
      const total = data.reduce((s, r) => s + (r.cost || 0), 0)
      sums[index] = total > 0 ? `¥${total.toFixed(2)}` : '-'
    } else {
      sums[index] = ''
    }
  })
  return sums
}
</script>

<style scoped>
.calculator-page {
  padding: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
  margin: 0 0 16px 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.card-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}

.product-row {
  margin-bottom: 8px;
}

.unit-label {
  color: #86909c;
  font-size: 13px;
  line-height: 28px;
}

.calc-action {
  margin-top: 14px;
  display: flex;
  gap: 8px;
}

.result-card {
  margin-top: 16px;
}

.match-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fdf6ec;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
}

.legend-text {
  color: #86909c;
  font-size: 12px;
}

.product-group {
  margin-bottom: 16px;
}

.product-group:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f7f8fa;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
}

.group-cost {
  color: #f56c6c;
  font-size: 13px;
  font-weight: 500;
}

.total-cost-bar {
  margin-top: 16px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #1f4e79, #2e75b6);
  border-radius: 8px;
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}

.total-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.total-label {
  color: rgba(255,255,255,0.7);
  font-size: 12px;
}

.total-value {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

/* 响应式 */
@media (max-width: 768px) {
  .calculator-page {
    padding: 12px;
  }

  .page-title {
    font-size: 18px;
    margin-bottom: 12px;
  }

  .card-header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .total-cost-bar {
    padding: 12px 14px;
    gap: 16px;
  }

  .total-value {
    font-size: 16px;
  }
}

/* 移动端卡片样式 */
.mobile-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-card {
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  overflow: hidden;
}

.mobile-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #f7f8fa;
  border-bottom: 1px solid #e5e6eb;
}

.mobile-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  flex: 1;
}

.mobile-card-body {
  padding: 12px 14px;
}

.mobile-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #f2f3f5;
}

.mobile-card-row:last-child {
  border-bottom: none;
}

.mobile-card-label {
  font-size: 13px;
  color: #86909c;
  flex-shrink: 0;
  margin-right: 12px;
}

.mobile-card-value {
  font-size: 13px;
  color: #1d2129;
  text-align: right;
  word-break: break-all;
}

.mobile-card-strong {
  font-weight: 600;
  color: #1d2129;
}

.mobile-card-cost {
  font-size: 15px;
  font-weight: 700;
  color: #f56c6c;
}

.mobile-card-footer {
  padding: 10px 14px;
  background: #f7f8fa;
  border-top: 1px solid #e5e6eb;
  text-align: right;
}
</style>
