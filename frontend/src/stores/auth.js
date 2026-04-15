import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const mustChangePwd = computed(() => !!user.value?.must_change_pwd)

  const setAuth = (newToken, newUser) => {
    token.value = newToken
    user.value = newUser
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
  }

  const clearMustChangePwd = () => {
    if (user.value) {
      user.value.must_change_pwd = false
      localStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  const clearAuth = () => {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const initAuth = () => {
    // token 管理统一由 api 拦截器处理
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    mustChangePwd,
    setAuth,
    clearMustChangePwd,
    clearAuth,
    initAuth
  }
})
