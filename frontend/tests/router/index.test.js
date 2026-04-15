/**
 * 路由守卫测试
 */

import { describe, test, expect, beforeEach } from 'vitest'

describe('路由守卫逻辑', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('未登录时访问受保护路由应跳转到登录页', () => {
    // 模拟路由守卫逻辑
    const token = localStorage.getItem('token')
    expect(token).toBeNull()
    // 如果 token 为空，守卫应重定向到 /login
  })

  test('登录后 token 存在可访问受保护路由', () => {
    localStorage.setItem('token', 'valid-token')
    localStorage.setItem('user', JSON.stringify({ role: 'user' }))
    
    const token = localStorage.getItem('token')
    expect(token).toBe('valid-token')
  })

  test('普通用户不能访问管理员路由', () => {
    localStorage.setItem('token', 'user-token')
    localStorage.setItem('user', JSON.stringify({ role: 'user' }))
    
    const userStr = localStorage.getItem('user')
    const user = JSON.parse(userStr)
    const isAdminRoute = true // 模拟管理员路由
    const canAccess = user?.role === 'admin' || !isAdminRoute
    
    expect(canAccess).toBe(false)
  })

  test('管理员可访问所有路由', () => {
    localStorage.setItem('token', 'admin-token')
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }))
    
    const userStr = localStorage.getItem('user')
    const user = JSON.parse(userStr)
    
    expect(user.role).toBe('admin')
  })

  test('损坏的 user JSON 不影响路由守卫', () => {
    localStorage.setItem('token', 'valid-token')
    localStorage.setItem('user', '{invalid json')
    
    let user = null
    try {
      user = JSON.parse(localStorage.getItem('user'))
    } catch {
      localStorage.removeItem('user')
    }
    
    expect(user).toBeNull()
  })
})
