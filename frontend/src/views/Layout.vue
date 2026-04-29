<template>
  <el-container class="layout-container">
    <!-- 移动端遮罩 -->
    <div v-if="sidebarVisible" class="sidebar-overlay" @click="sidebarVisible = false"></div>
    
    <!-- 侧边栏 -->
    <el-aside :class="['sidebar', { 'sidebar-visible': sidebarVisible }]" :width="isMobile ? '220px' : '200px'">
      <div class="logo">
        <el-icon :size="22"><Box /></el-icon>
        <span>供应链系统</span>
      </div>
      
      <el-menu
        :default-active="$route.path"
        router
        class="menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
        @select="onMenuSelect"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataLine /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        
        <el-menu-item index="/products">
          <el-icon><Goods /></el-icon>
          <span>产品配方</span>
        </el-menu-item>
        
        <el-menu-item index="/prices">
          <el-icon><Money /></el-icon>
          <span>原料价格</span>
        </el-menu-item>
        
        <el-menu-item index="/calculator">
          <el-icon><EditPen /></el-icon>
          <span>用量计算</span>
        </el-menu-item>

        <el-menu-item index="/bom-check">
          <el-icon><DocumentChecked /></el-icon>
          <span>成本核查</span>
        </el-menu-item>

        <el-menu-item index="/product-labels">
          <el-icon><List /></el-icon>
          <span>配料表管理</span>
        </el-menu-item>

        <el-menu-item index="/logs" v-if="authStore.isAdmin">
          <el-icon><Document /></el-icon>
          <span>操作日志</span>
        </el-menu-item>
        
        <el-menu-item index="/backups" v-if="authStore.isAdmin">
          <el-icon><Folder /></el-icon>
          <span>备份管理</span>
        </el-menu-item>

        <el-menu-item index="/users" v-if="authStore.isAdmin">
          <el-icon><User /></el-icon>
          <span>账号管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container class="main-container">
      <el-header class="header" height="52px">
        <!-- 移动端菜单按钮 -->
        <div class="header-left">
          <el-button v-if="isMobile" class="menu-btn" link @click="sidebarVisible = !sidebarVisible">
            <el-icon :size="20"><Expand /></el-icon>
          </el-button>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              {{ authStore.user?.username }}
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="changePassword">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>

    <!-- 修改密码对话框 -->
    <el-dialog 
      v-model="pwdDialogVisible" 
      :title="isForceChange ? '首次登录，请修改密码' : '修改密码'" 
      width="420px" 
      :close-on-click-modal="!isForceChange" 
      :close-on-press-escape="!isForceChange"
      :show-close="!isForceChange"
    >
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px" size="default">
        <el-form-item label="旧密码" prop="old_password">
          <el-input v-model="pwdForm.old_password" type="password" placeholder="请输入当前密码" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="pwdForm.new_password" type="password" placeholder="请输入新密码（至少4位）" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm_password">
          <el-input v-model="pwdForm.confirm_password" type="password" placeholder="再次输入新密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="!isForceChange" size="small" @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="handleChangePwd" :loading="pwdLoading">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Expand, User, List } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { useMobile } from '../composables/useMobile'
import { authApi } from '../api'

const router = useRouter()
const authStore = useAuthStore()
const { isMobile } = useMobile()

const sidebarVisible = ref(false)

// 修改密码相关
const pwdDialogVisible = ref(false)
const pwdLoading = ref(false)
const isForceChange = ref(false)
const pwdFormRef = ref(null)

const pwdForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: ''
})

const validateConfirm = (rule, value, callback) => {
  if (value !== pwdForm.new_password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const pwdRules = {
  old_password: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 4, message: '密码长度不能少于4位', trigger: 'blur' }
  ],
  confirm_password: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' }
  ]
}

onMounted(() => {
  // 检查是否需要强制修改密码
  if (authStore.mustChangePwd) {
    isForceChange.value = true
    pwdDialogVisible.value = true
  }
})

const onMenuSelect = () => {
  if (isMobile.value) {
    sidebarVisible.value = false
  }
}

const handleCommand = (command) => {
  if (command === 'logout') {
    authStore.clearAuth()
    ElMessage.success('已退出登录')
    router.push('/login')
  } else if (command === 'changePassword') {
    isForceChange.value = false
    pwdForm.old_password = ''
    pwdForm.new_password = ''
    pwdForm.confirm_password = ''
    pwdDialogVisible.value = true
  }
}

const handleChangePwd = async () => {
  const valid = await pwdFormRef.value?.validate().catch(() => false)
  if (!valid) return

  pwdLoading.value = true
  try {
    const res = await authApi.changePassword(pwdForm.old_password, pwdForm.new_password)
    if (res.ok) {
      ElMessage.success('密码修改成功')
      pwdDialogVisible.value = false
      isForceChange.value = false
      authStore.clearMustChangePwd()
    } else {
      ElMessage.error(res.msg || '修改失败')
    }
  } catch (e) {
    ElMessage.error(e.msg || '修改失败')
  } finally {
    pwdLoading.value = false
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

/* 侧边栏 */
.sidebar {
  background-color: #304156;
  transition: transform 0.3s ease;
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
}

/* 移动端侧边栏默认隐藏 */
@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 1001;
    transform: translateX(-100%);
  }

  .sidebar.sidebar-visible {
    transform: translateX(0);
  }
}

.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.logo {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  gap: 8px;
  border-bottom: 1px solid #1f2d3d;
}

.menu {
  border-right: none;
}

/* 主容器 */
.main-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header {
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.menu-btn {
  color: #606266;
  padding: 4px;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  cursor: pointer;
  color: #606266;
  font-size: 14px;
}

.main-content {
  background-color: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

@media (max-width: 767px) {
  .main-content {
    padding: 12px;
  }
}
</style>
