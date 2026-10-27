import { describe, expect, it, vi } from 'vitest'

// why：验证 cases API 模块的端点契约（URL + 方法 + 参数），用 mock 替换 api/index 快捷方法，
// 不发起真实网络请求（单测不依赖外部服务）。
vi.mock('@/api/index', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

import { apiDelete, apiGet, apiPost, apiPut } from '@/api/index'
import { confirmCase, createCase, deleteCase, getCase, listCases, updateCase } from '@/api/cases'

describe('cases API 端点契约', () => {
  it('listCases 透传分页与过滤参数', () => {
    listCases({ status: 'draft', page_size: 1 })
    expect(apiGet).toHaveBeenCalledWith('/cases', { params: { status: 'draft', page_size: 1 } })
  })

  it('listCases 无过滤时只带空 params', () => {
    listCases()
    expect(apiGet).toHaveBeenCalledWith('/cases', { params: {} })
  })

  it('createCase POST /cases 且携带 operation_id', () => {
    createCase({ name: 'httpbin-get', method: 'GET', path: '/get', operation_id: 'httpbin_get' })
    expect(apiPost).toHaveBeenCalledWith('/cases', expect.objectContaining({ operation_id: 'httpbin_get' }))
  })

  it('getCase GET /cases/{id}', () => {
    getCase(3)
    expect(apiGet).toHaveBeenCalledWith('/cases/3')
  })

  it('updateCase PUT /cases/{id}', () => {
    updateCase(3, { name: 'renamed' })
    expect(apiPut).toHaveBeenCalledWith('/cases/3', { name: 'renamed' })
  })

  it('deleteCase DELETE /cases/{id}', () => {
    deleteCase(3)
    expect(apiDelete).toHaveBeenCalledWith('/cases/3')
  })

  it('confirmCase POST confirm 且携带 reviewer（人工审核闸门）', () => {
    confirmCase(3, 'alice')
    expect(apiPost).toHaveBeenCalledWith('/cases/3/confirm', { reviewer: 'alice' })
  })
})
