# 本项目编码格式：UTF-8（无 BOM）。
# 前端容器镜像：多阶段构建（Node 构建 → nginx 静态托管）。
# 与 backend/docker-compose.yml 的 api 服务同网：nginx 反向代理 /api 与 /docs 到 api:8000，
# 同源访问规避后端 CORS 白名单为空的问题（与 dev 的 Vite 代理行为一致）。
FROM node:22-alpine AS builder
WORKDIR /app

# why：pnpm 版本由 package.json 的 packageManager 字段锁定，用 corepack 激活避免版本漂移
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
# why：先只复制清单再装依赖——依赖层可被 Docker 层缓存复用，改源码不触发重装
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# VITE_API_BASE 保持 /api/v1（相对路径），由 nginx 同源代理转发，构建期无需知道后端地址
RUN pnpm build

FROM nginx:1.27-alpine
# 覆盖默认站点配置：SPA history 路由回退 + /api /docs 反代到 api 服务
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
