import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * 响应式移动端检测 composable
 * 统一处理窗口宽度监听和移动端判断
 * @param {number} breakpoint - 断点宽度（默认 768px）
 */
export function useMobile(breakpoint = 768) {
  const windowWidth = ref(window.innerWidth)

  const isMobile = computed(() => windowWidth.value < breakpoint)

  const handleResize = () => {
    windowWidth.value = window.innerWidth
  }

  onMounted(() => {
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })

  return { windowWidth, isMobile }
}
