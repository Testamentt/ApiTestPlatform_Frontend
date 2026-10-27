import { describe, expect, it, vi } from 'vitest'

// why：验证 tasks API 模块的端点契约（URL + 方法），mock 掉 api/index 快捷方法，不发真实请求。
vi.mock('@/api/index', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

import { apiGet, apiPost } from '@/api/index'
import { cancelTask, createTask, getTaskResults, listTasks, retryTask } from '@/api/tasks'

describe('tasks API 端点契约', () => {
  it('createTask POST /tasks 携带 case_ids', () => {
    createTask({ case_ids: [1, 2], timeout_seconds: 120 })
    expect(apiPost).toHaveBeenCalledWith('/tasks', { case_ids: [1, 2], timeout_seconds: 120 })
  })

  it('listTasks 透传分页与状态过滤', () => {
    listTasks({ page: 1, page_size: 20, status: 'failed' })
    expect(apiGet).toHaveBeenCalledWith('/tasks', {
      params: { page: 1, page_size: 20, status: 'failed' },
    })
  })

  it('getTaskResults GET /tasks/{id}/results', () => {
    getTaskResults(7)
    expect(apiGet).toHaveBeenCalledWith('/tasks/7/results')
  })

  it('cancelTask POST /tasks/{id}/cancel（pending 孤儿的出口）', () => {
    cancelTask(7)
    expect(apiPost).toHaveBeenCalledWith('/tasks/7/cancel')
  })

  it('retryTask POST /tasks/{id}/retry（失败任务人工重跑）', () => {
    retryTask(7)
    expect(apiPost).toHaveBeenCalledWith('/tasks/7/retry')
  })
})
