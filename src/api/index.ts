// Axios 统一封装。why：鉴权注入、响应解包、错误分类收敛到单一边界，
// 业务代码不裸调 axios（对应后端 RULES §9.1 的"统一封装"思想，面试防守点）。
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import router from '@/router'
import type { ApiErrorBody, ApiResponse, HealthRead } from '@/types'

/** 前端统一业务错误（携带后端 code，供页面按 code 分支） */
export class ApiRequestError extends Error {
  readonly code: string
  readonly detail: unknown

  constructor(code: string, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.detail = detail
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 15_000,
})

/** 请求拦截：存在 token 时注入 Bearer 头（/health 免鉴权，带过去后端也忽略） */
export function attachToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const userStore = useUserStore()
  if (userStore.token) {
    config.headers.set('Authorization', `Bearer ${userStore.token}`)
  }
  return config
}

/** 响应解包：ApiResponse 取 data；health 等非包装响应原样透传。
 * why：后端所有业务端点包 {code, message, data}，只有 /health 直接返回裸对象，
 * 以"是否有 code 字段"区分，避免为单个端点再开一条裸通道。
 * 泛型 T 由调用方（request<T>）指定，消除拦截器里 AxiosResponse 双断言（review L9）。 */
export function unwrapResponse<T = unknown>(response: AxiosResponse): T {
  const body = response.data
  if (body == null || typeof body !== 'object' || !('code' in body)) {
    return body as T
  }
  const res = body as ApiResponse<T>
  if (res.code !== 0) {
    throw new ApiRequestError(String(res.code), res.message || '接口返回异常')
  }
  return res.data
}

/** 状态码兜底文案（FastAPI 422 返回的是 detail 数组而非 {code,message}，故需兜底） */
function defaultMessage(status?: number): string {
  switch (status) {
    case 401:
      return '缺少或无效的访问令牌'
    case 403:
      return '令牌无效，无权访问'
    case 404:
      return '资源不存在'
    case 422:
      return '请求参数校验失败，请检查输入'
    case 429:
      return '请求过于频繁，请稍后再试'
    case 500:
      return '服务器内部错误'
    default:
      return '网络异常，请确认后端服务已启动'
  }
}

/** 优先取后端业务 message（{code, message, detail}），取不到再用兜底文案 */
function extractBizMessage(error: AxiosError): string | undefined {
  const body = error.response?.data
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as ApiErrorBody).message
    if (typeof msg === 'string' && msg) return msg
  }
  return undefined
}

/** 响应错误：401/403 清 token + 跳仪表盘引导重新配置；其余统一 toast + reject */
export function handleResponseError(error: AxiosError): Promise<never> {
  const status = error.response?.status
  const message = extractBizMessage(error) ?? defaultMessage(status)

  if (status === 401 || status === 403) {
    const userStore = useUserStore()
    if (userStore.token) userStore.clearToken()
    ElMessage.error(message)
    if (router.currentRoute.value.path !== '/dashboard') {
      void router.push({ path: '/dashboard', query: { needToken: '1' } })
    }
    return Promise.reject(new ApiRequestError(status === 401 ? 'AUTH_REQUIRED' : 'AUTH_INVALID', message))
  }

  ElMessage.error(message)
  const code = extractCode(error) ?? `HTTP_${status ?? 'NETWORK'}`
  return Promise.reject(new ApiRequestError(code, message))
}

function extractCode(error: AxiosError): string | undefined {
  const body = error.response?.data
  if (body && typeof body === 'object' && 'code' in body && typeof (body as ApiErrorBody).code === 'string') {
    return (body as ApiErrorBody).code
  }
  return undefined
}

http.interceptors.request.use(attachToken)
// 错误处理留在拦截器（跳转/toast/reject 单点）；成功解包收敛到 request<T>()——
// why：拦截器内解包后返回非 AxiosResponse 需双断言 hack（review L9），
// 移入类型化入口后 Promise<T> 由泛型推导，无任何类型断言。
http.interceptors.response.use(
  (response) => response,
  (error) => handleResponseError(error),
)

// ---------- 类型化请求快捷方法 ----------

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<unknown>(config)
  return unwrapResponse<T>(response)
}

export function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'GET', url })
}

export function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ method: 'POST', url, data })
}

export function apiPut<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ method: 'PUT', url, data })
}

export function apiDelete<T = void>(url: string): Promise<T> {
  return request<T>({ method: 'DELETE', url })
}

/** 健康检查（免鉴权，部署探针语义） */
export function getHealth(): Promise<HealthRead> {
  return apiGet<HealthRead>('/health')
}
