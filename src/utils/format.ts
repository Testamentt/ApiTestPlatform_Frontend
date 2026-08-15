// 展示格式化工具（纯函数，便于单测与复用）
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// why：后端存 UTC naive（无时区标记的 ISO 串，如 2026-08-10T08:39:32），JS 对无时区串按本地时间解析
// 会把 UTC 当本地时间显示（偏慢一个时区）；补 Z 让 Date 按 UTC 解析后再转本地展示（review M1）
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const normalized = hasOffset ? value : `${value}Z`
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 'YYYY-MM-DD HH:mm:ss'（本地时区） */
export function formatDateTime(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 'MM-DD HH:mm'（本地时区，列表用紧凑格式） */
export function formatTime(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 超长文本截断（表格路径/run_id 用） */
export function truncate(value: string, max = 42): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}
