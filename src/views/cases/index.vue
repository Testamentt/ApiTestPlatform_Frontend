<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { confirmCase, createCase, deleteCase, listCases, updateCase } from '@/api/cases'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatTime, truncate } from '@/utils/format'
import type {
  CaseCreate,
  CaseStatus,
  CaseUpdate,
  HttpMethod,
  ListCasesParams,
  TestCase,
} from '@/types'

// ---- 查询过滤 ----
const filter = reactive<{ page: number; page_size: number; status: '' | CaseStatus; method: '' | HttpMethod; keyword: string }>({
  page: 1,
  page_size: 20,
  status: '',
  method: '',
  keyword: '',
})

const rows = ref<TestCase[]>([])
const total = ref(0)
const loading = ref(false)

const METHOD_OPTIONS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const STATUS_OPTIONS: { label: string; value: CaseStatus }[] = [
  { label: '草稿', value: 'draft' },
  { label: '已激活', value: 'active' },
  { label: '已归档', value: 'archived' },
]
const SOURCE_LABEL: Record<string, string> = { manual: '手工', ai: 'AI 生成', swagger: 'Swagger' }

async function loadCases(): Promise<void> {
  loading.value = true
  try {
    const query: ListCasesParams = { page: filter.page, page_size: filter.page_size }
    if (filter.status) query.status = filter.status
    if (filter.method) query.method = filter.method
    if (filter.keyword.trim()) query.keyword = filter.keyword.trim()
    const page = await listCases(query)
    rows.value = page.items
    total.value = page.total
  } catch {
    // why：错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

function onSearch(): void {
  filter.page = 1
  void loadCases()
}

function onReset(): void {
  filter.status = ''
  filter.method = ''
  filter.keyword = ''
  filter.page = 1
  void loadCases()
}

function onPageChange(page: number): void {
  filter.page = page
  void loadCases()
}

function onSizeChange(size: number): void {
  filter.page_size = size
  filter.page = 1
  void loadCases()
}

// ---- 新建 / 编辑表单 ----
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  method: 'GET' as HttpMethod,
  path: '',
  operation_id: '',
  expected_status: 200,
  paramsText: '',
  bodyText: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入用例名称', trigger: 'blur' }],
  path: [{ required: true, message: '请输入接口路径（以 / 开头）', trigger: 'blur' }],
  operation_id: [{ required: true, message: '请输入 operation_id', trigger: 'blur' }],
}

function resetForm(): void {
  form.name = ''
  form.method = 'GET'
  form.path = ''
  form.operation_id = ''
  form.expected_status = 200
  form.paramsText = ''
  form.bodyText = ''
}

function openCreate(): void {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: TestCase): void {
  editingId.value = row.id
  form.name = row.name
  form.method = (row.method as HttpMethod) || 'GET'
  form.path = row.path
  form.operation_id = row.operation_id
  form.expected_status = row.expected_status
  form.paramsText = row.params ? JSON.stringify(row.params, null, 2) : ''
  form.bodyText = row.body ? JSON.stringify(row.body, null, 2) : ''
  dialogVisible.value = true
}

/** 解析可选 JSON 文本字段；非法 JSON 返回 null 并提示 */
function tryParseJson(text: string, label: string): Record<string, unknown> | null | undefined {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      ElMessage.error(`${label} 必须是 JSON 对象`)
      return undefined
    }
    return parsed as Record<string, unknown>
  } catch {
    ElMessage.error(`${label} 不是合法的 JSON`)
    return undefined
  }
}

async function submitForm(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  const params = tryParseJson(form.paramsText, 'params')
  const body = tryParseJson(form.bodyText, 'body')
  if (params === undefined || body === undefined) return

  saving.value = true
  try {
    if (editingId.value === null) {
      const payload: CaseCreate = {
        name: form.name.trim(),
        method: form.method,
        path: form.path.trim(),
        operation_id: form.operation_id.trim(),
        expected_status: form.expected_status,
        params,
        body,
      }
      await createCase(payload)
      ElMessage.success('用例已创建（draft）')
    } else {
      // why：先记录原状态——active 用例被语义闸降级时要给出准确反馈
      const wasActive = rows.value.find((item) => item.id === editingId.value)?.status === 'active'
      const payload: CaseUpdate = {
        name: form.name.trim(),
        method: form.method,
        path: form.path.trim(),
        operation_id: form.operation_id.trim(),
        expected_status: form.expected_status,
        params,
        body,
      }
      await updateCase(editingId.value, payload)
      // why：后端语义闸——active 用例内容一变即降级 draft 重新审核，
      // 界面必须如实告知，否则用户以为还在执行池里
      if (wasActive) {
        ElMessage.warning('用例已更新，内容变更已降级为 draft，需重新审核激活')
      } else {
        ElMessage.success('用例已更新')
      }
    }
    dialogVisible.value = false
    void loadCases()
  } catch {
    // why：拦截器已提示
  } finally {
    saving.value = false
  }
}

// ---- 审核确认（防幻觉护栏：仅人工路径可 draft→active） ----
async function onConfirm(row: TestCase): Promise<void> {
  if (row.status !== 'draft') {
    ElMessage.info('仅草稿用例可确认激活')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('输入审核人（reviewer）', `确认激活用例 #${row.id}`, {
      confirmButtonText: '确认激活',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '审核人不能为空',
    })
    await confirmCase(row.id, value.trim())
    ElMessage.success(`用例 #${row.id} 已激活`)
    void loadCases()
  } catch {
    // why：用户取消或后端拒绝，均不打扰
  }
}

async function onDelete(row: TestCase): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除用例「${row.name}」？删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteCase(row.id)
    ElMessage.success('已删除')
    void loadCases()
  } catch {
    // why：取消不打扰
  }
}

onMounted(() => void loadCases())
</script>

<template>
  <div class="page">
    <header class="page__header">
      <div>
        <h1 class="page__title">用例管理</h1>
        <p class="page__desc">AI 生成与手工用例的 CRUD；草稿需人工审核后置为 active 才可执行</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建用例</el-button>
    </header>

    <section class="panel filters">
      <el-select v-model="filter.status" placeholder="状态" clearable class="filters__item" @change="onSearch">
        <el-option v-for="opt in STATUS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
      <el-select v-model="filter.method" placeholder="方法" clearable class="filters__item" @change="onSearch">
        <el-option v-for="m in METHOD_OPTIONS" :key="m" :label="m" :value="m" />
      </el-select>
      <el-input
        v-model="filter.keyword"
        placeholder="搜索名称 / 路径 / operation_id"
        clearable
        class="filters__keyword"
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-button type="primary" plain @click="onSearch">查询</el-button>
      <el-button :icon="Refresh" @click="onReset">重置</el-button>
    </section>

    <section class="panel">
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="ID" width="64">
          <template #default="{ row }">
            <span class="mono num">#{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="180">
          <template #default="{ row }">
            <div class="cell-name">{{ row.name }}</div>
            <div class="cell-sub mono" :title="row.operation_id">{{ truncate(row.operation_id, 26) }}</div>
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
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <span class="source-chip" :class="row.source === 'ai' ? 'source-chip--ai' : row.source === 'swagger' ? 'source-chip--swagger' : ''">
              {{ SOURCE_LABEL[row.source] ?? row.source }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="信任度" width="76" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.trust_score }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="92">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="128">
          <template #default="{ row }">
            <span class="mono num">{{ formatTime(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="196" fixed="right">
          <template #default="{ row }">
            <el-tooltip :disabled="row.status === 'draft'" content="仅草稿可激活">
              <span>
                <el-button
                  link
                  type="primary"
                  :disabled="row.status !== 'draft'"
                  @click="onConfirm(row)"
                >
                  确认
                </el-button>
              </span>
            </el-tooltip>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
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

    <!-- 新建 / 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId === null ? '新建用例' : `编辑用例 #${editingId}`" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="用例名称" prop="name">
          <el-input v-model="form.name" placeholder="如 httpbin-get" maxlength="255" />
        </el-form-item>
        <el-form-item label="方法" prop="method">
          <el-select v-model="form.method" style="width: 100%">
            <el-option v-for="m in METHOD_OPTIONS" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="接口路径" prop="path">
          <el-input v-model="form.path" placeholder="以 / 开头，如 /get" maxlength="1024" />
        </el-form-item>
        <el-form-item label="operation_id" prop="operation_id">
          <el-input v-model="form.operation_id" placeholder="血缘映射唯一标识，如 httpbin_get" maxlength="255" />
        </el-form-item>
        <el-form-item label="期望状态码">
          <el-input-number v-model="form.expected_status" :min="100" :max="599" />
        </el-form-item>
        <el-form-item label="params (JSON)">
          <el-input v-model="form.paramsText" type="textarea" :rows="3" placeholder='{"key": "value"}' class="mono" />
        </el-form-item>
        <el-form-item label="body (JSON)">
          <el-input v-model="form.bodyText" type="textarea" :rows="3" placeholder='{"field": "value"}' class="mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filters__item {
  width: 130px;
}

.filters__keyword {
  width: 260px;
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

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 14px 16px;
}
</style>
