// 全局类型：镜像后端 Pydantic schema（backend/app/schemas/*）。
// why：前后端契约单一来源在后端；前端按需抽取，避免 any 裸奔（面试防守点）。

/** 统一成功响应包装：{code, message, data} */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

/** 统一分页结构 */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

/** 业务错误响应（后端 AppError 统一格式） */
export interface ApiErrorBody {
  code: string
  message: string
  detail?: string | null
}

// ---------- 状态枚举（对齐 app/models/enums.py） ----------

/** 用例状态 */
export type CaseStatus = 'draft' | 'active' | 'archived'
/** 用例来源 */
export type CaseSource = 'manual' | 'ai' | 'swagger'
/** 执行/生成任务状态 */
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

/** HTTP 方法（对齐 HTTP_METHODS Literal） */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

// ---------- 用例（app/schemas/case.py） ----------

export interface CaseCreate {
  name: string
  method: HttpMethod
  path: string
  operation_id: string
  params?: Record<string, unknown> | null
  body?: Record<string, unknown> | null
  expected_status?: number
  assertions?: unknown[] | null
}

export interface CaseUpdate {
  name?: string | null
  method?: HttpMethod | null
  path?: string | null
  operation_id?: string | null
  params?: Record<string, unknown> | null
  body?: Record<string, unknown> | null
  expected_status?: number | null
  assertions?: unknown[] | null
}

export interface TestCase {
  id: number
  name: string
  method: string
  path: string
  operation_id: string
  params: Record<string, unknown> | null
  body: Record<string, unknown> | null
  expected_status: number
  assertions: unknown[] | null
  status: CaseStatus
  source: CaseSource
  trust_score: number
  created_at: string
  updated_at: string
}

export interface ConfirmBody {
  reviewer: string
}

export interface ConfirmResult {
  case_id: number
  status: CaseStatus
}

// ---------- 任务（app/schemas/task.py） ----------

export interface TaskCreate {
  case_ids: number[]
  timeout_seconds?: number
}

export interface Task {
  id: number
  run_id: string
  case_ids: number[]
  status: TaskStatus
  pid: number | null
  celery_task_id: string | null
  error_stage: string | null
  error_msg: string | null
  started_at: string | null
  finished_at: string | null
  result_summary: Record<string, unknown> | null
  report_link: string | null
  created_at: string
  updated_at: string
}

export interface TaskResultItem {
  case_id: number
  name: string
  status: string
  failure_msg: string | null
}

export interface TaskResults {
  task: Task
  results: TaskResultItem[]
}

// ---------- AI 生成（app/schemas/generate.py） ----------

export interface GenerateRequest {
  document: Record<string, unknown>
  operation_ids?: string[] | null
  force_full?: boolean
}

export interface GenerationTask {
  id: number
  run_id: string
  status: TaskStatus
  operation_count: number
  celery_task_id: string | null
  prompt_version: string | null
  error_stage: string | null
  error_msg: string | null
  result_summary: Record<string, unknown> | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

// ---------- 健康检查（app/api/v1/health.py） ----------

export interface HealthRead {
  status: 'ok' | 'degraded'
  db: 'up' | 'down'
  redis: 'up' | 'down'
}

// ---------- 查询参数 ----------

export interface ListCasesParams {
  page?: number
  page_size?: number
  status?: CaseStatus
  method?: HttpMethod
  operation_id?: string
  keyword?: string
}

export interface ListTasksParams {
  page?: number
  page_size?: number
  status?: TaskStatus
}

/** 生成任务 result_summary 的类型化视图（LLM 结果，字段可缺省） */
export interface GenerateSummary {
  generated?: number
  draft_created?: number
  rejected?: number
  rejected_detail?: { operation_id: string; reason: string }[]
  skipped_by_filter?: number
  skipped_detail?: unknown[]
  prompt_version?: string
  cost_total?: number
}
