import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'

const STORAGE_KEY = 'testplatform_token'

describe('useUserStore（token 持久化）', () => {
  it('初始无 token 时 hasToken=false', () => {
    setActivePinia(createPinia())
    const store = useUserStore()
    expect(store.token).toBe('')
    expect(store.hasToken).toBe(false)
  })

  it('setToken 写入 store 并持久化到 localStorage', () => {
    setActivePinia(createPinia())
    const store = useUserStore()
    store.setToken('secret-token')
    expect(store.token).toBe('secret-token')
    expect(store.hasToken).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('secret-token')
  })

  it('clearToken 同时清除 store 与 localStorage', () => {
    setActivePinia(createPinia())
    const store = useUserStore()
    store.setToken('secret-token')
    store.clearToken()
    expect(store.token).toBe('')
    expect(store.hasToken).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('刷新场景：重建 store 从 localStorage 恢复 token', () => {
    localStorage.setItem(STORAGE_KEY, 'persisted-token')
    setActivePinia(createPinia())
    const store = useUserStore()
    expect(store.token).toBe('persisted-token')
    expect(store.hasToken).toBe(true)
  })
})
