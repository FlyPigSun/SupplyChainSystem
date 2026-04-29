<template>
  <div class="bom-check-page">
    <h2 class="page-title">成本核查</h2>
    <p class="page-desc">上传成本核算表 Excel 文件，自动核查配方构成与价格是否与系统数据一致。</p>

    <!-- 上传区域 -->
    <el-card shadow="never" class="upload-card">
      <div class="card-section-title">上传成本核算表</div>
      
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
          <div class="main-text">点击或拖拽上传成本核算表 (.xlsx)</div>
          <div class="sub-text">自动识别品名和分节（面团/馅料/装饰/包材）</div>
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
        <span v-if="loading" style="margin-left: 8px"><el-icon class="is-loading"><Loading /></el-icon></span>
      </div>

      <div v-if="hasResult" class="action-bar">
        <el-button size="small" @click="clearResult">
          <el-icon><Delete /></el-icon> 清除核查结果
        </el-button>
      </div>
    </el-card>

    <!-- 人工修正对话框 -->
    <CorrectionDialog
      v-model="showCorrectionDialog"
      :source="correctingItem"
      source-label="核算表原料信息"
      @saved="onCorrectionSaved"
    />

    <!-- 核查结果 -->
    <div v-if="hasResult" class="result-section">
      <el-alert
        v-if="result.productName"
        type="info" :closable="false" class="product-alert"
      >
        <template #title>
          <span>品名：{{ result.productName }}</span>
          <span v-if="result.productWeight"> | 克重：{{ result.productWeight }}g</span>
          <span v-if="result.yieldRate !== null && result.yieldRate !== undefined"> | 出成率：{{ result.yieldRate }}%</span>
          <span v-if="result.factoryPrice !== null && result.factoryPrice !== undefined"> | 出厂价：¥{{ result.factoryPrice.toFixed(2) }}</span>
          <span v-if="result.netWeight !== null && result.netWeight !== undefined"> | 净含量：{{ result.netWeight }}g</span>
        </template>
      </el-alert>
      <!-- 模板校验错误提示 -->
      <el-alert
        v-if="result._validationErrors && result._validationErrors.length > 0"
        type="error" :closable="false" class="product-alert validation-alert" show-icon
      >
        <template #title>
          <div class="validation-title">模板格式错误，请修正后重新上传</div>
        </template>
        <div class="validation-list">
          <div v-for="(err, idx) in result._validationErrors" :key="idx" class="validation-item">
            {{ idx + 1 }}. {{ err }}
          </div>
        </div>
      </el-alert>

      <el-alert 
        v-if="result.matchedProductCount === 0 && !(result._validationErrors?.length > 0)" 
        title="未匹配到系统产品，仅显示价格核查" 
        type="warning" :closable="false" class="product-alert"
      />
      <el-alert 
        v-if="(result.fuzzyCount > 0 || result.flavorDiffCount > 0) && !(result._validationErrors?.length > 0)" 
        :title="matchWarningTitle"
        type="warning" :closable="false" class="product-alert" show-icon
      />
      <el-alert
        v-if="result.correctedCount > 0 && !(result._validationErrors?.length > 0)"
        :title="`${result.correctedCount} 项原料已应用人工修正匹配，标有「已修正」标签`"
        type="success" :closable="false" class="product-alert" show-icon
      />
      <el-alert
        v-if="result.costWarnings && result.costWarnings.length > 0 && !(result._validationErrors?.length > 0)"
        :title="`成本占比异常：${result.costWarnings.map(w => w.label + ' ' + (w.percent !== null ? w.percent + '%' : '缺失')).join('、')}`"
        type="error" :closable="false" class="product-alert" show-icon
      />

      <el-row :gutter="12" class="summary-row">
        <el-col :xs="12" :sm="6">
          <div class="summary-item">
            <div class="summary-label">匹配产品</div>
            <div class="summary-value">{{ result.matchedProductCount }} 个</div>
            <div class="summary-sub" v-if="result.matchedProducts?.length">
              {{ result.matchedProducts.map(p => p.name).join(', ') }}
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="summary-item">
            <div class="summary-label">核算表原料</div>
            <div class="summary-value">{{ result.auditMaterialCount }} 种</div>
            <div class="summary-sub" v-if="result.auditSections?.length">
              分节: {{ result.auditSections.join(', ') }}
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="summary-item" :class="{ 'has-diff': result.formulaDiffCount > 0 }">
            <div class="summary-label">配方差异</div>
            <div class="summary-value" :class="{ 'diff-text': result.formulaDiffCount > 0 }">
              {{ result.formulaDiffCount }} 项
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="summary-item" :class="{ 'has-diff': priceDiffTotal > 0 }">
            <div class="summary-label">价格异常</div>
            <div class="summary-value" :class="{ 'diff-text': priceDiffTotal > 0 }">
              {{ priceDiffTotal }} 项
            </div>
            <div class="summary-sub" v-if="result.fuzzyCount > 0 || result.flavorDiffCount > 0 || result.correctedCount > 0">
              <span v-if="result.correctedCount" class="success-sub">修正 {{ result.correctedCount }}</span>
              <span v-if="result.fuzzyCount" class="warn-sub">模糊 {{ result.fuzzyCount }}</span>
              <span v-if="result.flavorDiffCount" class="warn-sub">口味差异 {{ result.flavorDiffCount }}</span>
              <span v-if="result.noPriceCount" class="warn-sub">未匹配 {{ result.noPriceCount }}</span>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 成本占比分析 -->
      <el-card v-if="result.costItems && result.costItems.length > 0" shadow="never" class="result-card">
        <template #header>
          <div class="card-header">
            <span class="card-header-title">成本占比分析</span>
            <div class="card-header-tags">
              <el-tag v-if="!result.costWarnings || result.costWarnings.length === 0" type="success" size="small">占比正常</el-tag>
              <el-tag v-else type="danger" size="small">{{ result.costWarnings.length }} 项异常</el-tag>
              <span v-if="result.totalPrice" class="cost-total">基数：¥{{ result.totalPrice.toFixed(2) }}</span>
            </div>
          </div>
        </template>
        
        <!-- PC端表格 -->
        <el-table v-if="!isMobile" :data="result.costItems" stripe size="small" :row-class-name="costRowClass">
          <el-table-column prop="label" label="费用项" width="120" />
          <el-table-column label="Excel 匹配" width="120">
            <template #default="{ row }">
              <span>{{ row.excelKey }}</span>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="100">
            <template #default="{ row }">
              <span v-if="row.amount !== null && row.amount !== undefined">¥{{ row.amount.toFixed(2) }}</span>
              <span v-else class="no-data">-</span>
            </template>
          </el-table-column>
          <el-table-column label="占比" width="100">
            <template #default="{ row }">
              <span v-if="row.percent !== null" :class="{ 'diff-amount': row.status === 'warning' }">
                {{ row.percent.toFixed(1) }}%
              </span>
              <span v-else class="no-data">-</span>
            </template>
          </el-table-column>
          <el-table-column label="合理区间" width="130">
            <template #default="{ row }">
              <span v-if="row.min !== null && row.max !== null">{{ row.min }}% ~ {{ row.max }}%</span>
              <span v-else-if="row.min !== null">≥ {{ row.min }}%</span>
              <span v-else-if="row.max !== null">≤ {{ row.max }}%</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" fixed="right">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'ok'" type="success" size="small">正常</el-tag>
              <el-tag v-else-if="row.status === 'warning'" type="danger" size="small">异常</el-tag>
              <el-tag v-else-if="row.status === 'missing'" type="warning" size="small">缺失</el-tag>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 移动端卡片 -->
        <div v-else class="mobile-cards">
          <div v-for="(row, idx) in result.costItems" :key="idx" class="mobile-card" :class="{ 'mobile-card-warning': row.status === 'warning', 'mobile-card-missing': row.status === 'missing' }">
            <div class="mobile-card-header">
              <div class="mobile-card-title">{{ row.label }}</div>
              <el-tag v-if="row.status === 'ok'" type="success" size="small">正常</el-tag>
              <el-tag v-else-if="row.status === 'warning'" type="danger" size="small">异常</el-tag>
              <el-tag v-else-if="row.status === 'missing'" type="warning" size="small">缺失</el-tag>
            </div>
            <div class="mobile-card-body">
              <div class="mobile-card-row">
                <span class="mobile-card-label">Excel 匹配</span>
                <span class="mobile-card-value">{{ row.excelKey || '-' }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">金额</span>
                <span class="mobile-card-value">
                  <template v-if="row.amount !== null && row.amount !== undefined">¥{{ row.amount.toFixed(2) }}</template>
                  <span v-else class="no-data">-</span>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">占比</span>
                <span class="mobile-card-value" :class="{ 'diff-amount': row.status === 'warning' }">
                  <template v-if="row.percent !== null">{{ row.percent.toFixed(1) }}%</template>
                  <span v-else class="no-data">-</span>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">Excel占比</span>
                <span class="mobile-card-value">
                  <template v-if="row.percent !== null && row.percent !== undefined">{{ row.percent.toFixed(1) }}%</template>
                  <span v-else class="no-data">-</span>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">合理区间</span>
                <span class="mobile-card-value">
                  <template v-if="row.min !== null && row.max !== null">{{ row.min }}% ~ {{ row.max }}%</template>
                  <template v-else-if="row.min !== null">≥ {{ row.min }}%</template>
                  <template v-else-if="row.max !== null">≤ {{ row.max }}%</template>
                  <span v-else>-</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="result.costWarnings && result.costWarnings.length > 0" class="cost-warning-list">
          <div v-for="w in result.costWarnings" :key="w.id" class="cost-warning-item">
            <el-icon color="#f56c6c"><WarningFilled /></el-icon>
            <span>{{ w.message }}</span>
          </div>
        </div>
      </el-card>

      <!-- 配方构成差异 -->
      <el-card v-if="result.matchedProductCount > 0" shadow="never" class="result-card">
        <template #header>
          <div class="card-header">
            <span class="card-header-title">配方构成差异（面团部分）</span>
            <el-tag v-if="result.formulaDiffCount === 0" type="success" size="small">一致</el-tag>
            <el-tag v-else type="warning" size="small">{{ result.formulaDiffCount }} 项差异</el-tag>
          </div>
        </template>
        
        <!-- PC端表格 -->
        <el-table v-if="!isMobile && result.formulaDiffs?.length" :data="result.formulaDiffs" stripe size="small">
          <el-table-column prop="name" label="原料名称" min-width="120" show-overflow-tooltip />
          <el-table-column prop="brandSpec" label="品牌规格" min-width="120" show-overflow-tooltip />
          <el-table-column label="核算表用量" width="100">
            <template #default="{ row }">
              <span v-if="row.auditWeightG !== null">{{ row.auditWeightG.toFixed(2) }} g</span>
              <el-tag v-else type="info" size="small">无</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="系统用量" width="100">
            <template #default="{ row }">
              <span v-if="row.sysWeightG !== null">{{ row.sysWeightG.toFixed(2) }} g</span>
              <el-tag v-else type="info" size="small">无</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="差异" width="80">
            <template #default="{ row }">
              <span v-if="row.weightDiff !== undefined" :class="{ 'diff-amount': Math.abs(row.weightDiff) > 0.01 }">
                {{ row.weightDiff > 0 ? '+' : '' }}{{ row.weightDiff.toFixed(2) }}
              </span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" fixed="right">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'ok'" type="success" size="small">一致</el-tag>
              <el-tag v-else-if="row.status === 'diff'" type="warning" size="small">用量不符</el-tag>
              <el-tag v-else-if="row.status === 'missing'" type="danger" size="small">系统无</el-tag>
              <el-tag v-else-if="row.status === 'extra'" type="info" size="small">核算表无</el-tag>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 移动端卡片 -->
        <div v-else-if="result.formulaDiffs?.length" class="mobile-cards">
          <div v-for="(row, idx) in result.formulaDiffs" :key="idx" class="mobile-card">
            <div class="mobile-card-header">
              <div class="mobile-card-title">{{ row.name }}</div>
              <el-tag v-if="row.status === 'ok'" type="success" size="small">一致</el-tag>
              <el-tag v-else-if="row.status === 'diff'" type="warning" size="small">用量不符</el-tag>
              <el-tag v-else-if="row.status === 'missing'" type="danger" size="small">系统无</el-tag>
              <el-tag v-else-if="row.status === 'extra'" type="info" size="small">核算表无</el-tag>
            </div>
            <div class="mobile-card-body">
              <div class="mobile-card-row">
                <span class="mobile-card-label">品牌规格</span>
                <span class="mobile-card-value">{{ row.brandSpec || '-' }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">核算表用量</span>
                <span class="mobile-card-value">
                  <template v-if="row.auditWeightG !== null">{{ row.auditWeightG.toFixed(2) }} g</template>
                  <el-tag v-else type="info" size="small">无</el-tag>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">系统用量</span>
                <span class="mobile-card-value">
                  <template v-if="row.sysWeightG !== null">{{ row.sysWeightG.toFixed(2) }} g</template>
                  <el-tag v-else type="info" size="small">无</el-tag>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">差异</span>
                <span class="mobile-card-value" :class="{ 'diff-amount': row.weightDiff !== undefined && Math.abs(row.weightDiff) > 0.01 }">
                  <template v-if="row.weightDiff !== undefined">{{ row.weightDiff > 0 ? '+' : '' }}{{ row.weightDiff.toFixed(2) }}</template>
                  <span v-else>-</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <el-empty v-else description="无配方差异数据" :image-size="60" />
      </el-card>

      <!-- 价格差异 -->
      <el-card shadow="never" class="result-card">
        <template #header>
          <div class="card-header">
            <span class="card-header-title">价格核查（所有分节）</span>
            <div class="card-header-tags">
              <el-tag v-if="result.priceDiffCount === 0 && result.fuzzyCount === 0 && result.flavorDiffCount === 0 && result.correctedCount === 0" type="success" size="small">一致</el-tag>
              <template v-else>
                <el-tag v-if="result.correctedCount > 0" type="success" size="small" style="margin-right:4px">已修正 {{ result.correctedCount }}</el-tag>
                <el-tag v-if="result.priceDiffCount > 0" type="danger" size="small" style="margin-right:4px">价格差异 {{ result.priceDiffCount }}</el-tag>
                <el-tag v-if="result.fuzzyCount > 0" type="warning" size="small" style="margin-right:4px">模糊匹配 {{ result.fuzzyCount }}</el-tag>
                <el-tag v-if="result.flavorDiffCount > 0" type="warning" size="small">口味差异 {{ result.flavorDiffCount }}</el-tag>
              </template>
            </div>
          </div>
        </template>
        <!-- PC端表格 -->
        <el-table v-if="!isMobile && result.priceDiffs?.length" :data="result.priceDiffs" stripe size="small" :row-class-name="priceRowClass">
          <el-table-column prop="name" label="原料名称" min-width="100" show-overflow-tooltip />
          <el-table-column prop="brandSpec" label="品牌规格" min-width="100" show-overflow-tooltip />
          <el-table-column prop="section" label="分节" width="70">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.section || '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="核算表含税价" width="110">
            <template #default="{ row }">
              <span v-if="row.auditTaxPrice !== null">¥{{ row.auditTaxPrice.toFixed(2) }}</span>
              <el-tag v-else type="info" size="small">无</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="核算表不含税" width="110">
            <template #default="{ row }">
              <span v-if="row.auditExTaxPrice">¥{{ row.auditExTaxPrice.toFixed(2) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="Excel占比" width="90">
            <template #default="{ row }">
              <span v-if="row.percent !== null && row.percent !== undefined">{{ row.percent.toFixed(1) }}%</span>
              <span v-else class="no-data">-</span>
            </template>
          </el-table-column>
          <el-table-column label="原料库价格" width="140">
            <template #default="{ row }">
              <div v-if="row.sysPrice !== null">
                <div class="sys-price-original">¥{{ row.sysPrice.toFixed(2) }}<span v-if="row.originalSysUnit">/{{ row.originalSysUnit }}</span></div>
                <div v-if="row.sysStandardPrice !== null && row.sysStandardUnit" class="sys-price-converted">
                  ¥{{ row.sysStandardPrice.toFixed(2) }}/{{ row.sysStandardUnit }}<span v-if="row.unitSource" class="unit-source-hint">（{{ row.unitSource }}）</span>
                </div>
              </div>
              <el-tag v-else type="info" size="small">无</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="匹配信息" min-width="160">
            <template #default="{ row }">
              <div class="match-info">
                <el-tag v-if="row.corrected" type="success" size="small" effect="dark">已修正</el-tag>
                <el-tag v-else-if="row.matchType === 'exact'" type="success" size="small">精确匹配</el-tag>
                <el-tag v-else-if="row.matchType === 'brand_model'" size="small">品牌匹配</el-tag>
                <el-tag v-else-if="row.matchType === 'flavor_diff'" type="warning" size="small">口味不同</el-tag>
                <el-tag v-else-if="row.matchType === 'fuzzy'" type="danger" size="small">非同一原料</el-tag>
                <el-tag v-else-if="row.matchType === null" type="info" size="small">未匹配</el-tag>
                <span v-if="row.sysBrand" class="match-detail">{{ row.sysBrand }} {{ row.sysModel }}</span>
              </div>
              <div v-if="row.warnings?.length" class="match-warnings">
                <div v-for="(w, i) in row.warnings" :key="i" class="warning-text">{{ w }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="差异" width="80">
            <template #default="{ row }">
              <span v-if="row.diff !== undefined && row.diff !== null" :class="{ 'diff-amount': row.diff > 0 }">
                {{ row.diff > 0 ? '+' : '' }}{{ row.diff.toFixed(2) }}
              </span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" fixed="right">
            <template #default="{ row }">
              <el-tag v-if="row.corrected" type="success" size="small">已修正</el-tag>
              <el-tag v-else-if="row.status === 'ok'" type="success" size="small">一致</el-tag>
              <el-tag v-else-if="row.status === 'diff'" type="warning" size="small">价格不符</el-tag>
              <el-tag v-else-if="row.status === 'flavor_diff'" type="warning" size="small">口味不同</el-tag>
              <el-tag v-else-if="row.status === 'fuzzy'" type="danger" size="small">仅供参考</el-tag>
              <el-tag v-else-if="row.status === 'noprice'" type="info" size="small">未匹配</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openCorrectionDialog(row)">修正</el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 移动端卡片 -->
        <div v-else-if="result.priceDiffs?.length" class="mobile-cards">
          <div v-for="(row, idx) in result.priceDiffs" :key="idx" class="mobile-card" :class="{ 'mobile-card-fuzzy': row.matchType === 'fuzzy', 'mobile-card-flavor': row.matchType === 'flavor_diff', 'mobile-card-corrected': row.corrected }">
            <div class="mobile-card-header">
              <div class="mobile-card-title">{{ row.name }}</div>
              <el-tag size="small" type="info">{{ row.section || '-' }}</el-tag>
            </div>
            <div class="mobile-card-body">
              <div class="mobile-card-row">
                <span class="mobile-card-label">品牌规格</span>
                <span class="mobile-card-value">{{ row.brandSpec || '-' }}</span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">核算表含税价</span>
                <span class="mobile-card-value">
                  <template v-if="row.auditTaxPrice !== null">¥{{ row.auditTaxPrice.toFixed(2) }}</template>
                  <el-tag v-else type="info" size="small">无</el-tag>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">核算表不含税</span>
                <span class="mobile-card-value">
                  <template v-if="row.auditExTaxPrice">¥{{ row.auditExTaxPrice.toFixed(2) }}</template>
                  <span v-else>-</span>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">Excel占比</span>
                <span class="mobile-card-value">
                  <template v-if="row.percent !== null && row.percent !== undefined">{{ row.percent.toFixed(1) }}%</template>
                  <span v-else class="no-data">-</span>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">原料库价格</span>
                <span class="mobile-card-value">
                  <template v-if="row.sysPrice !== null">
                    <div class="mobile-sys-price">
                      <div class="sys-price-original">¥{{ row.sysPrice.toFixed(2) }}<span v-if="row.originalSysUnit">/{{ row.originalSysUnit }}</span></div>
                      <div v-if="row.sysStandardPrice !== null && row.sysStandardUnit" class="sys-price-converted">
                        ¥{{ row.sysStandardPrice.toFixed(2) }}/{{ row.sysStandardUnit }}
                      </div>
                    </div>
                  </template>
                  <el-tag v-else type="info" size="small">无</el-tag>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">匹配信息</span>
                <span class="mobile-card-value">
                  <div class="match-info">
                    <el-tag v-if="row.corrected" type="success" size="small" effect="dark">已修正</el-tag>
                    <el-tag v-else-if="row.matchType === 'exact'" type="success" size="small">精确匹配</el-tag>
                    <el-tag v-else-if="row.matchType === 'brand_model'" size="small">品牌匹配</el-tag>
                    <el-tag v-else-if="row.matchType === 'flavor_diff'" type="warning" size="small">口味不同</el-tag>
                    <el-tag v-else-if="row.matchType === 'fuzzy'" type="danger" size="small">非同一原料</el-tag>
                    <el-tag v-else-if="row.matchType === null" type="info" size="small">未匹配</el-tag>
                  </div>
                  <div v-if="row.sysBrand" class="match-detail">{{ row.sysBrand }} {{ row.sysModel }}</div>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">差异</span>
                <span class="mobile-card-value" :class="{ 'diff-amount': row.diff > 0 }">
                  <template v-if="row.diff !== undefined && row.diff !== null">{{ row.diff > 0 ? '+' : '' }}{{ row.diff.toFixed(2) }}</template>
                  <span v-else>-</span>
                </span>
              </div>
              <div class="mobile-card-row">
                <span class="mobile-card-label">状态</span>
                <span class="mobile-card-value">
                  <el-tag v-if="row.corrected" type="success" size="small">已修正</el-tag>
                  <el-tag v-else-if="row.status === 'ok'" type="success" size="small">一致</el-tag>
                  <el-tag v-else-if="row.status === 'diff'" type="warning" size="small">价格不符</el-tag>
                  <el-tag v-else-if="row.status === 'flavor_diff'" type="warning" size="small">口味不同</el-tag>
                  <el-tag v-else-if="row.status === 'fuzzy'" type="danger" size="small">仅供参考</el-tag>
                  <el-tag v-else-if="row.status === 'noprice'" type="info" size="small">未匹配</el-tag>
                </span>
              </div>
            </div>
            <div class="mobile-card-footer">
              <el-button type="primary" size="small" @click="openCorrectionDialog(row)">修正</el-button>
            </div>
          </div>
        </div>
        
        <el-empty v-else description="无价格核查数据" :image-size="60" />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Document, Delete, Loading, WarningFilled } from '@element-plus/icons-vue'
import { bomCheckApi } from '../api'
import CorrectionDialog from '../components/CorrectionDialog.vue'

const fileInput = ref(null)
const isDragging = ref(false)
const fileInfo = ref('')
const result = ref(null)
const loading = ref(false)
const lastFile = ref(null)

const showCorrectionDialog = ref(false)
const correctingItem = ref(null)

// 响应式布局
const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

const handleResize = () => {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

const hasResult = computed(() => result.value !== null)

const totalPrice = computed(() => result.value?.totalPrice || 0)

const priceDiffTotal = computed(() => {
  if (!result.value) return 0
  return result.value.priceDiffCount + result.value.fuzzyCount + result.value.flavorDiffCount
})

const matchWarningTitle = computed(() => {
  if (!result.value) return ''
  const parts = []
  if (result.value.fuzzyCount > 0) parts.push(`${result.value.fuzzyCount} 项与原料库非同一原料，成本仅供参考`)
  if (result.value.flavorDiffCount > 0) parts.push(`${result.value.flavorDiffCount} 项口味与原料库不一致`)
  return parts.join('；')
})

const priceRowClass = ({ row }) => {
  if (row.corrected) return 'corrected-row'
  if (row.matchType === 'fuzzy') return 'fuzzy-row'
  if (row.matchType === 'flavor_diff') return 'flavor-diff-row'
  return ''
}

const costRowClass = ({ row }) => {
  if (row.status === 'warning') return 'cost-warning-row'
  if (row.status === 'missing') return 'cost-missing-row'
  return ''
}

const handleFileChange = (e) => {
  const file = e.target.files[0]
  if (file) processFile(file)
}

const handleDrop = (e) => {
  isDragging.value = false
  const file = e.dataTransfer.files[0]
  if (file) processFile(file)
}

const processFile = async (file) => {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    ElMessage.error('只支持 .xlsx 或 .xls 文件')
    return
  }
  fileInfo.value = `正在核查：${file.name}...`
  loading.value = true
  lastFile.value = file

  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await bomCheckApi.check(formData)
    if (res.ok) {
      result.value = res
      fileInfo.value = `${file.name} 核查完成 — 品名: ${res.productName || '未识别'}`
      ElMessage.success('核查完成')
    } else {
      ElMessage.error(res.msg || '核查失败')
      fileInfo.value = ''
    }
  } catch (error) {
    console.error('核查失败:', error)
    ElMessage.error('核查失败：' + (error.msg || '未知错误'))
    fileInfo.value = ''
  } finally {
    loading.value = false
  }
}

const openCorrectionDialog = (row) => {
  correctingItem.value = row
  showCorrectionDialog.value = true
}

const onCorrectionSaved = async () => {
  if (lastFile.value) await processFile(lastFile.value)
}

const clearResult = () => {
  result.value = null
  fileInfo.value = ''
  lastFile.value = null
  if (fileInput.value) fileInput.value.value = ''
  ElMessage.success('已清除核查结果')
}
</script>

<style scoped>
.bom-check-page { padding: 20px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 8px 0; }
.page-desc { color: #86909c; margin: 0 0 16px 0; font-size: 13px; }
.upload-card { margin-bottom: 16px; }
.card-section-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 14px; }
.upload-zone { border: 2px dashed #d0d7e3; border-radius: 8px; padding: 32px; text-align: center; cursor: pointer; transition: all 0.2s; background: #fafbfd; }
.upload-zone:hover, .upload-zone.drag-over { border-color: #409eff; background: #ecf5ff; }
.upload-icon { color: #409eff; margin-bottom: 8px; }
.upload-text .main-text { font-size: 14px; color: #606266; margin-bottom: 4px; }
.upload-text .sub-text { font-size: 12px; color: #909399; }
.file-info { margin-top: 12px; padding: 10px 14px; background: #ecf5ff; border-radius: 6px; font-size: 13px; color: #409eff; display: flex; align-items: center; gap: 6px; }
.action-bar { margin-top: 12px; display: flex; justify-content: flex-end; }
.result-section { margin-top: 16px; }
.product-alert { margin-bottom: 12px; }
.validation-alert :deep(.el-alert__title) { font-size: 15px; font-weight: 600; }
.validation-alert :deep(.el-alert__description) { padding-top: 8px; }
.validation-title { font-weight: 600; margin-bottom: 4px; }
.validation-list { margin-top: 6px; }
.validation-item { font-size: 13px; line-height: 1.8; color: #f56c6c; }
.summary-row { margin-bottom: 16px; }
.summary-row :deep(.el-col) { display: flex; }
.summary-item { text-align: center; padding: 14px 8px; background: #fafbfc; border-radius: 6px; border: 1px solid #f0f0f0; flex: 1; width: 100%; box-sizing: border-box; }
.summary-item.has-diff { border-top: 2px solid #f56c6c; }
.summary-label { font-size: 12px; color: #86909c; margin-bottom: 6px; }
.summary-value { font-size: 22px; font-weight: 700; color: #1d2129; }
.summary-value.diff-text { color: #f56c6c; }
.summary-sub { font-size: 11px; color: #909399; margin-top: 4px; }
.warn-sub { margin-right: 6px; color: #e6a23c; }
.success-sub { margin-right: 6px; color: #67c23a; }
.result-card { margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.card-header-tags { display: flex; align-items: center; }
.diff-amount { color: #f56c6c; font-weight: 600; }
.match-info { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.match-detail { font-size: 12px; color: #606266; }
.match-warnings { margin-top: 4px; }
.warning-text { font-size: 11px; color: #e6a23c; line-height: 1.4; }
.sys-price-original { font-size: 12px; color: #86909c; }
.sys-price-converted { font-size: 14px; color: #1d2129; font-weight: 600; margin-top: 2px; }
.unit-source-hint { color: #909399; font-size: 10px; font-weight: normal; }
:::deep(.fuzzy-row) { background-color: #fef0f0 !important; }
:::deep(.flavor-diff-row) { background-color: #fdf6ec !important; }
:::deep(.corrected-row) { background-color: #f0f9eb !important; }
:::deep(.cost-warning-row) { background-color: #fef0f0 !important; }
:::deep(.cost-missing-row) { background-color: #fdf6ec !important; }
.cost-total { font-size: 12px; color: #86909c; margin-left: 8px; }
.cost-warning-list { margin-top: 12px; padding: 10px 14px; background: #fef0f0; border-radius: 6px; }
.cost-warning-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #f56c6c; line-height: 1.8; }
.no-data { color: #c0c4cc; }
@media (max-width: 768px) {
  .bom-check-page { padding: 12px; }
  .page-title { font-size: 18px; }
  .upload-zone { padding: 20px; }
  .summary-value { font-size: 18px; }
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

.mobile-card-fuzzy {
  border-left: 3px solid #f56c6c;
}

.mobile-card-flavor {
  border-left: 3px solid #e6a23c;
}

.mobile-card-corrected {
  border-left: 3px solid #67c23a;
}

.mobile-card-warning {
  border-left: 3px solid #f56c6c;
}

.mobile-card-missing {
  border-left: 3px solid #e6a23c;
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
  align-items: flex-start;
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

.mobile-card-footer {
  padding: 10px 14px;
  background: #f7f8fa;
  border-top: 1px solid #e5e6eb;
  text-align: right;
}

.mobile-sys-price {
  text-align: right;
}

.mobile-sys-price .sys-price-original {
  font-size: 12px;
  color: #86909c;
}

.mobile-sys-price .sys-price-converted {
  font-size: 14px;
  color: #1d2129;
  font-weight: 600;
  margin-top: 2px;
}
</style>
