// 本项目编码格式：UTF-8（无 BOM）。
import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteLocationRaw, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

// why：MVP 无登录页，全部业务路由 requiresToken；
// 仪表盘免 token（/health 公开，且承担"配置令牌"落地页职责）。
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { title: '仪表盘', requiresToken: false },
  },
  {
    path: '/cases',
    name: 'cases',
    component: () => import('@/views/cases/index.vue'),
    meta: { title: '用例管理', requiresToken: true },
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('@/views/tasks/index.vue'),
    meta: { title: '任务执行', requiresToken: true },
  },
  {
    path: '/generate',
    name: 'generate',
    component: () => import('@/views/generate/index.vue'),
    meta: { title: 'AI 生成', requiresToken: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// why：守卫做两件事——①requiresToken 路由无 token 时重定向仪表盘并带 needToken 提示参数
// （状态由 UI 承接而非守卫弹 toast，减少命令式副作用、守卫可单测）；②同步 document.title。
// 抽成具名导出便于单元测试（守卫是纯函数，入参 to、出参重定向目标）。
export function authGuard(to: RouteLocationNormalized): RouteLocationRaw | boolean {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · TestPlatform` : 'TestPlatform'

  if (to.meta.requiresToken) {
    const userStore = useUserStore()
    if (!userStore.token) {
      return { path: '/dashboard', query: { needToken: '1' } }
    }
  }
  return true
}

router.beforeEach(authGuard)

export default router
