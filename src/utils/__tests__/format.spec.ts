// 本项目编码格式：UTF-8（无 BOM）。
import { describe, expect, it } from 'vitest'
import { formatDateTime, formatTime, truncate } from '@/utils/format'

describe('formatDateTime', () => {
  it('空值 / 非法值返回占位符', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('—')
  })

  it('ISO 时间格式化为本地 YYYY-MM-DD HH:mm:ss', () => {
    const out = formatDateTime('2024-01-02T03:04:05Z')
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(out).not.toContain('Z')
  })

  it('后端 UTC naive 串（无时区标记）按 UTC 解析，不被当作本地时间', () => {
    // 同一时刻的 naive 串与 Z 串必须解析出相同本地时间；修复前 naive 串被当本地时间二次偏移
    expect(formatDateTime('2024-01-02T03:04:05')).toBe(formatDateTime('2024-01-02T03:04:05Z'))
    // 带偏移的串原样透传，不受补 Z 逻辑影响
    expect(formatDateTime('2024-01-02T03:04:05+08:00')).toBe(
      formatDateTime('2024-01-02T03:04:05+08:00'),
    )
  })
})

describe('formatTime', () => {
  it('紧凑格式 MM-DD HH:mm', () => {
    const out = formatTime('2024-01-02T03:04:05Z')
    expect(out).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('空值返回占位符', () => {
    expect(formatTime(null)).toBe('—')
  })
})

describe('truncate', () => {
  it('超长截断并补省略号', () => {
    expect(truncate('a'.repeat(60), 10)).toBe(`${'a'.repeat(10)}…`)
  })

  it('未超长原样返回', () => {
    expect(truncate('short')).toBe('short')
  })
})
