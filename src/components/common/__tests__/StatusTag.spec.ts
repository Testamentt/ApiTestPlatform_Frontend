// 本项目编码格式：UTF-8（无 BOM）。
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusTag from '@/components/common/StatusTag.vue'

describe('StatusTag 状态词汇', () => {
  it.each([
    ['draft', '草稿'],
    ['active', '已激活'],
    ['archived', '已归档'],
    ['pending', '排队中'],
    ['running', '执行中'],
    ['success', '成功'],
    ['failed', '失败'],
    ['skipped', '跳过'],
  ])('status=%s 渲染「%s」并带对应样式类', (status, label) => {
    const wrapper = mount(StatusTag, { props: { status } })
    expect(wrapper.text()).toContain(label)
    expect(wrapper.classes()).toContain(`status-tag--${status}`)
  })

  it('未知状态原样展示（保留基础类）', () => {
    const wrapper = mount(StatusTag, { props: { status: 'unknown-thing' } })
    expect(wrapper.text()).toContain('unknown-thing')
    expect(wrapper.classes()).toContain('status-tag')
  })
})
