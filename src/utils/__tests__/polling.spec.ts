import { describe, expect, it } from 'vitest'
import {
  POLL_BASE_MS,
  POLL_MAX_CONSECUTIVE_ERRORS,
  POLL_MAX_DELAY_MS,
  POLL_MAX_DURATION_MS,
  hasActiveTasks,
  isActiveStatus,
  nextDelay,
  shouldKeepPolling,
} from '@/utils/polling'

describe('nextDelay', () => {
  it('无失败时使用基准间隔', () => {
    expect(nextDelay(0)).toBe(POLL_BASE_MS)
    expect(nextDelay(0)).toBe(2000)
  })

  it('连续失败按指数递增退避', () => {
    expect(nextDelay(1)).toBe(4000)
    expect(nextDelay(2)).toBe(8000)
    expect(nextDelay(3)).toBe(16_000)
    expect(nextDelay(1)).toBeGreaterThan(nextDelay(0))
  })

  it('退避超过上限后封顶，不再无限增长', () => {
    expect(nextDelay(4)).toBe(POLL_MAX_DELAY_MS)
    expect(nextDelay(5)).toBe(POLL_MAX_DELAY_MS)
    expect(nextDelay(50)).toBe(POLL_MAX_DELAY_MS)
    expect(nextDelay(1e6)).toBe(POLL_MAX_DELAY_MS)
  })

  it('成功后失败计数清零即复位到基准间隔', () => {
    // 模拟组件行为：连续 4 次失败已退避到上限，随后请求成功 → 计数归零
    let consecutiveErrors = 4
    expect(nextDelay(consecutiveErrors)).toBe(POLL_MAX_DELAY_MS)
    consecutiveErrors = 0
    expect(nextDelay(consecutiveErrors)).toBe(POLL_BASE_MS)
  })

  it('非法失败计数按 0 处理，不产生 NaN 延时', () => {
    expect(nextDelay(Number.NaN)).toBe(POLL_BASE_MS)
    expect(nextDelay(-3)).toBe(POLL_BASE_MS)
    expect(nextDelay(2.7)).toBe(8000)
  })

  it('基准与上限可覆盖，退避同样受上限约束', () => {
    expect(nextDelay(0, 1000, 5000)).toBe(1000)
    expect(nextDelay(1, 1000, 5000)).toBe(2000)
    expect(nextDelay(3, 1000, 5000)).toBe(5000)
    // 上限低于基准时，退避一步到位不再增长（无失败仍用基准，不参与封顶）
    expect(nextDelay(1, 1000, 500)).toBe(500)
    expect(nextDelay(9, 1000, 500)).toBe(500)
  })
})

describe('shouldKeepPolling', () => {
  const visibleOk = {
    hasActive: true,
    hidden: false,
    elapsedMs: 0,
    consecutiveErrors: 0,
  }

  it('有活跃任务且页面可见时继续轮询', () => {
    expect(shouldKeepPolling(visibleOk)).toEqual({ keep: true, reason: 'ok' })
    expect(shouldKeepPolling({ ...visibleOk, elapsedMs: 60_000, consecutiveErrors: 2 })).toEqual({
      keep: true,
      reason: 'ok',
    })
  })

  it('无 pending/running 任务时不轮询（请求放大收敛）', () => {
    expect(shouldKeepPolling({ ...visibleOk, hasActive: false })).toEqual({
      keep: false,
      reason: 'inactive',
    })
    // 无活跃任务优先于其它条件判定，避免空转
    expect(
      shouldKeepPolling({ ...visibleOk, hasActive: false, hidden: true, consecutiveErrors: 99 }).reason,
    ).toBe('inactive')
  })

  it('页面不可见时暂停轮询', () => {
    expect(shouldKeepPolling({ ...visibleOk, hidden: true })).toEqual({
      keep: false,
      reason: 'hidden',
    })
    // 隐藏优先于时长/错误判定：表现为暂停，回到前台仍可继续
    expect(
      shouldKeepPolling({
        ...visibleOk,
        hidden: true,
        elapsedMs: POLL_MAX_DURATION_MS + 1,
        consecutiveErrors: POLL_MAX_CONSECUTIVE_ERRORS,
      }).reason,
    ).toBe('hidden')
  })

  it('单轮会话达到时长上限时停止', () => {
    expect(shouldKeepPolling({ ...visibleOk, elapsedMs: POLL_MAX_DURATION_MS - 1 }).keep).toBe(true)
    expect(shouldKeepPolling({ ...visibleOk, elapsedMs: POLL_MAX_DURATION_MS })).toEqual({
      keep: false,
      reason: 'timeout',
    })
    expect(shouldKeepPolling({ ...visibleOk, elapsedMs: POLL_MAX_DURATION_MS * 2 }).reason).toBe('timeout')
  })

  it('连续失败达到阈值时停止，阈值前仍继续', () => {
    expect(
      shouldKeepPolling({ ...visibleOk, consecutiveErrors: POLL_MAX_CONSECUTIVE_ERRORS - 1 }).keep,
    ).toBe(true)
    expect(
      shouldKeepPolling({ ...visibleOk, consecutiveErrors: POLL_MAX_CONSECUTIVE_ERRORS }),
    ).toEqual({ keep: false, reason: 'errors' })
    expect(
      shouldKeepPolling({ ...visibleOk, consecutiveErrors: POLL_MAX_CONSECUTIVE_ERRORS + 3 }).reason,
    ).toBe('errors')
  })

  it('时长与错误阈值可按参数覆盖', () => {
    expect(shouldKeepPolling({ ...visibleOk, elapsedMs: 5000, maxMs: 5000 }).reason).toBe('timeout')
    expect(shouldKeepPolling({ ...visibleOk, elapsedMs: 4999, maxMs: 5000 }).keep).toBe(true)
    expect(shouldKeepPolling({ ...visibleOk, consecutiveErrors: 1, maxErrors: 1 }).reason).toBe('errors')
    expect(shouldKeepPolling({ ...visibleOk, consecutiveErrors: 1, maxErrors: 3 }).keep).toBe(true)
  })
})

describe('isActiveStatus / hasActiveTasks', () => {
  it('仅 pending / running 视为活跃状态', () => {
    expect(isActiveStatus('pending')).toBe(true)
    expect(isActiveStatus('running')).toBe(true)
    expect(isActiveStatus('success')).toBe(false)
    expect(isActiveStatus('failed')).toBe(false)
  })

  it('按列表内容判断是否需要轮询', () => {
    expect(hasActiveTasks([])).toBe(false)
    expect(hasActiveTasks([{ status: 'success' }, { status: 'failed' }])).toBe(false)
    expect(hasActiveTasks([{ status: 'success' }, { status: 'running' }])).toBe(true)
    expect(hasActiveTasks([{ status: 'pending' }])).toBe(true)
  })
})
