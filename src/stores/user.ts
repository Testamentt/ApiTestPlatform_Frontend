// 本项目编码格式：UTF-8（无 BOM）。
import { defineStore } from 'pinia'

// why：token 是唯一鉴权凭证。初始值优先取 localStorage（刷新不丢），
// 其次取 env（VITE_API_TOKEN，开箱即用 demo）；变更即同步 localStorage。
const STORAGE_KEY = 'testplatform_token'

function loadToken(): string {
  const fromStorage = localStorage.getItem(STORAGE_KEY)
  if (fromStorage) return fromStorage
  return import.meta.env.VITE_API_TOKEN ?? ''
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: loadToken(),
  }),
  getters: {
    hasToken: (state) => Boolean(state.token),
  },
  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem(STORAGE_KEY, token)
    },
    clearToken() {
      this.token = ''
      localStorage.removeItem(STORAGE_KEY)
    },
  },
})
