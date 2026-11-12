<!-- 本项目编码格式：UTF-8（无 BOM）。 -->
<script setup lang="ts">
import { computed } from 'vue'

// why：状态词汇全局统一——用例（draft/active/archived）与任务（pending/running/success/failed）
// 共用一套视觉语言（圆点 + 文字），running 圆点做脉冲，符合"执行中"语义。
const props = defineProps<{ status: string }>()

const LABELS: Record<string, string> = {
  draft: '草稿',
  active: '已激活',
  archived: '已归档',
  pending: '排队中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  // 执行结果词汇（来自 junit_parser：pass/fail/error/skipped）
  skipped: '跳过',
}

const label = computed(() => LABELS[props.status] ?? props.status)
</script>

<template>
  <span class="status-tag" :class="`status-tag--${status}`">
    <span class="status-tag__dot" />
    <span class="status-tag__label">{{ label }}</span>
  </span>
</template>

<style scoped lang="scss">
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  border: 1px solid transparent;
}

.status-tag__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-tag--draft {
  color: var(--tp-pending);
  background: var(--tp-pending-soft);
  border-color: var(--tp-line);
}

.status-tag--active {
  color: var(--tp-success);
  background: var(--tp-success-soft);
  border-color: #b8e2d0;
}

.status-tag--archived {
  color: var(--tp-ink-400);
  background: var(--tp-pending-soft);
  border-color: var(--tp-line);
}

.status-tag--pending {
  color: var(--tp-pending);
  background: var(--tp-pending-soft);
  border-color: var(--tp-line);
}

.status-tag--running {
  color: var(--tp-running);
  background: var(--tp-running-soft);
  border-color: #c6daf5;
}

.status-tag--running .status-tag__dot {
  animation: status-pulse 1.2s ease-in-out infinite;
}

.status-tag--success {
  color: var(--tp-success);
  background: var(--tp-success-soft);
  border-color: #b8e2d0;
}

.status-tag--failed {
  color: var(--tp-failed);
  background: var(--tp-failed-soft);
  border-color: #f2c6c9;
}

.status-tag--skipped {
  color: var(--tp-pending);
  background: var(--tp-pending-soft);
  border-color: var(--tp-line);
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.72);
  }
}
</style>
