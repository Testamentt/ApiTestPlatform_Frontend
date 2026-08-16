# TestPlatform 前端（frontend/）

Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router 的独立前端工程（**独立 git 仓库**）。

> 前后端分离：本仓库仅含前端；后端与项目文档/规则在 [backend](../backend) 仓库（FastAPI + Celery + AI + 项目规则 `.claude/rules/RULES.md`）。

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
