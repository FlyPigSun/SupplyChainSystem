/**
 * 前端测试全局 setup
 * - 模拟 localStorage
 * - 模拟 Element Plus 组件
 */

import { vi } from 'vitest'

// 模拟 localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// 模拟 window.matchMedia（Element Plus 依赖）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// 模拟 IntersectionObserver
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'IntersectionObserver', { value: IntersectionObserverMock })

// 每个测试前清空 localStorage
beforeEach(() => {
  localStorage.clear()
})
