<template>
  <div class="mobile-card-row">
    <span class="mobile-card-label">{{ label }}</span>
    <span class="mobile-card-value" :class="valueClass">
      <slot>
        {{ value }}
      </slot>
    </span>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  strong: { type: Boolean, default: false },
  cost: { type: Boolean, default: false }
})

const valueClass = computed(() => ({
  'mobile-card-strong': props.strong,
  'mobile-card-cost': props.cost
}))
</script>

<script>
import { computed } from 'vue'
const props = defineProps({ label: String, value: [String, Number], strong: Boolean, cost: Boolean })
</script>

<style scoped>
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

.mobile-card-strong {
  font-weight: 600;
  color: #1d2129;
}

.mobile-card-cost {
  font-size: 15px;
  font-weight: 700;
  color: #f56c6c;
}
</style>
