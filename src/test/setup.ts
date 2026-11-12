// 本项目编码格式：UTF-8（无 BOM）。
// vitest 全局环境准备。why：jsdom 已提供 localStorage/document；
// 每个用例前清空 localStorage 并禁用 VITE_API_TOKEN env 默认值，避免跨用例串扰
// （user store 初始 token 会读 env，不禁用会让"空 token"断言误失败）。
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_API_TOKEN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})
