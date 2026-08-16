# 前端 Phase 1 搭建计划（2026-08-10）

> 计划先行（RULES §17.1 R1）：本文沉淀目标、涉及文件、方案、影响面，落地后经 Git 里程碑提交。

## 1. 当前目标

在 `frontend/`（独立 git 仓库，当前仅有占位 README）搭建 Vue 3 + Vite + Element Plus + Pinia + Vue Router + Axios + TypeScript 前端骨架，交付 4 个页面：仪表盘 / 用例管理 / 任务执行 / AI 生成。**面试导向**：约 15 个硬通货文件 + 单元测试 + 构建门禁，可运行、可演示、可讲清楚。

## 2. 关键约束

- **前端仓库独立 git**，提交只保留用户本人署名 Testmentt，禁止 AI 协作者署名（RULES §13）。
- 中文回复与文档；代码/标识符/路径保持英文（[[use-chinese-replies]]）。
- 后端 Phase 4 已启用 Bearer Token 鉴权（除 `/health`）；dev token 默认 `testplatform-dev-token`（`security.api_token`）。
- 后端 CORS 白名单默认空（不发 CORS 头）→ 前端 dev 必须走 **Vite 代理**（`/api`、`/static` → `127.0.0.1:8000`），不改后端。
- API 契约（后端 `docs/api.md` + `app/schemas/*`）：统一响应 `{code, message, data}`；分页 `{items,total,page,page_size}`；状态枚举 draft/active/archived + pending/running/success/failed；`report_link=/static/{task_id}/report.html`（后端 `/static` 只挂 `reports/`，2026-08-12 review H2 修订）。
- 演示环境可能离线 → **不依赖网络字体/CDN**，用系统字体栈 + 等宽字体栈承载数据标识符。
- R2 测试门禁：核心逻辑（store 持久化、axios 拦截器、守卫、状态标签）必须配单元测试。

## 3. 已达成结论（方案）

### 3.1 技术栈（用户给定，微调锁定）
| 类别 | 技术 | 版本 |
|---|---|---|
| 框架 | Vue 3 | ^3.5.13 |
| 构建 | Vite | ^6.2.4 |
| UI | Element Plus | ^2.9.7（全量引入，不配 unplugin 自动导入，MVP 面试够用） |
| 状态 | Pinia | ^3.0.2 |
| 路由 | Vue Router | ^4.5.0 |
| HTTP | Axios | ^1.8.4 |
| 类型 | TypeScript | ~5.8.2 |
| 测试 | Vitest + @vue/test-utils + jsdom | vitest ^3.1.1 |
| 额外 | js-yaml ^4.1.0（前端解析 YAML Swagger 文档） | |

包管理 pnpm ^10.6.5（本机未装，corepack/npm 全局安装启用）。

### 3.2 目录（用户指定极简结构 + 必要补充）
```
frontend/
├── index.html  package.json  vite.config.ts
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json  env.d.ts
├── .env.example  .env(忽略)  .gitignore
├── public/favicon.svg
├── docs/plans/  docs/sessions/          # 文档沉淀（§18）
├── src/
│   ├── main.ts  App.vue  styles/index.scss
│   ├── types/index.ts                    # 镜像后端 schema（面试硬通货，不做 any）
│   ├── api/index.ts | cases.ts | tasks.ts | generate.ts
│   ├── stores/index.ts | user.ts         # token 持久化（localStorage）
│   ├── router/index.ts                   # 守卫：token 缺失重定向 + 标题同步
│   ├── components/common/AppLayout.vue | StatusTag.vue
│   ├── views/dashboard|cases|tasks|generate/index.vue
│   └── <模块>/__tests__/*.spec.ts        # 单元测试（与代码同批提交）
```

### 3.3 关键设计决策
- **Axios 拦截器**：请求注入 `Authorization: Bearer`；响应解包 `data`（code≠0 抛错）；401/403 清 token + 提示 + 跳仪表盘；网络/5xx 统一提示。
- **Token 管理**：store 初始值取 `import.meta.env.VITE_API_TOKEN`，可改/清，localStorage 持久化；顶栏弹窗配置（不单独做登录页，保持 4 页面）。
- **路由守卫**：`meta.requiresToken`（cases/tasks/generate=true）；token 缺失重定向 `/dashboard?needToken=1`；同步 `document.title`。
- **任务轮询**：tasks/generate 页面 2s 轮询运行中任务至终态（对应用内全局定时器，离开页面清理）。
- **报告链接**：`report_link` 为 `/static/...` 相对路径，dev 经 Vite 代理直开新标签。

### 3.4 视觉方向（frontend-design skill）
- 主题：**「接口信号台」**——冷纸白底 `#f5f7fa` + 墨蓝侧栏 `#141b2b` + **铜色信号强调 `#e0652f`**（示波器信号意象，避开模板化的酸绿/陶土/报纸风）。HTTP 方法色卡（GET 绿 / POST 蓝 / PUT 琥珀 / PATCH 紫 / DELETE 红）作为全局词汇。
- 字体：系统 UI 栈（Segoe UI + Microsoft YaHei）；**等宽栈（Consolas/Cascadia）承载 path/operation_id/run_id/时间戳**，数字 `tabular-nums`。
- 签名元素：仪表盘顶部 **「流水线信号轨」**——生成→审核→执行→成功 四节点由带流动脉冲的虚线相连，节点内嵌实时计数（数据全部来自真实 API），替代模板化的"大数字卡片"。其余页面保持克制的表格 + 方法色签 + 等宽端点。

### 3.5 里程碑与 Git 提交（Conventional Commits，无 AI 署名）
1. `chore: 初始化前端工程脚手架（Vite+Vue3+TS+EP 配置与依赖）`
2. `feat: 实现前端基建（类型/axios 拦截器/pinia 持久化/路由守卫/样式 token）`
3. `feat: 实现布局与四个页面（仪表盘/用例/任务/AI 生成）`
4. `test: 补充核心逻辑单元测试并全绿`

## 4. 待解决问题
- 后端当前是否有任务数据可供演示（空库时页面需有优雅空态）；`/health` 是否随后端启动。
- YAML Swagger 文档的解析边界（前端仅做转换与大小预检，最终合法性校验在后端）。

## 5. 下一步计划
1. 启用 pnpm → 写脚手架配置 → 安装依赖。
2. 基建三件套 + 类型 + 样式 token。
3. AppLayout/StatusTag + 4 页面。
4. 单元测试。
5. `pnpm build` + `pnpm test` 门禁全绿 → 里程碑提交 → README/session 更新。
