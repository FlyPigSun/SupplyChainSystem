<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">账号管理</h2>
      <el-button type="primary" size="small" @click="showAddDialog">
        <el-icon><Plus /></el-icon>
        新增账号
      </el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="users" size="small" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small" style="cursor: pointer;" @click="handleChangeRole(row)">
              {{ row.role === 'admin' ? '管理员' : '普通用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'warning'" size="small">
              {{ row.status === 'active' ? '正常' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="must_change_pwd" label="密码状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.must_change_pwd" type="warning" size="small">待修改</el-tag>
            <el-tag v-else type="success" size="small">已设置</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="140">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="row.username !== 'admin'">
              <el-button
                type="primary"
                size="small"
                link
                @click="handleChangeRole(row)"
              >
                改角色
              </el-button>
              <el-button
                v-if="row.status === 'active'"
                type="warning"
                size="small"
                link
                @click="handleToggleStatus(row)"
              >
                停用
              </el-button>
              <el-button
                v-else
                type="success"
                size="small"
                link
                @click="handleToggleStatus(row)"
              >
                启用
              </el-button>
              <el-button type="primary" size="small" link @click="handleResetPwd(row)">
                重置密码
              </el-button>
            </template>
            <span v-else class="system-account">系统账号</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增账号对话框 -->
    <el-dialog v-model="addDialogVisible" title="新增账号" width="420px" :close-on-click-modal="false">
      <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-width="80px" size="default">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="addForm.username" placeholder="请输入用户名" maxlength="20" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="addForm.role" style="width: 100%">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon>
          初始密码为 123456，用户首次登录后需修改密码
        </el-alert>
      </el-form>
      <template #footer>
        <el-button size="small" @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="handleAdd" :loading="addLoading">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { userApi } from '../api'

const users = ref([])
const addDialogVisible = ref(false)
const addLoading = ref(false)
const addFormRef = ref(null)

const addForm = reactive({
  username: '',
  role: 'user'
})

const addRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度应为2-20个字符', trigger: 'blur' }
  ],
  role: [
    { required: true, message: '请选择角色', trigger: 'change' }
  ]
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const loadUsers = async () => {
  try {
    const res = await userApi.getList()
    if (res.ok) {
      users.value = res.users
    }
  } catch (e) {
    ElMessage.error('加载用户列表失败')
  }
}

const showAddDialog = () => {
  addForm.username = ''
  addForm.role = 'user'
  addDialogVisible.value = true
}

const handleAdd = async () => {
  const valid = await addFormRef.value?.validate().catch(() => false)
  if (!valid) return

  addLoading.value = true
  try {
    const res = await userApi.create({
      username: addForm.username,
      role: addForm.role
    })
    if (res.ok) {
      ElMessage.success('创建成功，初始密码: 123456')
      addDialogVisible.value = false
      loadUsers()
    } else {
      ElMessage.error(res.msg || '创建失败')
    }
  } catch (e) {
    ElMessage.error(e.msg || '创建失败')
  } finally {
    addLoading.value = false
  }
}

const handleToggleStatus = async (row) => {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  const action = newStatus === 'disabled' ? '停用' : '启用'
  
  try {
    await ElMessageBox.confirm(`确定要${action}账号 "${row.username}" 吗？`, '确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const res = await userApi.updateStatus(row.id, newStatus)
    if (res.ok) {
      ElMessage.success(res.msg || `${action}成功`)
      loadUsers()
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.msg || '操作失败')
    }
  }
}

const handleResetPwd = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要将 "${row.username}" 的密码重置为 123456 吗？用户下次登录需重新设置密码。`, '重置密码', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const res = await userApi.resetPassword(row.id)
    if (res.ok) {
      ElMessage.success('密码已重置为 123456')
      loadUsers()
    } else {
      ElMessage.error(res.msg || '重置失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.msg || '重置失败')
    }
  }
}

const handleChangeRole = async (row) => {
  if (row.username === 'admin') {
    ElMessage.warning('不能修改系统管理员角色')
    return
  }
  const currentRole = row.role === 'admin' ? '管理员' : '普通用户'
  const newRole = row.role === 'admin' ? '普通用户' : '管理员'
  const newRoleValue = row.role === 'admin' ? 'user' : 'admin'
  
  try {
    await ElMessageBox.confirm(
      `确定要将用户 "${row.username}" 的角色从 ${currentRole} 改为 ${newRole} 吗？`,
      '修改角色',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const res = await userApi.updateRole(row.id, newRoleValue)
    if (res.ok) {
      ElMessage.success('角色修改成功')
      loadUsers()
    } else {
      ElMessage.error(res.msg || '修改失败')
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.msg || '修改失败')
    }
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.page-container {
  max-width: 900px;
}

.system-account {
  color: #c0c4cc;
  font-size: 12px;
}
</style>
