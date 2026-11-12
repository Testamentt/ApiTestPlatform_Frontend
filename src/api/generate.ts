// 本项目编码格式：UTF-8（无 BOM）。
// AI 生成 API（对齐 backend/app/api/v1/generate.py）
import { apiGet, apiPost } from './index'
import type { GenerateRequest, GenerationTask } from '@/types'

/** 触发 AI 生成（异步 202；定向/全量/智能三种触发） */
export function createGeneration(payload: GenerateRequest): Promise<GenerationTask> {
  return apiPost<GenerationTask>('/generate', payload)
}

/** 轮询生成任务状态 */
export function getGeneration(id: number): Promise<GenerationTask> {
  return apiGet<GenerationTask>(`/generate/${id}`)
}
