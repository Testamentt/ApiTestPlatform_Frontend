// 展示格式化工具（纯函数，便于单测与复用）
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
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
