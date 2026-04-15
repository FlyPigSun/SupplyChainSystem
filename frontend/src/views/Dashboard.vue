<template>
  <div class="dashboard">
    <h2 class="page-title">数据看板</h2>
    
    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="8">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-item">
            <div class="stat-icon" style="background: linear-gradient(135deg, #409EFF, #66b1ff);">
              <el-icon :size="24"><Goods /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.productCount }}</div>
              <div class="stat-label">产品总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="12" :sm="8">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-item">
            <div class="stat-icon" style="background: linear-gradient(135deg, #67C23A, #85ce61);">
              <el-icon :size="24"><Collection /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.materialCount }}</div>
              <div class="stat-label">原料种类</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="12" :sm="8">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-item">
            <div class="stat-icon" style="background: linear-gradient(135deg, #E6A23C, #ebb563);">
              <el-icon :size="24"><PriceTag /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.priceCount }}</div>
              <div class="stat-label">价格记录</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    
    <!-- TOP10 图表 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :sm="8">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">原料使用 TOP10</span>
            </div>
          </template>
          <el-table :data="materialStats" size="small" :max-height="400">
            <el-table-column type="index" label="#" width="40" />
            <el-table-column prop="material_name" label="原料名称" show-overflow-tooltip />
            <el-table-column prop="product_count" label="使用产品数" width="90" align="center">
              <template #default="{ row }">
                <span class="count-badge">{{ row.product_count }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="8">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">供应商覆盖产品 TOP10</span>
            </div>
          </template>
          <el-table :data="supplierStats" size="small" :max-height="400">
            <el-table-column type="index" label="#" width="40" />
            <el-table-column prop="supplier" label="供应商" show-overflow-tooltip />
            <el-table-column prop="product_count" label="覆盖产品数" width="90" align="center">
              <template #default="{ row }">
                <span class="count-badge primary">{{ row.product_count }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="8">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-header-title">原料品牌覆盖产品 TOP10</span>
            </div>
          </template>
          <el-table :data="brandStats" size="small" :max-height="400">
            <el-table-column type="index" label="#" width="40" />
            <el-table-column prop="brand" label="品牌" show-overflow-tooltip />
            <el-table-column prop="product_count" label="覆盖产品数" width="90" align="center">
              <template #default="{ row }">
                <span class="count-badge success">{{ row.product_count }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { productApi, materialApi, priceApi } from '../api'

const stats = ref({
  productCount: 0,
  materialCount: 0,
  priceCount: 0
})

const materialStats = ref([])
const supplierStats = ref([])
const brandStats = ref([])

const loadStats = async () => {
  try {
    const [productsRes, materialsRes, pricesRes] = await Promise.all([
      productApi.getList(),
      materialApi.getList(),
      priceApi.getList()
    ])
    
    stats.value.productCount = productsRes.products?.length || 0
    stats.value.materialCount = materialsRes.materials?.length || 0
    stats.value.priceCount = pricesRes.prices?.length || 0
    
    const [statsRes, supplierRes, brandRes] = await Promise.all([
      materialApi.getStats(),
      materialApi.getSupplierStats(),
      materialApi.getBrandStats()
    ])
    
    materialStats.value = statsRes.stats?.slice(0, 10) || []
    supplierStats.value = supplierRes.stats || []
    brandStats.value = brandRes.stats || []
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

onMounted(loadStats)
</script>

<style scoped>
.dashboard {
  padding: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d2129;
  margin: 0 0 20px 0;
}

/* 统计卡片 */
.stats-row {
  margin-bottom: 20px;
}

.stats-row .el-col {
  margin-bottom: 12px;
}

.stat-card {
  border-radius: 8px;
}

.stat-card :deep(.el-card__body) {
  padding: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1d2129;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #86909c;
  margin-top: 4px;
}

/* 图表卡片 */
.chart-row .el-col {
  margin-bottom: 16px;
}

.chart-card {
  border-radius: 8px;
}

.chart-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.chart-card :deep(.el-card__body) {
  padding: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d2129;
}

.count-badge {
  display: inline-block;
  min-width: 28px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  background: #f2f3f5;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1d2129;
  padding: 0 6px;
}

.count-badge.primary {
  background: #ecf5ff;
  color: #409eff;
}

.count-badge.success {
  background: #f0f9eb;
  color: #67c23a;
}

/* 响应式 */
@media (max-width: 768px) {
  .dashboard {
    padding: 12px;
  }

  .page-title {
    font-size: 18px;
    margin-bottom: 16px;
  }

  .stat-card :deep(.el-card__body) {
    padding: 16px;
  }

  .stat-icon {
    width: 40px;
    height: 40px;
  }

  .stat-icon :deep(.el-icon) {
    font-size: 20px;
  }

  .stat-value {
    font-size: 20px;
  }

  .stat-label {
    font-size: 12px;
  }
}
</style>
