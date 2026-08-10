import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized } from 'vue-router'
import { authGuard } from '@/router'
import { useUserStore } from '@/stores/user'

function makeTo(path: string, meta: Record<string, unknown> = {}): RouteLocationNormalized {
  return {
    path,
    fullPath: path,
    hash: '',
    query: {},
    params: {},
    matched: [],
    meta,
  } as unknown as RouteLocationNormalized
}

describe('authGuard（路由守卫）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('requiresToken 且无 token → 重定向仪表盘并携带 needToken 提示', () => {
    const result = authGuard(makeTo('/cases', { requiresToken: true }))
    expect(result).toEqual({ path: '/dashboard', query: { needToken: '1' } })
  })

  it('requiresToken 且有 token → 放行', () => {
    useUserStore().setToken('ok-token')
    expect(authGuard(makeTo('/cases', { requiresToken: true }))).toBe(true)
  })

  it('非 requiresToken（仪表盘）无 token 也放行', () => {
    expect(authGuard(makeTo('/dashboard', { requiresToken: false }))).toBe(true)
  })

  it('同步 document.title（含站点后缀）', () => {
    authGuard(makeTo('/cases', { requiresToken: true, title: '用例管理' }))
    expect(document.title).toBe('用例管理 · TestPlatform')
  })
})
