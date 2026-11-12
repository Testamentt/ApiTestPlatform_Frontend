<!-- 本项目编码格式：UTF-8（无 BOM）。 -->
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

  <p>后端平台的四页管理界面：<strong>仪表盘 / 用例管理 / 任务执行 / AI 生成</strong>，与后端 Bearer 鉴权、异步任务模型保持一致。</p>
</div>

> 定位：前端项目入口：四页功能、技术栈、本地与容器化启动、与后端的接口契约。
> 事实源：`package.json`、`src/`、`vite.config.ts`、`Dockerfile`、`deploy/nginx.conf` ｜ 最后核对：2026-11-12

## 1. 项目描述

Vue 3 + TypeScript + Vite + Element Plus + Pinia 的接口测试平台前端（独立 git 仓库），承接后端「生成 → 审核 → 执行 → 报告」流程的可视化交互。后端仓库：[ApiTestPlatform_Backend](https://github.com/Testamentt/ApiTestPlatform_Backend)。

## 2. 功能要点

- 四页管理界面：仪表盘、用例管理、任务执行、AI 生成。
- 仪表盘：用例流水线信号轨（生成 → 审核 → 执行 → 成功）、最近任务、任务状态分布、后端健康探针。
- 任务执行：轮询至终态，结果抽屉 + 带鉴权报告；`pending` 与 `running` 均可取消（对 `running` 后端会先杀 pytest 进程树，确认框文案按后果区分）、`failed` 可人工重试。
- AI 生成：粘贴/上传 Swagger 文档 → 异步生成 → 草稿审核激活；「0 草稿」不按成功处理，给 warning 并展开「跳过/被拒明细」（`skipped_detail` / `rejected_detail`），能逐条看到被跳过的 operation_id 与拒绝原因。
- 契约对齐：统一响应解包、Bearer token 注入、authGuard 路由守卫、类型对齐后端 Pydantic schema，`vue-tsc` 参与构建门禁；`active` 用例内容变更被后端语义闸降级回 `draft` 时，界面提示需重新审核。
- 轮询治理：`src/utils/polling.ts` 是纯函数（基准 2 s；页面隐藏暂停；连续失败按 2 s→4 s→…→30 s 退避；连续 5 次失败停止并提示手动刷新；单会话 30 min，只累计可见时间），组件只做接线。
- 质量门禁：9 个 `__tests__` 文件、64 个组件 / store / 工具 / API 契约单测（Vitest + @vue/test-utils + jsdom）；CI 用 `pnpm run test:ci` 产出 `reports/junit.xml`，逐用例结果发 Checks / PR 注释并归档 14 天。

## 3. 技术栈

| 类别 | 技术 | 版本 |
| :--- | :--- | :--- |
| 框架 | Vue 3 | ^3.5 |
| 构建 | Vite | ^6.2.4（lockfile 解析到 6.4.x） |
| UI | Element Plus | ^2.9（全量引入） |
| 状态 | Pinia | ^3.0 |
| 路由 | Vue Router | ^4.5 |
| HTTP | Axios | ^1.8 |
| 测试 | Vitest + @vue/test-utils + jsdom | ^3.1 |

包管理 **pnpm**（`packageManager: pnpm@10.6.5`）。

## 4. 快速启动

```bash
pnpm install
pnpm dev            # http://localhost:5173（/api、/docs 代理到后端 8000）
pnpm test           # 单元测试门禁：64 用例（9 文件），不落文件
pnpm run test:ci    # CI 同款：额外产出 reports/junit.xml（JUnit XML，已 gitignore）
pnpm build          # vue-tsc 类型检查 + vite 构建 → dist/
```

- **访问令牌**：后端已启用 Bearer 鉴权。首次使用在顶栏「令牌」或仪表盘空态输入
  `testplatform-dev-token`（后端 dev 默认值），或写入本地 `.env` 的 `VITE_API_TOKEN`。
- **后端前置**：需先启动后端（`uvicorn app.main:app --port 8000`）。dev 走 Vite 代理同源访问，
  不依赖后端 CORS 配置。
- **被测系统**：任务执行 / AI 生成需要后端侧的被测服务（本地 mock：`python scripts/mock_target.py`；
  或管伊佳 ERP）。接入方式见 [backend README](https://github.com/Testamentt/ApiTestPlatform_Backend)。

## 5. 容器化部署

前端镜像由**后端仓库的 compose** 以 `frontend` profile 提供：compose 文件属于 backend 仓，本仓只提供 `Dockerfile`、`.dockerignore`、`deploy/nginx.conf`。这样只 clone 后端的人执行 `docker compose up --build` 不会因缺 `../frontend` 直接失败。

### 镜像构成

- `Dockerfile`：两阶段。`node:22-alpine` 里用 corepack 固定 `pnpm@10.6.5`，先 COPY `package.json` + `pnpm-lock.yaml` 装依赖（改源码不触发重装），再 COPY 源码执行 `pnpm build`；`dist/` 复制进 `nginx:1.27-alpine`，`EXPOSE 80`。
- `.dockerignore`：排除 `node_modules`、`dist`、`reports`、`coverage`、`.git`、`.env*`（保留 `.env.example`）、日志与编辑器目录，构建上下文只留源码与依赖清单。
- `deploy/nginx.conf`：覆盖镜像默认站点配置，见下表。

构建期不需要知道后端地址：`VITE_API_BASE` 保持相对路径 `/api/v1`（`src/api/index.ts` 的默认值），由 nginx 同源转发。

### nginx 站点配置（`deploy/nginx.conf`）

| 行为 | 配置 | 目的 |
| :--- | :--- | :--- |
| 监听与静态托管 | `listen 80`、`root /usr/share/nginx/html`、`index index.html` | 托管 `dist/` 产物 |
| SPA 回退 | `try_files $uri $uri/ /index.html` | history 路由直接刷新 `/cases`、`/tasks` 不会 404 |
| 长缓存 | `location /assets/`：`expires 1y` + `immutable` | 带 hash 的产物文件名变即失效 |
| API 反代 | `location /api/` → `http://api:8000`，`proxy_read_timeout 600s` | 报告下载与 AI 生成耗时较长；同源访问规避后端空 CORS 白名单 |
| 其余同源路径 | `/docs`、`/openapi.json`、`/health` → `http://api:8000` | Swagger 与健康探针在 8080 上同样可达 |
| 上游重解析 | `resolver 127.0.0.11 valid=10s` + `set $api_upstream` | 写死 `proxy_pass http://api:8000` 只在启动时解析一次，`api` 容器重建换 IP 后会 502 |

### 启动与验证

```bash
# 目录结构要求：<某目录>/backend 与 <某目录>/frontend 同级，且前端目录名必须是 frontend
cd <某目录>/backend
docker compose --profile frontend up --build
```

- 访问 `http://127.0.0.1:8080`：四页界面；接口同源走 `/api/v1`，Swagger 在 `http://127.0.0.1:8080/docs`。
- 首次打开仍需在顶栏「令牌」输入后端 token（默认 `testplatform-dev-token`），镜像不内置凭据。
- 下掉：`docker compose --profile frontend down`（`down` 默认不清理 profile 服务）。
- 只看后端时不需要本仓：`web` 服务在 `frontend` profile 内，默认 `docker compose up --build` 只起后端 5 个服务（`api`/`worker`/`beat`/`redis`/`mock`）。

与 dev 的差别只在托管方式：dev 是 Vite `:5173` 带代理，容器是 nginx `:8080` 反代；两者都是同源访问，`/api`、`/docs` 行为一致。

## 6. 页面

| 路由 | 页面 | 说明 |
| :--- | :--- | :--- |
| `/dashboard` | 仪表盘 | 用例流水线信号轨（生成→审核→执行→成功）、最近任务、任务状态分布、后端健康 |
| `/cases` | 用例管理 | CRUD + 人工审核 confirm（draft→active，防幻觉护栏）；`active` 用例内容变更被语义闸降级时提示重新审核 |
| `/tasks` | 任务执行 | 选定 active 用例异步执行，轮询至终态（可见性暂停 / 错误退避 / 30 min 上限），结果抽屉 + 带鉴权报告；`pending` 与 `running` 均可取消、`failed` 可重试 |
| `/generate` | AI 生成 | 粘贴/上传 Swagger 文档 → LLM 生成（Celery 异步），草稿列表 + 审核激活；0 草稿时 warning + 「跳过/被拒明细」 |

## 7. 目录结构

```text
src/
├── api/          # axios 封装（token 注入、响应解包、错误分类）+ cases/tasks/generate
├── stores/       # Pinia：user（token 持久化 localStorage）
├── router/       # 路由 + authGuard（无 token 重定向仪表盘）
├── components/common/  # AppLayout（侧栏+顶栏+健康指示+令牌配置）、StatusTag
├── views/        # dashboard / cases / tasks / generate
├── types/        # 类型对齐后端 Pydantic schema
├── utils/        # polling（轮询策略纯函数）、时间/截断格式化
├── styles/       # 设计 token（接口信号台） + Element Plus 主题覆盖
└── test/         # vitest 全局 setup（用例在 src/**/__tests__/：9 文件 64 用例）

# 以下是仓库根目录里与容器化部署相关的文件
deploy/nginx.conf  # 容器站点配置：静态托管 + SPA 回退 + /api、/docs 反代到 api:8000
Dockerfile         # 两阶段镜像：Node 构建 → nginx 托管 dist
.dockerignore      # 构建上下文排除 node_modules / dist / reports / .env*
```

## 8. 设计系统：「接口信号台」

- 冷纸白底 `#f5f7fa` + 墨蓝侧栏 `#141b2b` + 铜色信号强调 `#e0652f`（示波器信号意象）。
- HTTP 方法色卡（GET/POST/PUT/PATCH/DELETE）与状态圆点（草稿/激活/排队/执行/成功/失败）为全局词汇。
- 等宽字体承载 path / operation_id / run_id / 时间戳；不依赖网络字体，可离线运行。

## 9. 与后端契约（对齐 docs/api.md）

- 统一响应 `{code, message, data}`；分页 `{items, total, page, page_size}`。
- 业务端点 Bearer 鉴权；`/health` 免鉴权。
- 任务/生成均异步 202 → 前端轮询至终态（状态以 DB 为单一事实源）；失败任务同输入可重试（后端 Lookup-Create 修订）。
- 报告链接 `report_link` 为 `/api/v1/tasks/{task_id}/report`（**带鉴权**读取报告原文，后端无鉴权 `/static` 面已摘除）；前端用 axios 带 token 取回 HTML 后以 blob 新标签打开（`window.open` 无法携带 Authorization 头）。
- 任务操作：`pending` 与 `running` 均可取消（`POST /tasks/{id}/cancel`；后端对 `running` 会先杀 pytest 进程树，前端确认框文案随之区分）、`failed` 可人工重试（`POST /tasks/{id}/retry`）；用例 `active` 后内容一旦变更会被后端降级回 `draft`（语义闸），界面提示需重新审核。
- 列表轮询策略（`src/utils/polling.ts` 纯函数，可单测）：基准 2 s；页面隐藏即暂停、回到前台立即刷新一次；连续失败按 2 s→4 s→…→30 s 退避，达 5 次停止并提示手动刷新；单次会话最长 30 min（只累计可见时间）。
- 容器形态与 dev 形态对后端的调用一致（同源 `/api/v1`），差别只在托管：dev 用 Vite 代理，容器用 nginx 反代（见 §5）。

## 10. 常见问题

| 现象 | 处理方式 |
| :--- | :--- |
| 接口返回 401 / 403 | 顶栏「令牌」输入 `testplatform-dev-token`（后端 dev 默认），或写入本地 `.env` 的 `VITE_API_TOKEN` |
| 页面空白 / 请求失败 | 先启动后端 `uvicorn app.main:app --port 8000`；dev 走 Vite 代理同源访问，不依赖后端 CORS |
| `pnpm install` 报版本不符 | 项目锁定 `pnpm@10.6.5`（packageManager），先 `corepack enable` 或安装对应版本 |
| 刷新 `/cases`、`/tasks` 返回 404 | 容器内 nginx 已配 SPA 回退（`try_files $uri $uri/ /index.html`）；自建 nginx 需照抄 `deploy/nginx.conf` |
| 页面能开但接口 502 | nginx 反代目标是 compose 服务名 `api:8000`，只在该 compose 网络内可达；单独跑本镜像、不接后端时 `/api` 必然 502 |
| `docker compose --profile frontend up` 报路径不存在 | compose 在 backend 仓，`web` 服务 `build: ../frontend`：本仓需 clone 到与 backend 同级的 `../frontend`，目录名必须是 `frontend` |

## 11. 协作与许可

本项目由个人维护，以开源方式提供：后端与前端是两个独立仓库，各自 CI、各自提交。

- 缺陷与建议走 Issue（页面与交互提本仓，接口语义提后端仓库）；补丁走 PR，需通过 `pnpm test`、`pnpm run test:ci` 与 `pnpm build`。
- 复用前请先开 Issue 说明用途与预期维护方式；仓库未单列 LICENSE 文件，授权范围与维护边界需逐例确认。

## 12. 相关文档

- 后端项目入口：[ApiTestPlatform_Backend README](https://github.com/Testamentt/ApiTestPlatform_Backend)
- 后端接口契约：[docs/api.md](https://github.com/Testamentt/ApiTestPlatform_Backend/blob/master/docs/api.md)（端点总表 + 错误码表）
- 后端容器编排：[docker-compose.yml](https://github.com/Testamentt/ApiTestPlatform_Backend/blob/master/docker-compose.yml)（`frontend` profile 的 `web` 服务在此定义）
- 后端 CI 与报告：[Jenkinsfile](https://github.com/Testamentt/ApiTestPlatform_Backend/blob/master/Jenkinsfile)（声明式流水线，JUnit / coverage / Allure 报告与归档）
