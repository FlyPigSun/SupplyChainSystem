import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('../views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '数据看板' }
      },
      {
        path: '/products',
        name: 'Products',
        component: () => import('../views/Products.vue'),
        meta: { title: '产品配方' }
      },
      {
        path: '/prices',
        name: 'Prices',
        component: () => import('../views/Prices.vue'),
        meta: { title: '原料价格' }
      },
      {
        path: '/calculator',
        name: 'Calculator',
        component: () => import('../views/Calculator.vue'),
        meta: { title: '用量计算' }
      },
      {
        path: '/logs',
        name: 'Logs',
        component: () => import('../views/Logs.vue'),
        meta: { title: '操作日志', admin: true }
      },
      {
        path: '/backups',
        name: 'Backups',
        component: () => import('../views/Backups.vue'),
        meta: { title: '备份管理', admin: true }
      },
      {
        path: '/bom-check',
        name: 'BomCheck',
        component: () => import('../views/BomCheck.vue'),
        meta: { title: '成本核查' }
      },
      {
        path: '/users',
        name: 'UserManage',
        component: () => import('../views/UserManage.vue'),
        meta: { title: '账号管理', admin: true }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory('/SupplyChainSystem/'),
  routes
})

router.beforeEach((to, from, next) => {
  // 从 localStorage 获取 token，避免 Pinia 状态丢失
  const token = localStorage.getItem('token')
  const userStr = localStorage.getItem('user')
  let user = null
  try {
    user = userStr ? JSON.parse(userStr) : null
  } catch {
    localStorage.removeItem('user')
  }

  // 未登录访问非公开页面 → 跳转登录页
  if (!to.meta.public && !token) {
    next('/login')
    return
  }

  // 非管理员访问管理员页面 → 跳转首页
  if (to.meta.admin && user?.role !== 'admin') {
    next('/')
    return
  }

  // 404 页面：已登录跳转首页，未登录跳转登录页
  if (to.name === 'NotFound') {
    next(token ? '/' : '/login')
    return
  }

  next()
})

export default router
