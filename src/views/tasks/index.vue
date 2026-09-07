<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay, Refresh } from '@element-plus/icons-vue'
import { apiGet } from '@/api'
import { cancelTask, createTask, getTaskResults, listTasks, retryTask } from '@/api/tasks'
import { listCases } from '@/api/cases'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatDateTime, truncate } from '@/utils/format'
import {
  POLL_MAX_CONSECUTIVE_ERRORS,
  POLL_MAX_DURATION_MS,
  hasActiveTasks,
  nextDelay,
  shouldKeepPolling,
  type PollDecisionReason,
} from '@/utils/polling'
import type { ListTasksParams, Task, TaskResultItem, TaskResults, TaskStatus, TestCase } from '@/types'

// ---- 查询过滤 ----
const filter = reactive<{ page: number; page_size: number; status: '' | TaskStatus }>({
  page: 1,
  page_size: 20,
  status: '',
})

const rows = ref<Task[]>([])
const total = ref(0)
const loading = ref(false)
const STATUS_OPTIONS: { label: string; value: TaskStatus }[] = [
  { label: '排队中', value: 'pending' },
  { label: '执行中', value: 'running' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
]

// ---- 轮询治理（P2-2）：决策规则见 @/utils/polling，组件只做接线 ----
// why：间隔随失败次数变化且需暂停/恢复，用 setTimeout 自我续期替代固定 setInterval
let timer: number | undefined
/** 本轮轮询会话起点；undefined 表示当前未在轮询 */
let sessionStart: number | undefined
/** 进入后台的时刻：用于把暂停时长还给会话预算 */
let pausedAt: number | undefined
let consecutiveErrors = 0
/** 已被超时/退避护栏终止：等用户手动刷新再开新会话，避免切回页面就无限续命 */
let autoStopped = false
/** 列表上方提示条文案，'' 表示不显示 */
const pollHint = ref('')

function clearTimer(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
}

function stopPolling(): void {
  clearTimer()
  sessionStart = undefined
  pausedAt = undefined
}

/** 页面不可见：只清掉待触发的定时器，保留会话（回前台继续，而非重新计时） */
function pausePolling(): void {
  clearTimer()
  if (pausedAt === undefined) pausedAt = Date.now()
}

/** 回到前台：把后台停留时长补回会话起点，避免「后台挂 25 分钟，回来即被判定超时」 */
function resumePolling(): void {
  if (pausedAt !== undefined && sessionStart !== undefined) {
    sessionStart += Date.now() - pausedAt
  }
  pausedAt = undefined
}

function scheduleNext(delayMs: number): void {
  clearTimer()
  timer = window.setTimeout(() => {
    timer = undefined
    void loadTasks()
  }, delayMs)
}

function stopMessage(reason: PollDecisionReason): string {
  if (reason === 'timeout') {
    return `已轮询 ${POLL_MAX_DURATION_MS / 60_000} 分钟仍未结束，请点「刷新」查看最新状态`
  }
  return `连续 ${POLL_MAX_CONSECUTIVE_ERRORS} 次请求失败，请点「刷新」手动重试`
}

/** 提示条与弹窗共用同一套说法，避免两处文案各自漂移 */
function updateHint(reason: PollDecisionReason, delayMs: number): void {
  if (reason === 'inactive') pollHint.value = ''
  else if (reason === 'hidden') pollHint.value = '页面已切到后台，自动刷新已暂停'
  else if (reason === 'ok') pollHint.value = `有任务执行中，每 ${Math.round(delayMs / 1000)}s 自动刷新`
  else pollHint.value = `自动刷新已停止：${stopMessage(reason)}`
}

function syncPolling(options: { manual?: boolean } = {}): void {
  // why：手动刷新视为用户主动开一轮新会话——清零失败计数与终止标志，给后端一次干净的尝试
  if (options.manual) {
    autoStopped = false
    consecutiveErrors = 0
  }
  if (!hasActiveTasks(rows.value)) {
    stopPolling()
    updateHint('inactive', 0)
    return
  }
  if (autoStopped) return // 护栏已终止：保留提示，等用户手动刷新

  if (sessionStart === undefined) sessionStart = Date.now()
  const decision = shouldKeepPolling({
    hasActive: true,
    hidden: document.hidden,
    elapsedMs: Date.now() - sessionStart,
    consecutiveErrors,
    maxMs: POLL_MAX_DURATION_MS,
    maxErrors: POLL_MAX_CONSECUTIVE_ERRORS,
  })
  if (decision.keep) {
    const delayMs = nextDelay(consecutiveErrors)
    scheduleNext(delayMs)
    updateHint('ok', delayMs)
    return
  }
  if (decision.reason === 'hidden') {
    pausePolling()
    updateHint('hidden', 0)
    return
  }
  stopPolling()
  autoStopped = true
  updateHint(decision.reason, 0)
  ElMessage.warning(stopMessage(decision.reason))
}

/** manual：用户触发（搜索/分页/刷新/操作后）——允许重开被护栏停掉的会话并清零退避计数 */
async function loadTasks(options: { manual?: boolean } = {}): Promise<void> {
  loading.value = true
  try {
    const params: ListTasksParams = { page: filter.page, page_size: filter.page_size }
    if (filter.status) params.status = filter.status
    const page = await listTasks(params)
    rows.value = page.items
    total.value = page.total
    consecutiveErrors = 0 // 成功即复位退避间隔
  } catch {
    // why：拦截器已提示；此处只累计失败次数，供退避与止损判断
    consecutiveErrors += 1
  } finally {
    loading.value = false
    syncPolling(options)
  }
}

function onSearch(): void {
  filter.page = 1
  void loadTasks({ manual: true })
}

function onPageChange(page: number): void {
  filter.page = page
  void loadTasks({ manual: true })
}

function onSizeChange(size: number): void {
  filter.page_size = size
  filter.page = 1
  void loadTasks({ manual: true })
}

async function refreshTask(row: Task): Promise<void> {
  const fresh = await getTaskResults(row.id).catch(() => null)
  if (fresh) {
    const index = rows.value.findIndex((t) => t.id === row.id)
    if (index >= 0) rows.value[index] = fresh.task
  }
  await loadTasks({ manual: true })
}

// ---- 创建执行任务 ----
const createVisible = ref(false)
const activeCases = ref<TestCase[]>([])
const selectedCaseIds = ref<number[]>([])
const timeoutSeconds = ref(300)
const submitting = ref(false)

async function openCreate(): Promise<void> {
  try {
    const page = await listCases({ status: 'active', page_size: 100 })
    activeCases.value = page.items
  } catch {
    activeCases.value = []
  }
  if (activeCases.value.length === 0) {
    ElMessage.warning('暂无可执行的 active 用例，请先在「用例管理」审核激活')
    return
  }
  // why：列表接口有 page_size 上限（review M5/M7），超过 100 个时明确提示而非静默截断
  if (activeCases.value.length >= 100) {
    ElMessage.info('active 用例超过 100 个，仅显示前 100，可先按需激活')
  }
  selectedCaseIds.value = []
  timeoutSeconds.value = 300
  createVisible.value = true
}

function caseLabel(caseItem: TestCase): string {
  return `#${caseItem.id} · ${caseItem.method} ${caseItem.path} · ${caseItem.name}`
}

async function submitCreate(): Promise<void> {
  if (selectedCaseIds.value.length === 0) {
    ElMessage.warning('请至少选择一个用例')
    return
  }
  submitting.value = true
  try {
    const task = await createTask({
      case_ids: selectedCaseIds.value,
      timeout_seconds: timeoutSeconds.value,
    })
    ElMessage.success(`任务已创建（#${task.id}），Lookup-Create 幂等：同输入返回同一任务`)
    createVisible.value = false
    filter.page = 1
    await loadTasks({ manual: true })
    // 新建任务通常非终态，立即打开结果抽屉观察执行
    openDrawer(task)
  } catch {
    // why：拦截器已提示（draft 不可执行 / 422 等）
  } finally {
    submitting.value = false
  }
}

// ---- 结果抽屉 ----
const drawerVisible = ref(false)
const drawerTask = ref<Task | null>(null)
const drawerResults = ref<TaskResultItem[]>([])
const drawerLoading = ref(false)

async function openDrawer(task: Task): Promise<void> {
  drawerTask.value = task
  drawerVisible.value = true
  await loadResults(task.id)
}

async function loadResults(taskId: number): Promise<void> {
  drawerLoading.value = true
  try {
    const data: TaskResults = await getTaskResults(taskId)
    drawerTask.value = data.task
    drawerResults.value = data.results
  } catch {
    drawerResults.value = []
  } finally {
    drawerLoading.value = false
  }
}

/** 执行结果 status → StatusTag 词汇（junit_parser：pass/fail/error/skipped） */
function resultTagStatus(status: string): string {
  if (status === 'pass') return 'success'
  if (status === 'fail' || status === 'error') return 'failed'
  if (status === 'skipped') return 'skipped'
  return status
}

function viewReport(task: Task): void {
  if (!task.report_link) {
    ElMessage.info('报告尚未生成（任务未成功或报告生成失败）')
    return
  }
  // why：review N3——报告改走带鉴权端点（后端已摘掉无鉴权 /static），window.open 无法带 Authorization 头，
  // 故用 axios 取回 HTML 再以 blob 打开；baseURL 置空因为 report_link 已是完整绝对路径
  void (async () => {
    try {
      const html = await apiGet<string>(task.report_link as string, { baseURL: '' })
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank', 'noopener')
      // 交给浏览器加载后再释放，避免刚打开就失效
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      // why：拦截器已提示（401 会清 token 跳转；404 说明报告未生成）
    }
  })()
}

async function onCancel(row: Task): Promise<void> {
  // why：RUNNING 取消会先杀掉 pytest 进程树（P2-3）——后果与排队期取消不同，文案要如实说明
  const running = row.status === 'running'
  try {
    await ElMessageBox.confirm(
      running
        ? `确定取消正在执行的任务 #${row.id}？会立即终止其 pytest 进程，任务记为失败（cancelled），可再点「重试」重新执行。`
        : `确定取消任务 #${row.id}？取消后状态为失败（cancelled），可再点「重试」重新执行。`,
      '取消任务',
      { type: 'warning', confirmButtonText: '取消任务', cancelButtonText: '再想想' },
    )
  } catch {
    return // 用户放弃
  }
  try {
    await cancelTask(row.id)
    ElMessage.success(`任务 #${row.id} 已取消`)
    await loadTasks({ manual: true })
  } catch {
    // why：并发下任务可能刚跑完 → 后端 409，拦截器已提示原因
    await loadTasks({ manual: true })
  }
}

async function onRetry(row: Task): Promise<void> {
  try {
    await retryTask(row.id)
    ElMessage.success(`任务 #${row.id} 已重新入队`)
    await loadTasks({ manual: true })
  } catch {
    // why：拦截器已提示（仅 failed 可重试）
  }
}

// why：后台标签页照拉列表纯属浪费请求——隐藏即暂停，回前台立即补一次最新状态再按需续期
function onVisibilityChange(): void {
  if (document.hidden) {
    if (sessionStart === undefined) return // 本来就没在轮询，无需改提示
    pausePolling()
    updateHint('hidden', 0)
    return
  }
  resumePolling()
  void loadTasks()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  void loadTasks({ manual: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopPolling()
})
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">任务执行</h1>
        <p class="page__desc">选定 active 用例异步执行（Celery），接口立即返回 task_id，客户端轮询至终态</p>
      </div>
      <el-button type="primary" :icon="VideoPlay" @click="openCreate">新建执行</el-button>
    </header>

    <section class="panel filters">
      <el-select v-model="filter.status" placeholder="状态" clearable class="filters__item" @change="onSearch">
        <el-option v-for="opt in STATUS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
      <el-button :icon="Refresh" @click="onSearch">刷新</el-button>
      <span v-if="pollHint" class="filters__hint">
        <span class="filters__pulse" /> {{ pollHint }}
      </span>
    </section>

    <section class="panel">
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="ID" width="70">
          <template #default="{ row }">
            <span class="mono num">#{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="run_id" min-width="170">
          <template #default="{ row }">
            <span class="mono cell-mono" :title="row.run_id">{{ truncate(row.run_id, 30) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="用例数" width="78" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.case_ids.length }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="错误" min-width="150">
          <template #default="{ row }">
            <span v-if="row.error_msg" class="cell-error" :title="row.error_msg">
              <span class="mono">{{ row.error_stage }}</span> · {{ truncate(row.error_msg, 42) }}
            </span>
            <span v-else class="cell-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="128">
          <template #default="{ row }">
            <span class="mono num">{{ formatDateTime(row.started_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="完成时间" width="128">
          <template #default="{ row }">
            <span class="mono num">{{ formatDateTime(row.finished_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDrawer(row)">结果</el-button>
            <el-button
              v-if="row.status === 'pending' || row.status === 'running'"
              link
              type="primary"
              @click="refreshTask(row)"
            >
              刷新
            </el-button>
            <el-button v-else link type="primary" @click="viewReport(row)">报告</el-button>
            <!-- why：review N4 给 pending 孤儿出口；P2-3 起 running 也可取消（后端先杀 pytest 进程树） -->
            <el-button
              v-if="row.status === 'pending' || row.status === 'running'"
              link
              type="warning"
              @click="onCancel(row)"
            >
              取消
            </el-button>
            <el-button v-if="row.status === 'failed'" link type="success" @click="onRetry(row)">
              重试
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          :current-page="filter.page"
          :page-size="filter.page_size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </section>

    <!-- 新建执行 -->
    <el-dialog v-model="createVisible" title="新建执行任务" width="560px">
      <p class="create-desc">
        仅 <strong>active</strong> 用例可执行（draft 属防幻觉护栏，不可被自动选中）。
        相同用例集合 + 超时的重复提交会命中幂等，直接返回已有任务。
      </p>
      <el-form label-width="90px">
        <el-form-item label="用例">
          <el-select
            v-model="selectedCaseIds"
            multiple
            filterable
            placeholder="选择 active 用例"
            style="width: 100%"
          >
            <el-option v-for="item in activeCases" :key="item.id" :label="caseLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="超时(秒)">
          <el-input-number v-model="timeoutSeconds" :min="1" :max="3600" :step="30" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">创建并执行</el-button>
      </template>
    </el-dialog>

    <!-- 结果抽屉 -->
    <el-drawer v-model="drawerVisible" size="520px" :title="drawerTask ? `任务 #${drawerTask.id} 执行结果` : '执行结果'">
      <div v-if="drawerTask" v-loading="drawerLoading">
        <div class="result-meta">
          <div class="result-meta__row">
            <span class="result-meta__label">状态</span>
            <StatusTag :status="drawerTask.status" />
          </div>
          <div class="result-meta__row">
            <span class="result-meta__label">run_id</span>
            <span class="mono cell-mono" :title="drawerTask.run_id">{{ truncate(drawerTask.run_id, 42) }}</span>
          </div>
          <div class="result-meta__row">
            <span class="result-meta__label">PID</span>
            <span class="mono num">{{ drawerTask.pid ?? '—' }}</span>
          </div>
          <div v-if="drawerTask.error_msg" class="result-meta__row">
            <span class="result-meta__label">错误</span>
            <span class="cell-error">{{ drawerTask.error_stage }} · {{ drawerTask.error_msg }}</span>
          </div>
          <div class="result-meta__row">
            <span class="result-meta__label">报告</span>
            <el-button v-if="drawerTask.report_link" link type="primary" @click="viewReport(drawerTask)">
              打开 HTML 报告
            </el-button>
            <span v-else class="cell-muted">—</span>
          </div>
        </div>

        <div class="result-summary" v-if="drawerTask.result_summary">
          <div class="result-summary__item">
            <span class="num">{{ drawerTask.result_summary.total ?? '—' }}</span>
            <span class="result-summary__label">总数</span>
          </div>
          <div class="result-summary__item">
            <span class="num is-pass">{{ drawerTask.result_summary.passed ?? '—' }}</span>
            <span class="result-summary__label">通过</span>
          </div>
          <div class="result-summary__item">
            <span class="num is-fail">{{ drawerTask.result_summary.failed ?? '—' }}</span>
            <span class="result-summary__label">失败</span>
          </div>
          <div class="result-summary__item">
            <span class="num">{{ drawerTask.result_summary.skipped ?? '—' }}</span>
            <span class="result-summary__label">跳过</span>
          </div>
        </div>

        <el-table :data="drawerResults" size="small">
          <el-table-column label="用例 ID" width="90">
            <template #default="{ row }">
              <span class="mono num">#{{ row.case_id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <StatusTag :status="resultTagStatus(row.status)" />
            </template>
          </el-table-column>
          <el-table-column label="失败信息" min-width="150">
            <template #default="{ row }">
              <span class="cell-error" :title="row.failure_msg || ''">{{ row.failure_msg || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!drawerLoading && drawerResults.length === 0" class="result-empty">
          暂无逐用例结果{{ drawerTask.status === 'running' ? '（执行中）' : '' }}
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.filters__item {
  width: 130px;
}

.filters__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tp-running);
}

.filters__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tp-running);
  animation: hint-pulse 1.2s ease-in-out infinite;
}

@keyframes hint-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.cell-mono {
  font-size: 12px;
  color: var(--tp-ink-500);
}

.cell-muted {
  color: var(--tp-ink-400);
}

.cell-error {
  color: var(--tp-failed);
  font-size: 12px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 14px 16px;
}

.create-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--tp-ink-500);
  line-height: 1.7;
}

.result-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--tp-line);
}

.result-meta__row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.result-meta__label {
  width: 64px;
  flex-shrink: 0;
  color: var(--tp-ink-400);
}

.result-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.result-summary__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border: 1px solid var(--tp-line);
  border-radius: 8px;
  font-size: 20px;
  font-weight: 700;
  color: var(--tp-ink-900);

  .is-pass {
    color: var(--tp-success);
  }
  .is-fail {
    color: var(--tp-failed);
  }
}

.result-summary__label {
  font-size: 11px;
  font-weight: 400;
  color: var(--tp-ink-400);
}

.result-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--tp-ink-400);
}
</style>
