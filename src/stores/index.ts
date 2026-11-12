// 本项目编码格式：UTF-8（无 BOM）。
import { createPinia } from 'pinia'

// why：统一在此创建 pinia 实例，main.ts 一处安装；测试用 setActivePinia 覆盖实例。
export { createPinia }
export { useUserStore } from './user'

export default createPinia()
