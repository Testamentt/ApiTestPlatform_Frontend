<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getHealth } from '@/api'
import { listCases } from '@/api/cases'
import { listTasks } from '@/api/tasks'
import { useUserStore } from '@/stores/user'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatTime, truncate } from '@/utils/format'
import type { HealthRead, Task, TaskStatus } from '@/types'

const route = useRoute()
const userStore = useUserStore()

const needToken = computed(() => route.query.needToken === '1')

// ---- 统计 ----
const draftCount = ref(0)
const activeCount = ref(0)
const totalCount = ref(0)
const successCount = ref(0)
const recentTasks = ref<Task[]>([])
const taskDist = ref<Record<TaskStatus, number>>({ pending: 0, running: 0, success: 0, failed: 0 })
const health = ref<HealthRead | null>(null)
const loading = ref(false)
let healthTimer: number | undefined

const stages = computed(() => [
  { key: 'draft', label: '生成', sub: '草稿用例', count: draftCount.value, color: 'gray' },
  { key: 'active', label: '审核', sub: '激活用例', count: activeCount.value, color: 'green' },
  { key: 'total', label: '执行', sub: '任务总数', count: totalCount.value, color: 'blue' },
  { key: 'success', label: '成功', sub: '成功任务', count: successCount.value, color: 'green' },
])

const distItems = computed(() =>
  (['pending', 'running', 'success', 'failed'] as TaskStatus[]).map((key) => ({
    key,
    count: taskDist.value[key],
  })),
)
const distTotal = computed(() =>
  distItems.value.reduce((sum, item) => sum + item.count, 0),
)

function distPercent(count: number): string {
  return distTotal.value === 0 ? '0%' : `${Math.round((count / distTotal.value) * 100)}%`
}

async function loadStats(): Promise<void> {
  if (!userStore.token) return
  loading.value = true
  try {
    const [draftPage, activePage, taskPage] = await Promise.all([
      listCases({ status: 'draft', page_size: 1 }),
      listCases({ status: 'active', page_size: 1 }),
      listTasks({ page_size: 100 }),
    ])
    draftCount.value = draftPage.total
    activeCount.value = activePage.total
    totalCount.value = taskPage.total
    recentTasks.value = taskPage.items.slice(0, 5)

    const dist: Record<TaskStatus, number> = { pending: 0, running: 0, success: 0, failed: 0 }
    for (const task of taskPage.items) {
      if (task.status in dist) dist[task.status as TaskStatus] += 1
    }
    taskDist.value = dist
    successCount.value = dist.success
  } catch {
    // why：错误已由 axios 拦截器统一提示（toast + 401 清 token 跳转），此处静默防重复打扰
  } finally {
    loading.value = false
  }
}

async function refreshHealth(): Promise<void> {
  try {
    health.value = await getHealth()
  } catch {
    health.value = null
  }
}

// 令牌变化时联动：刚配置令牌自动刷新统计；清除令牌则清空统计回到空态
watch(
  () => userStore.token,
  () => {
    if (userStore.token) void loadStats()
    else resetStats()
  },
)

function resetStats(): void {
  draftCount.value = 0
  activeCount.value = 0
  totalCount.value = 0
  successCount.value = 0
  recentTasks.value = []
  taskDist.value = { pending: 0, running: 0, success: 0, failed: 0 }
}

// ---- 空态令牌配置 ----
const tokenInput = ref('')

function submitToken(): void {
  const value = tokenInput.value.trim()
  if (!value) {
    ElMessage.warning('令牌不能为空')
    return
  }
  userStore.setToken(value)
  ElMessage.success('令牌已保存')
}

onMounted(() => {
  void refreshHealth()
  healthTimer = window.setInterval(() => void refreshHealth(), 30_000)
  if (userStore.token) void loadStats()
})
onBeforeUnmount(() => {
  if (healthTimer) window.clearInterval(healthTimer)
})
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">仪表盘</h1>
        <p class="page__desc">用例从生成到执行成功的实时流水线</p>
      </div>
      <el-button v-if="userStore.token" :loading="loading" @click="loadStats">刷新</el-button>
    </header>

    <el-alert
      v-if="needToken"
      title="未配置访问令牌，已回到本页。请在右上角「令牌」或下方输入后访问用例 / 任务 / AI 生成。"
      type="warning"
      :closable="false"
      show-icon
      class="dash-alert"
    />

    <!-- 未配置令牌：落地页空态（MVP 无登录页，仪表盘即引导入口） -->
    <section v-if="!userStore.token" class="panel gate">
      <img class="gate__mark" src="/favicon.svg" alt="" />
      <h3 class="gate__title">配置访问令牌，查看平台概况</h3>
      <p class="gate__desc">
        业务接口已启用 Bearer Token 鉴权（对应后端 security.api_token）。
        本地 dev 默认 testplatform-dev-token；生产通过后端环境变量下发。
      </p>
      <div class="gate__form">
        <el-input
          v-model="tokenInput"
          type="password"
          show-password
          placeholder="粘贴访问令牌"
          class="gate__input"
          @keyup.enter="submitToken"
        />
        <el-button type="primary" @click="submitToken">保存并刷新</el-button>
      </div>
    </section>

    <template v-else>
      <!-- 签名元素：用例流水线信号轨（生成→审核→执行→成功） -->
      <section class="panel rail">
        <div class="rail__head">
          <h3 class="rail__title">用例流水线</h3>
          <span class="rail__caption">数据来自真实接口 · 状态色与 StatusTag 一致</span>
        </div>
        <div class="rail__track">
          <template v-for="(stage, index) in stages" :key="stage.key">
            <div class="rail__node">
              <div class="rail__node-num num" :class="`is-${stage.color}`">{{ stage.count }}</div>
              <div class="rail__node-label">{{ stage.label }}</div>
              <div class="rail__node-sub">{{ stage.sub }}</div>
            </div>
            <div v-if="index < stages.length - 1" class="rail__link">
              <span class="rail__pulse" :style="{ animationDelay: `${index * 0.35}s` }" />
            </div>
          </template>
        </div>
      </section>

      <div class="dash-grid">
        <!-- 最近任务 -->
        <section class="panel">
          <div class="panel__head">
            <h3 class="panel__title">最近任务</h3>
            <RouterLink class="panel__more" to="/tasks">查看全部 →</RouterLink>
          </div>
          <el-table v-loading="loading" :data="recentTasks" size="default" class="dash-table">
            <el-table-column label="ID" width="64">
              <template #default="{ row }">
                <span class="mono num">#{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="run_id" min-width="150">
              <template #default="{ row }">
                <span class="mono" :title="row.run_id">{{ truncate(row.run_id, 26) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="用例数" width="80">
              <template #default="{ row }">
                <span class="num">{{ row.case_ids.length }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <StatusTag :status="row.status" />
              </template>
            </el-table-column>
            <el-table-column label="开始时间" width="130">
              <template #default="{ row }">
                <span class="mono num">{{ formatTime(row.started_at) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!loading && recentTasks.length === 0" class="panel__empty">暂无任务，前往「任务执行」创建</div>
        </section>

        <div class="dash-side">
          <!-- 任务状态分布 -->
          <section class="panel">
            <div class="panel__head">
              <h3 class="panel__title">任务状态分布</h3>
            </div>
            <div v-if="distTotal > 0" class="dist">
              <div class="dist__bar">
                <div
                  v-for="item in distItems"
                  :key="item.key"
                  class="dist__seg"
                  :class="`is-${item.key}`"
                  :style="{ width: distPercent(item.count) }"
                />
              </div>
              <div class="dist__legend">
                <div v-for="item in distItems" :key="item.key" class="dist__item">
                  <span class="dist__dot" :class="`is-${item.key}`" />
                  <span class="dist__label">{{ item.key }}</span>
                  <span class="dist__count num">{{ item.count }}</span>
                </div>
              </div>
            </div>
            <div v-else class="panel__empty">暂无任务数据</div>
          </section>

          <!-- 后端健康 -->
          <section class="panel">
            <div class="panel__head">
              <h3 class="panel__title">后端健康</h3>
              <span class="health-pill" :class="health ? health.status : 'is-down'">
                {{ health ? (health.status === 'ok' ? '正常' : '降级') : '离线' }}
              </span>
            </div>
            <div class="health-rows">
              <div class="health-row">
                <span class="health-row__name">API</span>
                <span class="health-row__dot" :class="health ? 'is-ok' : 'is-down'" />
                <span class="health-row__text">{{ health ? health.status : '无法连接' }}</span>
              </div>
              <div class="health-row">
                <span class="health-row__name">数据库</span>
                <span class="health-row__dot" :class="health?.db === 'up' ? 'is-ok' : 'is-down'" />
                <span class="health-row__text">{{ health ? health.db : '未知' }}</span>
              </div>
              <div class="health-row">
                <span class="health-row__name">Redis</span>
                <span class="health-row__dot" :class="health?.redis === 'up' ? 'is-ok' : 'is-down'" />
                <span class="health-row__text">{{ health ? health.redis : '未知' }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.dash-alert {
  margin-bottom: 16px;
}

// ---- 空态引导 ----
.gate {
  max-width: 560px;
  margin: 48px auto;
  padding: 40px 32px;
  text-align: center;
}

.gate__mark {
  width: 40px;
  height: 40px;
}

.gate__title {
  margin: 16px 0 8px;
  font-size: 18px;
  color: var(--tp-ink-900);
}

.gate__desc {
  margin: 0 auto 20px;
  max-width: 420px;
  font-size: 13px;
  color: var(--tp-ink-400);
  line-height: 1.7;
}

.gate__form {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.gate__input {
  max-width: 300px;
}

// ---- 流水线信号轨 ----
.rail {
  padding: 20px;
  margin-bottom: 16px;
}

.rail__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 18px;
}

.rail__title {
  margin: 0;
  font-size: 16px;
  color: var(--tp-ink-900);
}

.rail__caption {
  font-size: 12px;
  color: var(--tp-ink-400);
}

.rail__track {
  display: flex;
  align-items: center;
}

.rail__node {
  flex-shrink: 0;
  min-width: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  border-radius: 10px;
  background: var(--tp-surface);
  border: 1px solid var(--tp-line);
}

.rail__node-num {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;

  &.is-gray {
    color: var(--tp-pending);
  }
  &.is-green {
    color: var(--tp-success);
  }
  &.is-blue {
    color: var(--tp-running);
  }
}

.rail__node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-ink-500);
}

.rail__node-sub {
  font-size: 11px;
  color: var(--tp-ink-400);
}

.rail__link {
  flex: 1;
  min-width: 24px;
  height: 2px;
  margin: 0 6px 22px;
  position: relative;
  background: repeating-linear-gradient(
    90deg,
    var(--tp-line-strong) 0 5px,
    transparent 5px 10px
  );
}

.rail__pulse {
  position: absolute;
  top: -3px;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tp-signal);
  animation: rail-flow 1.8s linear infinite;
}

@keyframes rail-flow {
  0% {
    left: 0;
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    left: calc(100% - 8px);
    opacity: 0;
  }
}

// ---- 下半区网格 ----
// why：grid track 用 minmax(0, fr) + 子项 min-width:0 —— fr 默认等价 minmax(auto, 1fr)，
// 内容（el-table）会被 auto 最小宽度撑开 track 造成横向无限延长（本 bug 根因）。
.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.dash-grid > * {
  min-width: 0;
}

.dash-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.panel__title {
  margin: 0;
  font-size: 14px;
  color: var(--tp-ink-900);
}

.panel__more {
  font-size: 12px;
  color: var(--tp-signal);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.panel__empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--tp-ink-400);
}

.dash-table {
  padding: 0 4px;
}

// ---- 状态分布 ----
.dist {
  padding: 4px 16px 16px;
}

.dist__bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--tp-pending-soft);
}

.dist__seg.is-pending {
  background: var(--tp-pending);
}
.dist__seg.is-running {
  background: var(--tp-running);
}
.dist__seg.is-success {
  background: var(--tp-success);
}
.dist__seg.is-failed {
  background: var(--tp-failed);
}

.dist__legend {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
}

.dist__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.dist__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.is-pending {
    background: var(--tp-pending);
  }
  &.is-running {
    background: var(--tp-running);
  }
  &.is-success {
    background: var(--tp-success);
  }
  &.is-failed {
    background: var(--tp-failed);
  }
}

.dist__label {
  color: var(--tp-ink-500);
}

.dist__count {
  margin-left: auto;
  color: var(--tp-ink-700);
}

// ---- 健康 ----
.health-pill {
  font-size: 12px;
  padding: 1px 10px;
  border-radius: 999px;

  &.is-ok {
    color: var(--tp-success);
    background: var(--tp-success-soft);
  }
  &.is-down {
    color: var(--tp-failed);
    background: var(--tp-failed-soft);
  }
}

.health-rows {
  padding: 4px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.health-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.health-row__name {
  width: 56px;
  color: var(--tp-ink-400);
  font-family: var(--tp-font-mono);
  font-size: 12px;
}

.health-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.is-ok {
    background: var(--tp-success);
  }
  &.is-down {
    background: var(--tp-failed);
  }
}

.health-row__text {
  color: var(--tp-ink-500);
}

@media (max-width: 1080px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}
</style>
