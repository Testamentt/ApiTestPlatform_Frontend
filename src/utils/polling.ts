// 列表轮询治理（P2-2）：可见性暂停、错误退避、会话超时、按状态收敛请求。
// why：这些规则一旦写进组件就只能靠「跑起来看」，抽成纯函数后可以逐条断言，
// 组件里只留副作用（setTimeout / 提示），规则本身不再依赖 DOM 与 Vue。
import type { TaskStatus } from '@/types'

/** 正常轮询间隔 */
export const POLL_BASE_MS = 2000
/** 退避上限：抖动期最慢 30s 一次，避免网络恢复过程中把后端打满 */
export const POLL_MAX_DELAY_MS = 30_000
/** 单轮轮询会话最长时间：后端长期卡死时不再无限请求 */
export const POLL_MAX_DURATION_MS = 30 * 60 * 1000
/** 连续失败阈值：达到即停止自动刷新，把决定权交回用户 */
export const POLL_MAX_CONSECUTIVE_ERRORS = 5

/**
 * 轮询决策结果的原因：
 * - ok       继续轮询
 * - inactive 列表里没有 pending/running 任务
 * - hidden   页面不可见（暂停，非终止）
 * - timeout  单轮会话超出时长上限
 * - errors   连续失败达到阈值
 */
export type PollDecisionReason = 'ok' | 'inactive' | 'hidden' | 'timeout' | 'errors'

export interface PollGateInput {
  /** 列表里是否存在 pending/running 任务 */
  hasActive: boolean
  /** document.hidden：页面不可见时不发请求 */
  hidden: boolean
  /** 本轮轮询会话已持续时长（不含后台暂停时间） */
  elapsedMs: number
  /** 连续失败次数（成功后由调用方清零） */
  consecutiveErrors: number
  maxMs?: number
  maxErrors?: number
}

export interface PollGateResult {
  keep: boolean
  reason: PollDecisionReason
}

/**
 * 下一次轮询的等待时长：无失败用基准间隔；连续失败按 2 的幂退避并封顶。
 * why：第 1 次失败即翻倍（2s→4s），抖动期尽早降频；超过上限后不再增长，保证恢复后仍能自愈。
 */
export function nextDelay(
  consecutiveErrors: number,
  baseMs: number = POLL_BASE_MS,
  maxMs: number = POLL_MAX_DELAY_MS,
): number {
  const errors = Number.isFinite(consecutiveErrors) ? Math.floor(consecutiveErrors) : 0
  if (errors <= 0) return baseMs
  // why：不用位运算（2 ** 32 起会溢出成负数），Math.min 顺带兜住 Infinity
  return Math.min(baseMs * 2 ** errors, maxMs)
}

/**
 * 本轮轮询是否继续，以及继续/停止的原因。
 * 判定顺序即优先级：没有活跃任务 → 页面不可见（暂停）→ 会话超时 → 连续失败超限。
 * why：hidden 放在时长/错误之前，是为了让「切后台」表现为暂停而不是终止——
 * 超时与错误只在真正发过请求后才可能累积，隐藏期间不会推进。
 */
export function shouldKeepPolling(input: PollGateInput): PollGateResult {
  const maxMs = input.maxMs ?? POLL_MAX_DURATION_MS
  const maxErrors = input.maxErrors ?? POLL_MAX_CONSECUTIVE_ERRORS
  if (!input.hasActive) return { keep: false, reason: 'inactive' }
  if (input.hidden) return { keep: false, reason: 'hidden' }
  if (input.elapsedMs >= maxMs) return { keep: false, reason: 'timeout' }
  if (input.consecutiveErrors >= maxErrors) return { keep: false, reason: 'errors' }
  return { keep: true, reason: 'ok' }
}

/** 非终态任务才会变，终态任务再拉也是浪费请求（P2-2 请求放大收敛） */
export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'pending' || status === 'running'
}

/** 列表里是否存在需要继续轮询的任务 */
export function hasActiveTasks(tasks: readonly { status: TaskStatus }[]): boolean {
  return tasks.some((task) => isActiveStatus(task.status))
}
