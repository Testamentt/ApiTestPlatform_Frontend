// 用例 API（对齐 backend/app/api/v1/cases.py）
import { apiDelete, apiGet, apiPost, apiPut } from './index'
import type {
  CaseCreate,
  CaseUpdate,
  ConfirmResult,
  ListCasesParams,
  Page,
  TestCase,
} from '@/types'

/** 用例列表（分页 + status/method/keyword 过滤） */
export function listCases(params: ListCasesParams = {}): Promise<Page<TestCase>> {
  return apiGet<Page<TestCase>>('/cases', { params })
}

/** 创建用例（operation_id 必填，status 恒为 draft） */
export function createCase(payload: CaseCreate): Promise<TestCase> {
  return apiPost<TestCase>('/cases', payload)
}

export function getCase(id: number): Promise<TestCase> {
  return apiGet<TestCase>(`/cases/${id}`)
}

export function updateCase(id: number, payload: CaseUpdate): Promise<TestCase> {
  return apiPut<TestCase>(`/cases/${id}`, payload)
}

/** 物理删除（204 无响应体） */
export function deleteCase(id: number): Promise<void> {
  return apiDelete(`/cases/${id}`)
}

/** 人工审核 draft→active（防幻觉护栏：仅人工路径可置 active） */
export function confirmCase(id: number, reviewer: string): Promise<ConfirmResult> {
  return apiPost<ConfirmResult>(`/cases/${id}/confirm`, { reviewer })
}
