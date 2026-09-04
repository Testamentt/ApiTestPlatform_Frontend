<div align="center">
  <h1>智能化接口测试效能平台 · 前端</h1>

  <p>
    <a href="https://github.com/Testamentt/ApiTestPlatform_Frontend/actions/workflows/ci.yml"><img src="https://github.com/Testamentt/ApiTestPlatform_Frontend/actions/workflows/ci.yml/badge.svg" alt="Frontend CI"></a>
    <img src="https://img.shields.io/badge/Vue-3.5-42B883?style=flat-square&logo=vuedotjs&logoColor=white" alt="Vue 3">
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Element%20Plus-2.9-409EFF?style=flat-square&logo=element&logoColor=white" alt="Element Plus">
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
    <img src="https://img.shields.io/badge/Vitest-3-729B1B?style=flat-square&logo=vitest&logoColor=white" alt="Vitest">
    <img src="https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm">
  </p>

  <p>后端平台的四页管理界面：<strong>仪表盘 / 用例管理 / 任务执行 / AI 生成</strong>，与后端 Bearer 鉴权、异步任务模型严格对齐。</p>
</div>

## 项目描述

Vue 3 + TypeScript + Vite + Element Plus + Pinia 的接口测试平台前端（**独立 git 仓库**）：承接后端「生成 → 审核 → 执行 → 报告」闭环的可视化交互。后端仓库（简历主挂）：[ApiTestPlatform_Backend](https://github.com/Testamentt/ApiTestPlatform_Backend)。

## 核心亮点

- **四页闭环界面** — 仪表盘用例流水线信号轨（生成 → 审核 → 执行 → 成功）、用例管理 draft→active 人工审核、任务执行 2 s 轮询至终态 + HTML 报告抽屉、AI 生成 Swagger 导入 + 草稿审核。
- **与后端契约零漂移** — 统一响应解包、Bearer token 注入、authGuard 路由守卫；类型镜像后端 Pydantic schema，vue-tsc 构建门禁。
- **质量门禁对齐** — 41 个组件 / store 单测（Vitest + @vue/test-utils），独立 GitHub Actions CI。

## 技术栈

| 类别 | 技术 | 版本 |
|---|---|---|
| 框架 | Vue 3 | ^3.5 |
| 构建 | Vite | ^6.4 |
| UI | Element Plus | ^2.9（全量引入） |
| 状态 | Pinia | ^3.0 |
| 路由 | Vue Router | ^4.5 |
| HTTP | Axios | ^1.8 |
| 测试 | Vitest + @vue/test-utils + jsdom | ^3.1 |

包管理 **pnpm**（`packageManager: pnpm@10.6.5`）。

## 快速启动

```bash
pnpm install
pnpm dev            # http://localhost:5173（/api、/static、/docs 代理到后端 8000）
pnpm test           # 单元测试门禁
pnpm build          # vue-tsc 类型检查 + vite 构建 → dist/
```

- **访问令牌**：后端已启用 Bearer 鉴权。首次使用在顶栏「令牌」或仪表盘空态输入
  `testplatform-dev-token`（后端 dev 默认值），或写入本地 `.env` 的 `VITE_API_TOKEN`。
- **后端前置**：需先启动后端（`uvicorn app.main:app --port 8000`）。dev 走 Vite 代理同源访问，
  不依赖后端 CORS 配置。
- **被测系统**：任务执行/AI 生成演示需要后端侧被测服务（本地 mock：`python scripts/mock_target.py`；
  或管伊佳 ERP）——见 [backend README「被测系统接入」](https://github.com/Testamentt/ApiTestPlatform_Backend#被测系统接入两种形态executionbase_url-切换)。

## 页面

| 路由 | 页面 | 说明 |
|---|---|---|
| `/dashboard` | 仪表盘 | 用例流水线信号轨（生成→审核→执行→成功）、最近任务、任务状态分布、后端健康 |
| `/cases` | 用例管理 | CRUD + 人工审核 confirm（draft→active，防幻觉护栏） |
| `/tasks` | 任务执行 | 选定 active 用例异步执行，2s 轮询至终态，结果抽屉 + HTML 报告 |
| `/generate` | AI 生成 | 粘贴/上传 Swagger 文档 → LLM 生成（Celery 异步），草稿列表 + 审核激活 |

## 目录结构

```
src/
├── api/          # axios 封装（token 注入、响应解包、错误分类）+ cases/tasks/generate
├── stores/       # Pinia：user（token 持久化 localStorage）
├── router/       # 路由 + authGuard（无 token 重定向仪表盘）
├── components/common/  # AppLayout（侧栏+顶栏+健康指示+令牌配置）、StatusTag
├── views/        # dashboard / cases / tasks / generate
├── types/        # 镜像后端 Pydantic schema
├── utils/        # 时间/截断格式化
├── styles/       # 设计 token（接口信号台） + Element Plus 主题覆盖
└── test/         # vitest 全局 setup
```

## 设计系统：「接口信号台」

- 冷纸白底 `#f5f7fa` + 墨蓝侧栏 `#141b2b` + 铜色信号强调 `#e0652f`（示波器信号意象）。
- HTTP 方法色卡（GET/POST/PUT/PATCH/DELETE）与状态圆点（草稿/激活/排队/执行/成功/失败）为全局词汇。
- 等宽字体承载 path / operation_id / run_id / 时间戳；不依赖网络字体，演示可离线。
- 详细设计决策见 [docs/plans/2026-08-10-frontend-phase1.md](docs/plans/2026-08-10-frontend-phase1.md)。

## 与后端契约（镜像 docs/api.md）

- 统一响应 `{code, message, data}`；分页 `{items, total, page, page_size}`。
- 业务端点 Bearer 鉴权；`/health` 免鉴权。
- 任务/生成均异步 202 → 前端轮询至终态（状态以 DB 为单一事实源）；失败任务同输入可重试（后端 Lookup-Create 修订）。
- 报告链接 `report_link` 为 `/static/{task_id}/report.html`（后端 `/static` 只挂 `reports/` 目录），经 Vite 代理同源打开。

## 常见问题

| 现象 | 处理方式 |
| :--- | :--- |
| 接口返回 401 / 403 | 顶栏「令牌」输入 `testplatform-dev-token`（后端 dev 默认），或写入本地 `.env` 的 `VITE_API_TOKEN` |
| 页面空白 / 请求失败 | 先启动后端 `uvicorn app.main:app --port 8000`；dev 走 Vite 代理同源访问，不依赖后端 CORS |
| `pnpm install` 报版本不符 | 项目锁定 `pnpm@10.6.5`（packageManager），先 `corepack enable` 或安装对应版本 |

## 开源说明

本项目为个人独立开发的技术作品，用于学习交流与面试展示；如需复用请先提 Issue 沟通。
