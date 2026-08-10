// 执行任务 API（对齐 backend/app/api/v1/tasks.py）
import { apiGet, apiPost } from './index'
import type { ListTasksParams, Page, Task, TaskCreate, TaskResults } from '@/types'

/** 创建执行任务（Lookup-Create 幂等：同输入返回已有任务） */
export function createTask(payload: TaskCreate): Promise<Task> {
  return apiPost<Task>('/tasks', payload)
}

/** 任务列表（分页 + status 过滤） */
export function listTasks(params: ListTasksParams = {}): Promise<Page<Task>> {
  return apiGet<Page<Task>>('/tasks', { params })
}

export function getTask(id: number): Promise<Task> {
  return apiGet<Task>(`/tasks/${id}`)
}

/** 任务执行结果（读 result_summary.results，无独立结果表） */
export function getTaskResults(id: number): Promise<TaskResults> {
  return apiGet<TaskResults>(`/tasks/${id}/results`)
}
