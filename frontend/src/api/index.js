import axios from 'axios'

// 动态 baseURL：Nginx 反代时使用 /SupplyChainSystem/api，Vite 开发时使用 /api
const baseURL = import.meta.env.BASE_URL ? `${import.meta.env.BASE_URL}api` : '/api'

const api = axios.create({
  baseURL,
  timeout: 10000
})

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      const base = import.meta.env.BASE_URL || '/'
      window.location.href = `${base}login`
    }
    return Promise.reject(error.response?.data || error)
  }
)

// 认证
export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  changePassword: (oldPassword, newPassword) => api.put('/auth/change-password', { old_password: oldPassword, new_password: newPassword })
}

// 用户管理
export const userApi = {
  getList: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  updateStatus: (id, status) => api.put(`/users/${id}/status`, { status }),
  updateRole: (id, role) => api.put(`/users/${id}/role`, { role }),
  resetPassword: (id) => api.put(`/users/${id}/password`)
}

// 产品
export const productApi = {
  getList: (params) => api.get('/products', { params }),
  getTypes: () => api.get('/products/types'),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  export: (ids) => api.get('/products/export/excel', {
    params: { ids: ids?.join(',') },
    responseType: 'blob'
  })
}

// 价格
export const priceApi = {
  getList: (params) => api.get('/prices', { params }),
  create: (data) => api.post('/prices', data),
  delete: (id) => api.delete(`/prices/${id}`)
}

// 价格导入
export const priceImportApi = {
  import: (formData) => api.post('/price-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}

// 原料
export const materialApi = {
  getList: () => api.get('/materials'),
  getStats: () => api.get('/materials/stats'),
  getSupplierStats: () => api.get('/materials/supplier-stats'),
  getBrandStats: () => api.get('/materials/brand-stats')
}

// 日志
export const logApi = {
  getList: (params) => api.get('/logs', { params }),
  add: (action, detail) => api.post('/logs', { action, detail })
}

// 备份
export const backupApi = {
  getList: () => api.get('/backups'),
  create: () => api.post('/backups/create'),
  restore: (name) => api.post('/backups/restore', { name })
}

// BOM检查（成本核查）
export const bomCheckApi = {
  check: (formData) => api.post('/bom-check', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 配方导入
export const recipeImportApi = {
  import: (formData) => api.post('/recipe-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}

// 用量计算模板导入
export const calculatorImportApi = {
  import: (formData) => api.post('/calculator-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  }),
  downloadTemplate: () => api.get('/calculator-import/template', { responseType: 'blob' })
}

// 用量计算（含价格匹配）
export const calculatorApi = {
  calculate: (items) => api.post('/calculator/calculate', { items })
}

// 匹配修正
export const matchCorrectionApi = {
  save: (data) => api.post('/match-corrections', data)
}

export default api
