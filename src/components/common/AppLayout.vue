<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Document, Key, MagicStick, Odometer, SetUp, Tickets } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getHealth } from '@/api'
import { useUserStore } from '@/stores/user'
import type { HealthRead } from '@/types'

interface NavItem {
  path: string
  label: string
  icon: Component
}

// why：导航以"流程语义"排序——仪表盘看全局、用例、执行、生成，与后端演示链路一致。
const navItems: NavItem[] = [
  { path: '/dashboard', label: '仪表盘', icon: Odometer },
  { path: '/cases', label: '用例管理', icon: Tickets },
  { path: '/tasks', label: '任务执行', icon: SetUp },
  { path: '/generate', label: 'AI 生成', icon: MagicStick },
]

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// ---- 后端健康指示（30s 轮询；/health 免鉴权） ----
const health = ref<HealthRead | null>(null)
let healthTimer: number | undefined

const healthText = computed(() => {
  if (!health.value) return '后端离线'
  return health.value.status === 'ok' ? '系统就绪' : '服务降级'
})
const healthClass = computed(() => {
  if (!health.value) return 'is-down'
  return health.value.status === 'ok' ? 'is-ok' : 'is-degraded'
})

async function refreshHealth(): Promise<void> {
  try {
    health.value = await getHealth()
  } catch {
    health.value = null
  }
}

onMounted(() => {
  void refreshHealth()
  healthTimer = window.setInterval(() => void refreshHealth(), 30_000)
})
onBeforeUnmount(() => {
  if (healthTimer) window.clearInterval(healthTimer)
})

// ---- 令牌配置弹窗（MVP 无登录页，令牌即唯一凭证） ----
const tokenDialogVisible = ref(false)
const tokenDraft = ref('')

function openTokenDialog(): void {
  tokenDraft.value = userStore.token
  tokenDialogVisible.value = true
}

function saveToken(): void {
  const value = tokenDraft.value.trim()
  if (!value) {
    ElMessage.warning('令牌不能为空')
    return
  }
  userStore.setToken(value)
  ElMessage.success('令牌已更新')
  tokenDialogVisible.value = false
}

function clearToken(): void {
  userStore.clearToken()
  ElMessage.success('令牌已清除')
  tokenDialogVisible.value = false
  if (route.meta.requiresToken) {
    void router.push({ path: '/dashboard', query: { needToken: '1' } })
  }
}

function openApiDocs(): void {
  window.open('/docs', '_blank', 'noopener')
}
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand__mark" src="/favicon.svg" alt="TestPlatform" />
        <div class="brand__text">
          <div class="brand__name">TestPlatform</div>
          <div class="brand__sub">接口测试效能平台</div>
        </div>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav__item"
          :class="{ 'is-active': route.path === item.path }"
        >
          <component :is="item.icon" class="nav__icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar__foot">
        <div class="health" :class="healthClass">
          <span class="health__dot" />
          <span>{{ healthText }}</span>
        </div>
        <div class="sidebar__version">v0.1.0 · FastAPI + Vue3</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar__title">
          <span class="topbar__crumb">TestPlatform</span>
          <span class="topbar__sep">/</span>
          <strong class="topbar__page">{{ route.meta.title }}</strong>
        </div>
        <div class="topbar__actions">
          <div v-if="health" class="health-strip">
            <span class="health-strip__label">API</span>
            <span class="health-strip__dot" :class="health.status === 'ok' ? 'is-ok' : 'is-down'" />
            <span class="health-strip__label">DB</span>
            <span class="health-strip__dot" :class="health.db === 'up' ? 'is-ok' : 'is-down'" />
            <span class="health-strip__label">Redis</span>
            <span class="health-strip__dot" :class="health.redis === 'up' ? 'is-ok' : 'is-down'" />
          </div>

          <el-tooltip content="打开后端 Swagger 文档">
            <el-button text :icon="Document" @click="openApiDocs">API 文档</el-button>
          </el-tooltip>

          <el-tooltip content="配置 Bearer 访问令牌">
            <el-button
              text
              :icon="Key"
              :class="{ 'topbar__token--ok': userStore.hasToken }"
              @click="openTokenDialog"
            >
              令牌
              <span class="topbar__token-state">
                {{ userStore.hasToken ? '已配置' : '未配置' }}
              </span>
            </el-button>
          </el-tooltip>
        </div>
      </header>

      <main class="content">
        <slot />
      </main>
    </div>
  </div>

  <el-dialog v-model="tokenDialogVisible" title="访问令牌" width="440px">
    <div class="token-dialog">
      <p class="token-dialog__desc">
        后端已启用 Bearer Token 鉴权（RULES §10.3）。令牌对应后端 <span class="mono">security.api_token</span>，
        本地 dev 默认 <span class="mono">testplatform-dev-token</span>。
      </p>
      <el-input
        v-model="tokenDraft"
        type="password"
        show-password
        placeholder="粘贴访问令牌"
        @keyup.enter="saveToken"
      />
    </div>
    <template #footer>
      <el-button v-if="userStore.hasToken" type="danger" plain @click="clearToken">清除令牌</el-button>
      <el-button @click="tokenDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveToken">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.app-layout {
  display: flex;
  height: 100%;
}

// ---- 侧栏：墨蓝底 + 铜色信号 ----
.sidebar {
  width: 216px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--tp-ink-900);
  color: #c7cede;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand__mark {
  width: 30px;
  height: 30px;
}

.brand__name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.2px;
}

.brand__sub {
  font-size: 11px;
  color: #7c8798;
  margin-top: 1px;
}

.nav {
  flex: 1;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 7px;
  color: #aab3c2;
  font-size: 14px;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }

  &.is-active {
    background: var(--tp-signal);
    color: #fff;
    font-weight: 500;
  }
}

.nav__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.sidebar__foot {
  padding: 14px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.health {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.health__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tp-pending);
}

.health.is-ok .health__dot {
  background: var(--tp-success);
  box-shadow: 0 0 0 3px rgba(26, 158, 104, 0.18);
}

.health.is-degraded .health__dot {
  background: #e0b23c;
}

.health.is-down .health__dot {
  background: var(--tp-failed);
}

.sidebar__version {
  margin-top: 8px;
  font-size: 11px;
  color: #5f6a7d;
  font-family: var(--tp-font-mono);
}

// ---- 主区 ----
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--tp-surface);
  border-bottom: 1px solid var(--tp-line);
}

.topbar__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.topbar__crumb {
  color: var(--tp-ink-400);
}

.topbar__sep {
  color: var(--tp-line-strong);
}

.topbar__page {
  color: var(--tp-ink-900);
  font-weight: 600;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.health-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 10px;
  padding: 4px 10px;
  border: 1px solid var(--tp-line);
  border-radius: 999px;
  background: #fafbfc;
}

.health-strip__label {
  font-size: 11px;
  color: var(--tp-ink-400);
  font-family: var(--tp-font-mono);
}

.health-strip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.health-strip__dot.is-ok {
  background: var(--tp-success);
}

.health-strip__dot.is-down {
  background: var(--tp-failed);
}

.topbar__token-state {
  font-size: 11px;
  color: var(--tp-ink-400);
}

.topbar__token--ok .topbar__token-state {
  color: var(--tp-success);
}

.content {
  flex: 1;
  overflow-y: auto;
}

.token-dialog__desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--tp-ink-500);
  line-height: 1.6;
}
</style>
