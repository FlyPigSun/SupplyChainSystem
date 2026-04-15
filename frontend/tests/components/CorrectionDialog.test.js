/**
 * CorrectionDialog 组件测试
 * 侧重逻辑测试而非 DOM 渲染
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CorrectionDialog from '../../src/components/CorrectionDialog.vue'

// 模拟 API 模块
vi.mock('../../src/api', () => ({
  priceApi: {
    getList: vi.fn().mockResolvedValue({ ok: true, prices: [] })
  },
  matchCorrectionApi: {
    save: vi.fn().mockResolvedValue({ ok: true })
  }
}))

// 全局 stubs - 使用 true 最简化
const globalConfig = {
  stubs: {
    'el-dialog': true,
    'el-select': true,
    'el-option': true,
    'el-button': true,
    'el-divider': true,
    'el-tag': true
  }
}

describe('CorrectionDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  test('组件可以正常挂载', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: false, source: null },
      global: globalConfig
    })
    expect(wrapper.exists()).toBe(true)
  })

  test('Props 正确传递 - source', () => {
    const source = { name: '高筋粉', brandSpec: '金沙河 25kg', supplier: '北京供应商' }
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: true, source },
      global: globalConfig
    })
    expect(wrapper.props('source')).toEqual(source)
  })

  test('Props 正确传递 - sourceLabel 默认值', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: true, source: { name: '测试' } },
      global: globalConfig
    })
    expect(wrapper.props('sourceLabel')).toBe('原料信息')
  })

  test('Props 正确传递 - sourceLabel 自定义值', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: true, source: { name: '测试' }, sourceLabel: '配方原料' },
      global: globalConfig
    })
    expect(wrapper.props('sourceLabel')).toBe('配方原料')
  })

  test('内部状态 - selectedPriceId 初始为 null', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: true, source: { name: '测试' } },
      global: globalConfig
    })
    expect(wrapper.vm.selectedPriceId).toBeNull()
  })

  test('内部状态 - priceList 初始为空数组', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: true, source: { name: '测试' } },
      global: globalConfig
    })
    expect(wrapper.vm.priceList).toEqual([])
  })

  test('matchTypeTag 函数 - 精确匹配', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: false, source: null },
      global: globalConfig
    })
    const result = wrapper.vm.matchTypeTag('exact')
    expect(result.text).toBe('精确匹配')
    expect(result.type).toBe('success')
  })

  test('matchTypeTag 函数 - 未匹配', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: false, source: null },
      global: globalConfig
    })
    const result = wrapper.vm.matchTypeTag(null)
    expect(result.text).toBe('未匹配')
    expect(result.type).toBe('info')
  })

  test('matchTypeTag 函数 - 未知类型返回未匹配', () => {
    const wrapper = mount(CorrectionDialog, {
      props: { modelValue: false, source: null },
      global: globalConfig
    })
    const result = wrapper.vm.matchTypeTag('unknown_type')
    expect(result.text).toBe('未匹配')
  })
})
