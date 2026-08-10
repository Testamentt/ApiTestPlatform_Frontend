import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosHeaders, type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { ApiRequestError, attachToken, handleResponseError, unwrapResponse } from '@/api'
import { useUserStore } from '@/stores/user'

// why：拦截器依赖 ElMessage 与 router，测试中以 vi.mock 替换真实实现，避免 DOM/导航副作用
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn(), currentRoute: { value: { path: '/cases' } } },
}))

import { ElMessage } from 'element-plus'
import router from '@/router'

function makeConfig(): InternalAxiosRequestConfig {
  return { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
}

function makeError(partial: { status?: number; body?: unknown }): AxiosError {
  return {
    response:
      partial.status === undefined ? undefined : ({ status: partial.status, data: partial.body } as AxiosResponse),
  } as unknown as AxiosError
}

describe('attachToken', () => {
  it('有 token 时注入 Bearer 头', () => {
    setActivePinia(createPinia())
    useUserStore().setToken('secret')
    const config = makeConfig()
    attachToken(config)
    expect(config.headers.get('Authorization')).toBe('Bearer secret')
  })

  it('无 token 时不注入', () => {
    setActivePinia(createPinia())
    const config = makeConfig()
    attachToken(config)
    // AxiosHeaders.get 未命中时返回 undefined
    expect(config.headers.get('Authorization')).toBeUndefined()
  })
})

describe('unwrapResponse', () => {
  it('ApiResponse 成功时解包返回 data', () => {
    const response = { data: { code: 0, message: 'ok', data: { id: 1 } } } as AxiosResponse
    expect(unwrapResponse(response)).toEqual({ id: 1 })
  })

  it('非包装响应（/health 等）原样透传', () => {
    const response = { data: { status: 'ok', db: 'up', redis: 'up' } } as AxiosResponse
    expect(unwrapResponse(response)).toEqual({ status: 'ok', db: 'up', redis: 'up' })
  })

  it('业务 code!=0 抛出 ApiRequestError', () => {
    const response = { data: { code: 1, message: 'boom' } } as AxiosResponse
    expect(() => unwrapResponse(response)).toThrow(ApiRequestError)
  })
})

describe('handleResponseError', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('401 清除 token、提示并跳转仪表盘引导重新配置', async () => {
    const store = useUserStore()
    store.setToken('bad-token')
    await expect(
      handleResponseError(makeError({ status: 401, body: { code: 'AUTH_REQUIRED', message: '缺少 Bearer Token' } })),
    ).rejects.toBeInstanceOf(ApiRequestError)
    expect(store.token).toBe('')
    expect(router.push).toHaveBeenCalledWith({ path: '/dashboard', query: { needToken: '1' } })
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('403 同样清除 token 并按 AUTH_INVALID 处理', async () => {
    const store = useUserStore()
    store.setToken('bad-token')
    await expect(
      handleResponseError(makeError({ status: 403, body: { code: 'AUTH_INVALID', message: 'Token 无效' } })),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' })
    expect(store.token).toBe('')
  })

  it('业务 400 保留 token，仅提示并 reject（不跳转）', async () => {
    const store = useUserStore()
    store.setToken('good-token')
    await expect(
      handleResponseError(makeError({ status: 400, body: { code: 'DRAFT_NOT_EXECUTABLE', message: '草稿不可执行' } })),
    ).rejects.toMatchObject({ code: 'DRAFT_NOT_EXECUTABLE' })
    expect(store.token).toBe('good-token')
    expect(router.push).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalledWith('草稿不可执行')
  })

  it('网络错误（无 response）用兜底文案与 HTTP_NETWORK code', async () => {
    await expect(handleResponseError(makeError({}))).rejects.toMatchObject({ code: 'HTTP_NETWORK' })
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('422（FastAPI detail 数组，无业务 message）用状态码兜底文案', async () => {
    await expect(
      handleResponseError(makeError({ status: 422, body: { detail: [{ loc: ['body'], msg: 'field required' }] } })),
    ).rejects.toMatchObject({ code: 'HTTP_422' })
  })
})
