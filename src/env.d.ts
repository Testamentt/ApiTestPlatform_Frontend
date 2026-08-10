/// <reference types="vite/client" />

// why：side-effect CSS 导入（element-plus/dist/index.css、styles/index.scss）
// 在 vue-tsc --noEmit 下需要通配模块声明，否则报 "cannot find module"。
declare module '*.css'
declare module '*.scss'

// 自定义 Vite 环境变量类型（与 .env.example 保持一致）
interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
