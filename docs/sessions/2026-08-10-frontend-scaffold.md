# Session 沉淀：前端 Phase 1 搭建（2026-08-10）

## 1. 当前目标

在 `frontend/` 独立仓库搭建 Vue 3 + Vite + Element Plus + Pinia + Vue Router + Axios + TypeScript 前端，交付 4 页面（仪表盘/用例管理/任务执行/AI 生成），配单元测试与构建门禁，可对后端真实联调。

## 2. 关键约束

- 独立 git 仓库，提交仅署名 Testmentt，无 AI 协作者署名（RULES §13）。
- 中文文档/回复，代码英文；注释只写 why。
- 后端已启用 Bearer 鉴权（dev token `testplatform-dev-token`），`/health` 免鉴权；CORS 白名单空 → dev 必须走 Vite 代理。
- 演示环境可能离线 → 不依赖网络字体/CDN。
- R2 测试门禁：store 持久化、axios 拦截器、路由守卫、状态标签须单测。

## 3. 已达成结论

- **脚手架**：pnpm 10.6.5（corepack 启用）、Vite 6.4、tsconfig（strict + 别名 @）、`.env.example`（VITE_API_BASE/VITE_API_TOKEN）、favicon、`dist/` 构建产物。
- **基建三件套**：
  - `api/index.ts`：axios 封装（Bearer 注入、ApiResponse 解包、401/403 清 token 跳转、业务/网络错误分类），cases/tasks/generate 类型化模块；
  - `stores/user.ts`：token localStorage 持久化，初始取 env；
  - `router/index.ts`：`authGuard` 具名导出（requiresToken 无 token 重定向仪表盘 `needToken=1` + title 同步）。
- **布局与页面**：AppLayout（墨蓝侧栏 + 顶栏健康指示 30s 轮询 + 令牌弹窗）、StatusTag（8 状态词汇）、四个页面（含任务/生成 2s 轮询、报告链接、Swagger 文档 JSON/YAML 前端预检）。
- **测试**：6 文件 40 用例全绿（拦截器 10、cases 契约 7、StatusTag 9、store 4、守卫 4、format 6）；2026-08-12 补时间补 Z 用例后 41 用例全绿。
- **门禁**：`vue-tsc --noEmit` 通过；`pnpm build` 产出 dist/（EP 拆独立 chunk）；真实后端联调通过（health/cases 列表+创建/tasks/仪表盘统计查询）。

## 4. 待解决问题

- **后端 schema 漂移（已闭环）**：2026-08-10 曾用 `ALTER TABLE test_cases ADD COLUMN trust_score ...` 无损补列；2026-08-12 后端加 `tasks.timeout_seconds` 列时已按文档流程 `scripts/reset_db.bat` 重置 dev 库（`data/` 已 gitignore，数据可丢）。
- Element Plus 全量引入 → 主包 ~1.1MB（已 manualChunks 拆 EP 独立 chunk）；按需引入留 Phase 4。
- `report_link` 的 HTML 报告依赖后端 `.workspace` 生成（best-effort）。

## 5. 下一步计划

- 分里程碑 Git 提交（脚手架 → 基建 → 布局页面 → 文档收尾）。
- 后续迭代：用例/任务页细分组件拆分、composables 抽取、生成任务历史列表。
