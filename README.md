# TestPlatform 前端（frontend/）

Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router 的独立前端工程（**独立 git 仓库**）。

> 前后端分离：本仓库仅含前端；后端与项目文档/规则在 [backend](../backend) 仓库（FastAPI + Celery + AI + 项目规则 `.claude/rules/RULES.md`）。

## 当前状态

- 处于 **Phase 0 文档沉淀阶段**，本仓库为占位结构；Vue 脚手架在 Phase 1 创建。
- 通信约定：开发走 Vite 代理（5173 → 8000，见后端 `config/settings.example.yaml` 的 `frontend` 段）；生产由 FastAPI 静态托管 `dist` 或 nginx。
- REST API 契约见后端仓库 [docs/api.md](../backend/docs/api.md)。

## 目录结构（Phase 1 落地）

```
frontend/
├── src/
│   ├── api/          # 类型化 API 客户端（axios 实例 + 拦截器注入 Bearer Token）
│   ├── views/        # 页面：用例管理 / 任务看板 / draft 审核 / 影响分析
│   ├── stores/       # Pinia（token、任务轮询状态）
│   ├── router/       # Vue Router
│   └── main.ts
├── vite.config.ts    # server.proxy /api → http://127.0.0.1:8000
├── package.json
└── index.html
```
