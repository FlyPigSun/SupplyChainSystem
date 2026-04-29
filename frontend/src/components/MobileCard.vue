<template>
  <div class="mobile-card" :class="cardClass">
    <div v-if="$slots.header" class="mobile-card-header">
      <slot name="header" />
    </div>
    <div class="mobile-card-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="mobile-card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: '' } // 'fuzzy' | 'flavor' | 'corrected' | 'warning' | 'missing'
})

const cardClass = computed(() => {
  const map = {
    fuzzy: 'mobile-card-fuzzy',
    flavor: 'mobile-card-flavor',
    corrected: 'mobile-card-corrected',
    warning: 'mobile-card-warning',
    missing: 'mobile-card-missing'
  }
  return map[props.type] || ''
})
</script>

<style scoped>
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

.mobile-card-body {
  padding: 12px 14px;
}

.mobile-card-footer {
  padding: 10px 14px;
  background: #f7f8fa;
  border-top: 1px solid #e5e6eb;
  text-align: right;
}
</style>
