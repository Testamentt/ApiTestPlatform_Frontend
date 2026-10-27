import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TasksView from '@/views/tasks/index.vue'
import type { Page, Task } from '@/types'

// why：退避/暂停/止损的规则在 @/utils/polling 里单测（polling.spec.ts），
// 这里只验证「接线」——组件是否真的按决策结果暂停、退避、停止并发提示。
const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getTaskResults: vi.fn(),
  createTask: vi.fn(),
  cancelTask: vi.fn(),
  retryTask: vi.fn(),
  listCases: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: mocks.warning,
    success: mocks.success,
    info: mocks.info,
    error: vi.fn(),
  },
  ElMessageBox: { confirm: mocks.confirm },
}))

vi.mock('@/api/tasks', () => ({
  listTasks: mocks.listTasks,
  getTaskResults: mocks.getTaskResults,
  createTask: mocks.createTask,
  cancelTask: mocks.cancelTask,
  retryTask: mocks.retryTask,
}))

vi.mock('@/api/cases', () => ({ listCases: mocks.listCases }))

function makeTask(status: Task['status'], id = 1): Task {
  return {
    id,
    run_id: `run-${id}`,
    case_ids: [1],
    timeout_seconds: 300,
    status,
    pid: null,
    celery_task_id: null,
    error_stage: null,
    error_msg: null,
    started_at: null,
    finished_at: null,
    result_summary: null,
    report_link: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  }
}

function pageOf(items: Task[]): Page<Task> {
  return { items, total: items.length, page: 1, page_size: 20 }
}

// Element Plus 组件与指令在单测里无全局注册，直接桩掉；插槽不渲染，避免依赖真实表格实现
const STUBS = {
  'el-table': true,
  'el-table-column': true,
  'el-pagination': true,
  'el-select': true,
  'el-option': true,
  'el-button': true,
  'el-dialog': true,
  'el-form': true,
  'el-form-item': true,
  'el-input-number': true,
  'el-drawer': true,
  StatusTag: true,
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

function fireVisibilityChange(): void {
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('任务列表轮询接线', () => {
  let wrapper: ReturnType<typeof mount> | undefined

  function mountView(): ReturnType<typeof mount> {
    wrapper = mount(TasksView, {
      global: { stubs: STUBS, directives: { loading: { mounted: () => undefined } } },
    })
    return wrapper
  }

  beforeEach(() => {
    vi.useFakeTimers()
    setDocumentHidden(false)
    Object.values(mocks).forEach((fn) => fn.mockReset())
    mocks.listCases.mockResolvedValue(pageOf([]))
  })

  afterEach(() => {
    // why：监听器挂在 document 上，不卸载会串到下一个用例
    wrapper?.unmount()
    wrapper = undefined
    setDocumentHidden(false)
    vi.useRealTimers()
  })

  it('有 pending/running 时按基准间隔轮询，全部终结后停止且不再请求', async () => {
    mocks.listTasks
      .mockResolvedValueOnce(pageOf([makeTask('running')]))
      .mockResolvedValue(pageOf([makeTask('success')]))

    const view = mountView()
    await flushPromises()
    expect(mocks.listTasks).toHaveBeenCalledTimes(1)
    expect(view.find('.filters__hint').text()).toContain('有任务执行中，每 2s 自动刷新')

    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.listTasks).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.listTasks).toHaveBeenCalledTimes(2)
    expect(view.find('.filters__hint').exists()).toBe(false)
  })

  it('无 pending/running 任务时完全不轮询', async () => {
    mocks.listTasks.mockResolvedValue(pageOf([makeTask('success'), makeTask('failed', 2)]))

    const view = mountView()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(mocks.listTasks).toHaveBeenCalledTimes(1)
    expect(view.find('.filters__hint').exists()).toBe(false)
  })

  it('连续失败按指数退避，达到阈值后停止并提示手动刷新', async () => {
    const firedAt: number[] = []
    mocks.listTasks.mockResolvedValueOnce(pageOf([makeTask('running')])).mockImplementation(() => {
      firedAt.push(Date.now())
      return Promise.reject(new Error('boom'))
    })

    const view = mountView()
    const mountedAt = Date.now()
    await flushPromises()
    expect(mocks.listTasks).toHaveBeenCalledTimes(1)

    // 足够长的推进窗口：5 次失败（阈值）+ 之后的静默期一次性跑完
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(firedAt).toHaveLength(5) // 阈值 5：第 5 次失败后不再发起
    expect(firedAt[0] - mountedAt).toBeGreaterThanOrEqual(2000)
    expect([
      firedAt[1] - firedAt[0],
      firedAt[2] - firedAt[1],
      firedAt[3] - firedAt[2],
      firedAt[4] - firedAt[3],
    ]).toEqual([4000, 8000, 16_000, 30_000]) // 指数退避且 30s 封顶

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(mocks.listTasks).toHaveBeenCalledTimes(6)
    expect(mocks.warning).toHaveBeenCalledTimes(1)
    expect(view.find('.filters__hint').text()).toContain('自动刷新已停止')
  })

  it('页面不可见时暂停轮询，回到可见立即刷新一次并恢复轮询', async () => {
    mocks.listTasks.mockResolvedValue(pageOf([makeTask('pending')]))

    const view = mountView()
    await flushPromises()
    expect(mocks.listTasks).toHaveBeenCalledTimes(1)

    setDocumentHidden(true)
    fireVisibilityChange()
    await flushPromises()
    expect(view.find('.filters__hint').text()).toContain('已暂停')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.listTasks).toHaveBeenCalledTimes(1) // 后台期间不发请求

    setDocumentHidden(false)
    fireVisibilityChange()
    await flushPromises()
    expect(mocks.listTasks).toHaveBeenCalledTimes(2) // 回前台立即补一次

    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.listTasks).toHaveBeenCalledTimes(3) // 轮询已恢复
  })
})
