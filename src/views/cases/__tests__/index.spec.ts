// 本项目编码格式：UTF-8（无 BOM）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, type VNode, type VNodeChild } from 'vue'
import CasesView from '@/views/cases/index.vue'
import type { Page, TestCase } from '@/types'

// why：扣分原因是「分数可追问」的唯一出口——后端有专门的评分单测，前端这里必须证明
// 它真的被渲染出来了，否则 tooltip 写错、绑错字段、被 v-if 判空都无人发现。
const mocks = vi.hoisted(() => ({
  listCases: vi.fn(),
  confirmCase: vi.fn(),
  createCase: vi.fn(),
  updateCase: vi.fn(),
  deleteCase: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  prompt: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning,
    info: vi.fn(),
  },
  ElMessageBox: { prompt: mocks.prompt, confirm: vi.fn() },
}))

vi.mock('@/api/cases', () => ({
  listCases: mocks.listCases,
  confirmCase: mocks.confirmCase,
  createCase: mocks.createCase,
  updateCase: mocks.updateCase,
  deleteCase: mocks.deleteCase,
}))

function makeCase(over: Partial<TestCase> = {}): TestCase {
  return {
    id: 1,
    name: '获取账户-正向',
    method: 'GET',
    path: '/account/getAccount',
    operation_id: 'getAccountUsingGET',
    params: null,
    body: null,
    expected_status: 200,
    assertions: [{ path: 'status_code', op: 'eq', value: 200 }],
    status: 'draft',
    source: 'ai',
    trust_score: 90,
    quality_flags: null,
    reviewer: null,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...over,
  }
}

function pageOf(items: TestCase[]): Page<TestCase> {
  return { items, total: items.length, page: 1, page_size: 20 }
}

/**
 * 渲染真实插槽的表格桩。
 *
 * why 不能像 tasks 用例那样把 el-table 整体桩成 true：那样列插槽不会执行，
 * 单元格内容（含 tooltip）根本不进入 DOM，测不到任何东西。
 * 这里让 table 渲染每列 default 插槽，并逐列传入首行数据——只取首行足够验证渲染逻辑。
 */
const TableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      const row = (props.data as TestCase[])[0]
      if (!row) return h('div', { class: 'table-empty' })
      const columns = (slots.default?.() ?? []).filter((vnode) => vnode.props?.label)
      return h(
        'div',
        { class: 'table-stub' },
        columns.map((column, index) =>
          h(
            'div',
            { class: 'table-stub__col', 'data-label': column.props?.label, key: index },
            renderColumnSlot(column, row),
          ),
        ),
      )
    }
  },
})

/**
 * 取列插槽的 default 内容并调用。
 *
 * why 单独抽函数：`VNode.children` 是 `VNodeNormalizedChildren` 联合类型，
 * 直接在模板里断言会过不了 vue-tsc；这里收敛一次类型收窄，调用点保持干净。
 */
function renderColumnSlot(column: VNode, row: TestCase): VNodeChild[] {
  const children = column.children
  if (!children || typeof children !== 'object' || Array.isArray(children)) return []
  const named = children as Record<string, unknown>
  const slot = named.default
  if (typeof slot !== 'function') return []
  // why 包成数组：h() 的 children 参数不接受裸 null，空数组才是「无内容」的合法表达
  return [(slot as (arg: { row: TestCase }) => VNodeChild)({ row })]
}

/** tooltip 桩：把 content 插槽渲染进 DOM，default 插槽原样保留。 */
const TooltipStub = defineComponent({
  props: { disabled: { type: Boolean, default: false } },
  setup(_props, { slots }) {
    return () =>
      h('div', { class: 'tooltip-stub' }, [
        h('div', { class: 'tooltip-stub__trigger' }, slots.default?.()),
        h('div', { class: 'tooltip-stub__content' }, slots.content?.()),
      ])
  },
})

function mountView(): ReturnType<typeof mount> {
  return mount(CasesView, {
    global: {
      stubs: {
        'el-table': TableStub,
        'el-table-column': defineComponent({
          props: { label: { type: String, default: '' } },
          setup(_p, { slots }) {
            return () => h('div', slots.default?.({ row: null }))
          },
        }),
        'el-tooltip': TooltipStub,
        'el-pagination': true,
        'el-select': true,
        'el-option': true,
        'el-button': true,
        'el-input': true,
        'el-input-number': true,
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        StatusTag: true,
      },
      directives: { loading: { mounted: () => undefined } },
    },
  })
}

describe('用例列表：信任度扣分原因', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((fn) => fn.mockReset())
  })

  it('有 quality_flags 时渲染 tooltip，文案含扣分原因与分值', async () => {
    mocks.listCases.mockResolvedValue(
      pageOf([
        makeCase({
          trust_score: 70,
          quality_flags: [
            { reason: '期望状态码不在文档声明的响应码中', penalty: 20 },
            { reason: '只有状态码断言，无字段层断言', penalty: 10 },
          ],
        }),
      ]),
    )

    const view = mountView()
    await flushPromises()

    const tip = view.find('.quality-tip')
    expect(tip.exists()).toBe(true)

    // 标题给出总分：100 - 70 = 30
    expect(tip.find('.quality-tip__title').text()).toContain('共 -30 分')

    const rows = tip.findAll('.quality-tip__row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('-20')
    expect(rows[0].text()).toContain('期望状态码不在文档声明的响应码中')
    expect(rows[1].text()).toContain('-10')
    expect(rows[1].text()).toContain('只有状态码断言，无字段层断言')

    // 分数本身仍可见，并带可交互视觉线索
    expect(view.find('.num.trust.is-scored').text()).toBe('70')
  })

  it('无 quality_flags 时只渲染纯分数，不出现 tooltip 与 is-scored 标记', async () => {
    mocks.listCases.mockResolvedValue(pageOf([makeCase({ trust_score: 100, quality_flags: null })]))

    const view = mountView()
    await flushPromises()

    expect(view.find('.quality-tip').exists()).toBe(false)
    expect(view.find('.num.trust.is-scored').exists()).toBe(false)
    expect(view.find('.table-stub').text()).toContain('100')
  })

  it('quality_flags 为空数组时与 null 同效（不渲染 tooltip）', async () => {
    mocks.listCases.mockResolvedValue(
      pageOf([makeCase({ trust_score: 100, quality_flags: [] })]),
    )

    const view = mountView()
    await flushPromises()

    // why：后端可能写入空列表，v-if 必须按 length 判而非按 null 判
    expect(view.find('.quality-tip').exists()).toBe(false)
  })
})
