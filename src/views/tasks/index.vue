<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, Refresh } from '@element-plus/icons-vue'
import { createTask, getTaskResults, listTasks } from '@/api/tasks'
import { listCases } from '@/api/cases'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatDateTime, truncate } from '@/utils/format'
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

// ---- 轮询：2s 间隔，仅当存在 pending/running 任务时保持（离开页面清理） ----
let timer: number | undefined

function isActiveStatus(status: TaskStatus): boolean {
  return status === 'pending' || status === 'running'
}

function ensurePolling(): void {
  const hasActive = rows.value.some((t) => isActiveStatus(t.status))
  if (hasActive && timer === undefined) {
    timer = window.setInterval(() => void loadTasks(), 2000)
  } else if (!hasActive && timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
}

async function loadTasks(): Promise<void> {
  loading.value = true
  try {
    const params: ListTasksParams = { page: filter.page, page_size: filter.page_size }
    if (filter.status) params.status = filter.status
    const page = await listTasks(params)
    rows.value = page.items
    total.value = page.total
  } catch {
    // why：拦截器已提示
  } finally {
    loading.value = false
    ensurePolling()
  }
}

function onSearch(): void {
  filter.page = 1
  void loadTasks()
}

function onPageChange(page: number): void {
  filter.page = page
  void loadTasks()
}

function onSizeChange(size: number): void {
  filter.page_size = size
  filter.page = 1
  void loadTasks()
}

async function refreshTask(row: Task): Promise<void> {
  const fresh = await getTaskResults(row.id).catch(() => null)
  if (fresh) {
    const index = rows.value.findIndex((t) => t.id === row.id)
    if (index >= 0) rows.value[index] = fresh.task
  }
  await loadTasks()
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
    await loadTasks()
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
  // why：report_link 为后端 /static 相对路径，dev 经 Vite 代理同源访问
  window.open(task.report_link, '_blank', 'noopener')
}

onMounted(() => void loadTasks())
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
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
      <span v-if="rows.some((t) => t.status === 'pending' || t.status === 'running')" class="filters__hint">
        <span class="filters__pulse" /> 有任务执行中，每 2s 自动刷新
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
        <el-table-column label="操作" width="150" fixed="right">
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
