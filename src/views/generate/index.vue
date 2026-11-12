<!-- 本项目编码格式：UTF-8（无 BOM）。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Refresh } from '@element-plus/icons-vue'
import yaml from 'js-yaml'
import type { UploadFile } from 'element-plus'
import { createGeneration, getGeneration } from '@/api/generate'
import { confirmCase, listCases } from '@/api/cases'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatTime, truncate } from '@/utils/format'
import type { GenerateSummary, GenerationTask, TestCase } from '@/types'

// 与后端 swagger.max_upload_bytes 一致的前端预检上限（此处镜像后端配置契约）
const MAX_DOC_BYTES = 2_000_000

// ---- Swagger 文档输入 ----
const docText = ref('')
const operationIdsText = ref('')
const forceFull = ref(false)
const submitting = ref(false)

function handleFileChange(file: UploadFile): void {
  const raw = file.raw
  if (!raw) return
  const reader = new FileReader()
  reader.onload = () => {
    docText.value = String(reader.result ?? '')
  }
  reader.onerror = () => {
    ElMessage.error('文件读取失败，请重试或改用粘贴方式')
  }
  reader.readAsText(raw)
}

/** 前端预检：JSON 优先，失败降级 YAML；要求对象且含 paths（后端做最终权威校验） */
function parseDocument(): Record<string, unknown> | null {
  const text = docText.value.trim()
  if (!text) {
    ElMessage.warning('请先粘贴或上传 Swagger/OpenAPI 3.x 文档')
    return null
  }
  if (text.length > MAX_DOC_BYTES) {
    ElMessage.error('文档超过 2MB 上限（对应后端 swagger.max_upload_bytes），拒绝生成')
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    try {
      parsed = yaml.load(text)
    } catch {
      ElMessage.error('文档既不是合法 JSON，也不是合法 YAML')
      return null
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    ElMessage.error('文档必须是对象结构（OpenAPI 3.x）')
    return null
  }
  const doc = parsed as Record<string, unknown>
  if (!doc.paths || typeof doc.paths !== 'object') {
    ElMessage.error('文档缺少 paths 字段，不是有效的 OpenAPI 3.x 文档')
    return null
  }
  return doc
}

// ---- 生成任务 + 轮询 ----
const genTask = ref<GenerationTask | null>(null)
let timer: number | undefined
// why：网络抖动不再一击停表，改为错误计数阈值（401 仍立即停）
const POLL_ERROR_LIMIT = 5
let errorStreak = 0

const summary = computed<GenerateSummary>(
  () => (genTask.value?.result_summary as GenerateSummary | null) ?? {},
)

// why：跳过明细是"为什么一条都没生成"的唯一线索，前端必须展示出来
const skippedDetail = computed<string[]>(() => summary.value.skipped_detail ?? [])

function startPolling(taskId: number): void {
  stopPolling()
  errorStreak = 0
  timer = window.setInterval(async () => {
    try {
      const task = await getGeneration(taskId)
      errorStreak = 0
      genTask.value = task
      if (task.status === 'success' || task.status === 'failed') {
        stopPolling()
        if (task.status === 'success') {
          // why："0 草稿"不是成功观感：全部被跳过/拒绝时必须给 warning + 指向明细，
          // 否则用户看到绿色提示以为用例已入库
          const created = (task.result_summary as GenerateSummary | null)?.draft_created ?? 0
          if (created > 0) {
            ElMessage.success(`用例生成完成：新增 ${created} 条草稿（防幻觉护栏：默认 draft）`)
            void loadDrafts()
          } else {
            ElMessage.warning('生成任务结束但未产生任何草稿用例，请查看下方"跳过/被拒明细"')
          }
        }
      }
    } catch (error) {
      // why：此前任何一次网络抖动都会永久停表（任务在跑却看不到结果）；
      // 现改为错误计数 + 阈值：401/403（拦截器已清 token 并跳转）立即停，网络错误重试到上限
      const code = (error as { code?: string }).code
      if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID') {
        stopPolling()
        return
      }
      errorStreak += 1
      if (errorStreak >= POLL_ERROR_LIMIT) {
        stopPolling()
        ElMessage.error(`连续 ${POLL_ERROR_LIMIT} 次获取任务状态失败，已停止轮询（可点「刷新进度」恢复）`)
      }
    }
  }, 2000)
}

function stopPolling(): void {
  if (timer) window.clearInterval(timer)
  timer = undefined
}

function resetGeneration(): void {
  stopPolling()
  genTask.value = null
}

/** why：停表后（或刷新页面后）必须能手动恢复观察，否则任务在跑也无从得知 */
function resumePolling(): void {
  if (genTask.value) startPolling(genTask.value.id)
}

async function submitGenerate(): Promise<void> {
  const doc = parseDocument()
  if (!doc) return
  submitting.value = true
  try {
    const ids = operationIdsText.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const task = await createGeneration({
      document: doc,
      operation_ids: ids.length ? ids : null,
      force_full: forceFull.value,
    })
    genTask.value = task
    ElMessage.success(`生成任务已创建（#${task.id}）`)
    startPolling(task.id)
  } catch {
    // why：拦截器已提示（如无未覆盖用例 422 / 畸形文档）
  } finally {
    submitting.value = false
  }
}

// ---- AI 草稿用例列表 ----
const draftCases = ref<TestCase[]>([])
const draftLoading = ref(false)

async function loadDrafts(): Promise<void> {
  draftLoading.value = true
  try {
    const page = await listCases({ status: 'draft', page_size: 50 })
    draftCases.value = page.items
  } catch {
    draftCases.value = []
  } finally {
    draftLoading.value = false
  }
}

async function onConfirmDraft(row: TestCase): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('输入审核人（reviewer）', `确认激活用例 #${row.id}`, {
      confirmButtonText: '确认激活',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '审核人不能为空',
    })
    await confirmCase(row.id, value.trim())
    ElMessage.success(`用例 #${row.id} 已激活`)
    await loadDrafts()
  } catch {
    // why：取消或后端拒绝均不打扰
  }
}

onMounted(() => void loadDrafts())
onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">AI 生成</h1>
        <p class="page__desc">粘贴 Swagger/OpenAPI 文档 → LLM 生成用例（Celery 异步，默认 draft，人工审核后执行）</p>
      </div>
      <el-button v-if="genTask" @click="resetGeneration">新建生成</el-button>
    </header>

    <div class="gen-grid">
      <!-- 输入区 -->
      <section class="panel gen-form">
        <div class="gen-form__head">
          <h3 class="gen-form__title">文档输入</h3>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".json,.yaml,.yml,.txt"
            :on-change="handleFileChange"
          >
            <el-button :icon="MagicStick" plain>读取文件</el-button>
          </el-upload>
        </div>

        <el-input
          v-model="docText"
          type="textarea"
          :rows="12"
          placeholder='粘贴 OpenAPI 3.x 文档（JSON 或 YAML），如 {"openapi":"3.0.0","paths":{...}}'
          class="mono gen-form__doc"
        />

        <div class="gen-form__row">
          <el-input
            v-model="operationIdsText"
            placeholder="定向 operation_ids（逗号分隔，可空=智能决策）"
            class="gen-form__ops"
          />
          <el-checkbox v-model="forceFull">全量重建</el-checkbox>
          <el-button type="primary" :loading="submitting" @click="submitGenerate">
            {{ genTask ? '重新生成' : '触发生成' }}
          </el-button>
        </div>
        <p class="gen-form__hint">
          触发优先级：定向 operation_ids &gt; 全量重建 &gt; 最新影响分析未覆盖接口。重复输入命中幂等，返回同一任务。
        </p>
      </section>

      <!-- 生成任务进度 -->
      <section class="panel gen-progress">
        <h3 class="gen-form__title">生成任务</h3>
        <div v-if="!genTask" class="gen-progress__empty">
          <span class="gen-progress__icon">⏻</span>
          <p>尚未触发生成。粘贴文档后点击「触发生成」，任务以 202 立即返回并在后台执行。</p>
        </div>

        <template v-else>
          <div class="gen-progress__meta">
            <div class="gen-progress__row">
              <span class="gen-progress__label">任务 ID</span>
              <span class="mono num">#{{ genTask.id }}</span>
            </div>
            <div class="gen-progress__row">
              <span class="gen-progress__label">状态</span>
              <StatusTag :status="genTask.status" />
            </div>
            <div class="gen-progress__row">
              <span class="gen-progress__label">接口数</span>
              <span class="num">{{ genTask.operation_count }}</span>
            </div>
            <div v-if="genTask.prompt_version" class="gen-progress__row">
              <span class="gen-progress__label">prompt 版本</span>
              <span class="mono">{{ genTask.prompt_version }}</span>
            </div>
          </div>

          <template v-if="genTask.status === 'success'">
            <div class="gen-result">
              <div class="gen-result__item">
                <span class="num">{{ summary.draft_created ?? 0 }}</span>
                <span>入库草稿</span>
              </div>
              <div class="gen-result__item">
                <span class="num">{{ summary.generated ?? 0 }}</span>
                <span>生成总数</span>
              </div>
              <div class="gen-result__item">
                <span class="num is-rejected">{{ summary.rejected ?? 0 }}</span>
                <span>校验拒绝</span>
              </div>
              <div class="gen-result__item">
                <span class="num">{{ summary.skipped_by_filter ?? 0 }}</span>
                <span>过滤跳过</span>
              </div>
              <div class="gen-result__item">
                <span class="num is-cost">{{ summary.cost_total?.toFixed(4) ?? '—' }}</span>
                <span>成本($)</span>
              </div>
            </div>
            <div v-if="summary.rejected_detail && summary.rejected_detail.length" class="gen-rejected">
              <p class="gen-rejected__title">
                被拒详情（语义校验 / schema 校验失败 / LLM 失败 / 敏感扫描拦截）
              </p>
              <div v-for="item in summary.rejected_detail" :key="item.operation_id" class="gen-rejected__item">
                <span class="mono">{{ item.operation_id }}</span>
                <span>{{ item.reason }}</span>
              </div>
              <!-- why：语义违规逐条列出（rule + detail），否则用户只知道"被拒"不知道"错在哪" -->
              <template v-for="item in summary.rejected_detail" :key="`v-${item.operation_id}`">
                <div v-for="(v, i) in item.violations ?? []" :key="i" class="gen-rejected__violation">
                  <span class="gen-rejected__rule" :class="`is-${v.level}`">{{ v.rule }}</span>
                  <span>{{ v.detail }}</span>
                </div>
              </template>
            </div>
            <!-- why：定向未命中的 operation_id 必须逐条可见，否则"全部跳过仍成功"看不到原因 -->
            <div v-if="skippedDetail.length" class="gen-rejected gen-rejected--skipped">
              <p class="gen-rejected__title">定向跳过详情（operation_id 不在文档中）</p>
              <div v-for="(detail, index) in skippedDetail" :key="index" class="gen-rejected__item">
                <span>{{ detail }}</span>
              </div>
            </div>
          </template>

          <template v-if="genTask.status === 'failed'">
            <el-alert
              :title="`生成失败（${genTask.error_stage ?? 'unknown'}）：${genTask.error_msg ?? ''}`"
              type="error"
              :closable="false"
              show-icon
            />
          </template>

          <div v-if="genTask.status === 'running' || genTask.status === 'pending'" class="gen-progress__wait">
            <span class="gen-progress__pulse" />
            {{ genTask.status === 'pending' ? '排队中…' : 'LLM 生成中（约 30-60s）…' }}
            <el-button link type="primary" size="small" @click="resumePolling">刷新进度</el-button>
          </div>
        </template>
      </section>
    </div>

    <!-- AI 草稿用例 -->
    <section class="panel gen-draft">
      <div class="panel__head">
        <h3 class="panel__title">AI 生成草稿（默认 draft，需人工审核激活）</h3>
        <el-button text :icon="Refresh" @click="loadDrafts">刷新</el-button>
      </div>
      <el-table v-loading="draftLoading" :data="draftCases" stripe>
        <el-table-column label="ID" width="64">
          <template #default="{ row }">
            <span class="mono num">#{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="180">
          <template #default="{ row }">
            <div class="cell-name">{{ row.name }}</div>
            <div class="cell-sub mono">{{ truncate(row.operation_id, 26) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="方法" width="86">
          <template #default="{ row }">
            <span class="method-chip" :class="`method-chip--${row.method}`">{{ row.method }}</span>
          </template>
        </el-table-column>
        <el-table-column label="路径" min-width="140">
          <template #default="{ row }">
            <span class="mono cell-path" :title="row.path">{{ truncate(row.path, 30) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期望" width="70" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.expected_status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="信任度" width="76" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.quality_flags?.length" placement="top" :show-after="200">
              <template #content>
                <div class="quality-tip">
                  <div class="quality-tip__title">扣分原因（共 -{{ 100 - row.trust_score }} 分）</div>
                  <div v-for="(flag, i) in row.quality_flags" :key="i" class="quality-tip__row">
                    <span>-{{ flag.penalty }}</span>
                    <span>{{ flag.reason }}</span>
                  </div>
                </div>
              </template>
              <span class="num trust is-scored">{{ row.trust_score }}</span>
            </el-tooltip>
            <span v-else class="num">{{ row.trust_score }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="128">
          <template #default="{ row }">
            <span class="mono num">{{ formatTime(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onConfirmDraft(row)">确认激活</el-button>
            <RouterLink class="gen-draft__link" to="/cases">去用例页</RouterLink>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!draftLoading && draftCases.length === 0" class="gen-draft__empty">
        暂无草稿用例。触发生成后，LLM 产出的用例将在这里等待人工审核。
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
// why：同 dashboard grid —— minmax(0,fr)+子项 min-width:0 防止内容撑开 track
.gen-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}

.gen-grid > * {
  min-width: 0;
}

.gen-form,
.gen-progress {
  padding: 16px;
}

.gen-form__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.gen-form__title,
.panel__title {
  margin: 0;
  font-size: 14px;
  color: var(--tp-ink-900);
}

.gen-form__doc {
  font-size: 12.5px;
}

.gen-form__row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  align-items: center;
}

.gen-form__ops {
  flex: 1;
}

.gen-form__hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--tp-ink-400);
  line-height: 1.6;
}

.gen-progress__empty {
  padding: 32px 8px;
  text-align: center;
  color: var(--tp-ink-400);
  font-size: 13px;
  line-height: 1.7;
}

.gen-progress__icon {
  display: block;
  font-size: 30px;
  margin-bottom: 8px;
  color: var(--tp-signal);
}

.gen-progress__meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.gen-progress__row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.gen-progress__label {
  width: 72px;
  flex-shrink: 0;
  color: var(--tp-ink-400);
}

.gen-progress__wait {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--tp-running);
}

.gen-progress__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tp-running);
  animation: gen-pulse 1.1s ease-in-out infinite;
}

@keyframes gen-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.gen-result {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.gen-result__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border: 1px solid var(--tp-line);
  border-radius: 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--tp-ink-900);

  .num.is-rejected {
    color: var(--tp-failed);
  }
  .num.is-cost {
    font-size: 13px;
  }
}

.gen-result__item span:last-child {
  font-size: 11px;
  font-weight: 400;
  color: var(--tp-ink-400);
}

.gen-rejected {
  margin-top: 14px;
  padding: 10px 12px;
  background: var(--tp-failed-soft);
  border-radius: 8px;
}

.gen-rejected--skipped {
  background: var(--tp-pending-soft);
}

.gen-rejected__title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-failed);
}

.gen-rejected__item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--tp-ink-500);
  margin-bottom: 2px;
}

.gen-rejected__item .mono {
  color: var(--tp-ink-700);
}

/* 语义违规：规则名做视觉锚点，level 区分拒掉（error）与仅降分（warn） */
.gen-rejected__violation {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--tp-ink-500);
  margin: 2px 0 2px 12px;
}

.gen-rejected__rule {
  flex-shrink: 0;
  font-family: var(--tp-font-mono, monospace);
  color: var(--tp-failed);

  &.is-warn {
    color: var(--tp-pending);
  }
}

.gen-draft {
  overflow: hidden;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.gen-draft__link {
  font-size: 13px;
  color: var(--tp-signal);
  text-decoration: none;
  margin-left: 8px;

  &:hover {
    text-decoration: underline;
  }
}

.cell-name {
  font-weight: 500;
  color: var(--tp-ink-900);
}

.cell-sub {
  font-size: 12px;
  color: var(--tp-ink-400);
}

.cell-path {
  font-size: 12.5px;
  color: var(--tp-ink-500);
}

.gen-draft__empty {
  padding: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--tp-ink-400);
}

.num.trust.is-scored {
  cursor: help;
  border-bottom: 1px dashed var(--tp-pending);
}

.quality-tip {
  max-width: 320px;
  line-height: 1.6;
}

.quality-tip__title {
  font-weight: 600;
  margin-bottom: 4px;
}

.quality-tip__row {
  display: flex;
  gap: 8px;

  span:first-child {
    flex-shrink: 0;
    color: var(--tp-failed);
  }
}

@media (max-width: 1080px) {
  .gen-grid {
    grid-template-columns: 1fr;
  }
}
</style>
