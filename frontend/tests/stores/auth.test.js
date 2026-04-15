/**
 * Auth Store 单元测试
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../../src/stores/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  test('初始状态 - 未登录', () => {
    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(false)
    expect(store.isAdmin).toBe(false)
    expect(store.token).toBe('')
    expect(store.user).toBeNull()
  })

  test('setAuth - 设置认证信息', () => {
    const store = useAuthStore()
    store.setAuth('test-token', { id: 1, username: 'admin', role: 'admin' })

    expect(store.isLoggedIn).toBe(true)
    expect(store.isAdmin).toBe(true)
    expect(store.token).toBe('test-token')
    expect(store.user.username).toBe('admin')
  })

  test('setAuth - 普通用户非管理员', () => {
    const store = useAuthStore()
    store.setAuth('user-token', { id: 2, username: 'user', role: 'user' })

    expect(store.isLoggedIn).toBe(true)
    expect(store.isAdmin).toBe(false)
  })

  test('setAuth - 同步到 localStorage', () => {
    const store = useAuthStore()
    store.setAuth('my-token', { id: 1, username: 'admin', role: 'admin' })

    expect(localStorage.getItem('token')).toBe('my-token')
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({ id: 1, username: 'admin', role: 'admin' })
  })

  test('clearAuth - 清除认证信息', () => {
    const store = useAuthStore()
    store.setAuth('my-token', { id: 1, username: 'admin', role: 'admin' })
    store.clearAuth()

    expect(store.isLoggedIn).toBe(false)
    expect(store.isAdmin).toBe(false)
    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  test('mustChangePwd - 强制修改密码标记', () => {
    const store = useAuthStore()
    store.setAuth('token', { id: 1, username: 'newuser', role: 'user', must_change_pwd: true })

    expect(store.mustChangePwd).toBe(true)
  })

  test('clearMustChangePwd - 清除强制修改标记', () => {
    const store = useAuthStore()
    store.setAuth('token', { id: 1, username: 'newuser', role: 'user', must_change_pwd: true })
    store.clearMustChangePwd()

    expect(store.mustChangePwd).toBe(false)
    expect(store.user.must_change_pwd).toBe(false)
  })

  test('从 localStorage 恢复状态', () => {
    localStorage.setItem('token', 'saved-token')
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))

    const store = useAuthStore()
    expect(store.isLoggedIn).toBe(true)
    expect(store.isAdmin).toBe(true)
  })
})
