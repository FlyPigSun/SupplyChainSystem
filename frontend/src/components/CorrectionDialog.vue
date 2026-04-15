<template>
  <el-dialog v-model="visible" title="修正匹配关系" width="560px" :close-on-click-modal="false">
    <div class="correction-dialog-content">
      <div class="correction-source">
        <div class="correction-label">{{ sourceLabel }}</div>
        <div class="correction-info">
          <span>名称: <strong>{{ source?.name }}</strong></span>
          <span v-if="source?.brandSpec">品牌规格: <strong>{{ source.brandSpec }}</strong></span>
          <span v-if="source?.supplier">供应商: <strong>{{ source.supplier }}</strong></span>
        </div>
      </div>
      <div v-if="source && !source.corrected && source.originalMatch" class="correction-original">
        <div class="correction-label">当前匹配</div>
        <div class="correction-info">
          <span v-if="source.originalMatch.priceInfo">
            {{ source.originalMatch.priceInfo.brand }} {{ source.originalMatch.priceInfo.model }}
            (¥{{ source.originalMatch.priceInfo.price }})
          </span>
          <span v-else-if="source.sysBrand">
            {{ source.sysBrand }} {{ source.sysModel }} (¥{{ source.sysPrice }})
          </span>
          <span v-else>未匹配</span>
          <el-tag size="small" :type="matchTypeTag(source.originalMatch?.matchType || source.matchType)?.type">
            {{ matchTypeTag(source.originalMatch?.matchType || source.matchType)?.text }}
          </el-tag>
        </div>
        <div v-if="source.warnings?.length" class="correction-warnings">
          <div v-for="(w, i) in source.warnings" :key="i" class="warning-text">{{ w }}</div>
        </div>
      </div>
      <el-divider />
      <div class="correction-target">
        <div class="correction-label">选择原料库中的原料</div>
        <el-select
          v-model="selectedPriceId"
          placeholder="搜索原料名称、品牌、型号"
          filterable
          style="width: 100%"
          size="default"
        >
          <el-option
            v-for="p in priceList"
            :key="p.id"
            :label="`${p.brand || ''} ${p.model || ''} (¥${p.price}/${p.unit})`"
            :value="p.id"
          >
            <div class="price-option">
              <span class="price-option-name">{{ p.brand }} {{ p.model }}</span>
              <span class="price-option-price">¥{{ p.price }}/{{ p.unit }}</span>
            </div>
          </el-option>
        </el-select>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSave" :disabled="!selectedPriceId" :loading="saving">
        保存并记住此匹配
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { matchCorrectionApi, priceApi } from '../api'

const props = defineProps({
  modelValue: Boolean,
  source: Object,
  sourceLabel: { type: String, default: '原料信息' }
})

const emit = defineEmits(['update:modelValue', 'saved'])

const visible = ref(false)
const selectedPriceId = ref(null)
const priceList = ref([])
const saving = ref(false)

watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:modelValue', val) })

watch(() => props.modelValue, async (val) => {
  if (val) {
    selectedPriceId.value = null
    if (priceList.value.length === 0) {
      try {
        const res = await priceApi.getList()
        priceList.value = Array.isArray(res.prices) ? res.prices : []
      } catch (error) {
        ElMessage.error('加载原料库失败')
      }
    }
  }
})

const matchTypeTag = (type) => {
  const map = {
    exact: { text: '精确匹配', type: 'success' },
    brand_model: { text: '品牌匹配', type: '' },
    supplier_model: { text: '供应商匹配', type: '' },
    fuzzy: { text: '非同一品牌', type: 'warning' },
    flavor_diff: { text: '口味不同', type: 'warning' },
    corrected: { text: '人工修正', type: 'success' },
    null: { text: '未匹配', type: 'info' }
  }
  return map[type] || map[null]
}

const handleSave = async () => {
  if (!selectedPriceId.value || !props.source) return
  saving.value = true
  try {
    await matchCorrectionApi.save({
      sourceName: props.source.name || props.source.materialName || '',
      sourceBrandSpec: props.source.brandSpec || '',
      sourceSupplier: props.source.supplier || '',
      targetPriceId: selectedPriceId.value
    })
    ElMessage.success('修正已保存，后续相同原料将自动应用此匹配')
    visible.value = false
    emit('saved')
  } catch (error) {
    ElMessage.error(error.msg || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.correction-dialog-content { padding: 0 4px; }
.correction-source, .correction-original, .correction-target { margin-bottom: 12px; }
.correction-label { font-size: 13px; color: #86909c; margin-bottom: 6px; }
.correction-info { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.correction-warnings { margin-top: 6px; }
.warning-text { font-size: 11px; color: #e6a23c; line-height: 1.4; }
.price-option { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.price-option-name { font-size: 13px; }
.price-option-price { color: #f56c6c; font-size: 12px; font-weight: 600; }
</style>
