<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  lines: {
    type: Array,
    default: () => [],
  },
  visible: {
    type: Boolean,
    default: true,
  },
})

const legendCollator = new Intl.Collator(['zh-CN', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

const displayLines = computed(() => {
  return (props.lines || [])
    .map((line) => ({
      id: line.id,
      name: line.name || line.id,
      color: line.color || '#2563EB',
    }))
    .sort((a, b) => legendCollator.compare(a.name || '', b.name || ''))
})

const isDense = computed(() => displayLines.value.length >= 40)
const isVeryDense = computed(() => displayLines.value.length >= 80)

const rowsPerColumn = computed(() => {
  if (isVeryDense.value) return 16
  if (isDense.value) return 13
  return 10
})

const legendColumns = computed(() => {
  const linesCount = displayLines.value.length
  return Math.max(1, Math.min(2, Math.ceil(linesCount / rowsPerColumn.value)))
})

const legendStyle = computed(() => {
  const widthPx = 180 + (legendColumns.value - 1) * 56
  return {
    '--legend-columns': String(legendColumns.value),
    '--legend-width': `${widthPx}px`,
  }
})

const collapsed = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) collapsed.value = false
  },
)

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside
    v-if="visible && displayLines.length"
    class="line-legend"
    :class="{ 'line-legend--dense': isDense, 'line-legend--very-dense': isVeryDense }"
    :style="legendStyle"
    aria-label="线路图例"
  >
    <div class="line-legend__head">
      <h3>线路图例</h3>
      <div class="line-legend__head-actions">
        <span>{{ displayLines.length }} 条</span>
        <button
          type="button"
          class="line-legend__toggle"
          :aria-expanded="!collapsed"
          :title="collapsed ? '展开图例' : '收起图例'"
          @click="toggleCollapsed"
        >
          {{ collapsed ? '展开' : '收起' }}
        </button>
      </div>
    </div>
    <ul v-show="!collapsed" class="line-legend__list">
      <li v-for="line in displayLines" :key="line.id" class="line-legend__item">
        <span class="line-legend__swatch" :style="{ '--line-color': line.color }"></span>
        <span class="line-legend__name" :title="line.name">{{ line.name }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.line-legend {
  --legend-bg: linear-gradient(160deg, rgba(10, 14, 24, 0.84) 0%, rgba(7, 10, 18, 0.94) 100%);
  --legend-border: rgba(123, 214, 255, 0.34);
  --legend-glow: rgba(58, 198, 255, 0.18);
  position: absolute;
  left: 12px;
  bottom: 12px;
  width: min(var(--legend-width, 124px), calc(100% - 120px));
  max-height: min(50vh, 420px);
  border: 1px solid var(--legend-border);
  border-radius: 12px;
  background: var(--legend-bg);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32), inset 0 0 0 1px var(--legend-glow);
  backdrop-filter: blur(10px);
  color: #eef6ff;
  z-index: 16;
  overflow: hidden;
  animation: legend-enter 240ms ease-out both;
}

.line-legend__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  background: linear-gradient(90deg, rgba(188, 31, 255, 0.3), rgba(249, 0, 191, 0.12));
  border-bottom: 1px solid rgba(188, 31, 255, 0.34);
}

.line-legend__head h3 {
  margin: 0;
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: 'Rajdhani', 'Noto Sans SC', sans-serif;
  font-weight: 700;
}

.line-legend__head span {
  font-size: 10px;
  line-height: 1.2;
  color: rgba(224, 242, 254, 0.9);
}

.line-legend__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.line-legend__toggle {
  border: 1px solid rgba(148, 163, 184, 0.36);
  background: rgba(2, 6, 23, 0.46);
  color: #dbeafe;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.line-legend__toggle:hover {
  border-color: rgba(125, 211, 252, 0.72);
  background: rgba(15, 23, 42, 0.72);
}

.line-legend__list {
  margin: 0;
  padding: 8px;
  width: 100%;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(var(--legend-columns, 1), minmax(0, 1fr));
  gap: 4px 4px;
  max-height: calc(min(50vh, 420px) - 40px);
  overflow-y: auto;
  overflow-x: hidden;
}

.line-legend__list::-webkit-scrollbar {
  width: 6px;
}

.line-legend__list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.46);
  border-radius: 999px;
}

.line-legend__item {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 6px 8px;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.62), rgba(30, 41, 59, 0.24));
}

.line-legend__swatch {
  --line-color: #2563EB;
  display: inline-block;
  width: 24px;
  height: 10px;
  border-radius: 999px;
  background: var(--line-color);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.85), 0 0 10px rgba(255, 255, 255, 0.16);
  flex-shrink: 0;
}

.line-legend__name {
  font-size: 12px;
  line-height: 1.25;
  font-family: 'Noto Sans SC', 'PingFang SC', sans-serif;
  color: rgba(241, 245, 249, 0.96);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-legend--dense .line-legend__list {
  gap: 3px 3px;
}

.line-legend--dense .line-legend__item {
  padding: 3px 6px;
}

.line-legend--dense .line-legend__swatch {
  width: 18px;
  height: 7px;
}

.line-legend--dense .line-legend__name {
  font-size: 10px;
}

.line-legend--very-dense .line-legend__item {
  padding: 3px 6px;
}

.line-legend--very-dense .line-legend__name {
  font-size: 10px;
  line-height: 1.2;
}

@keyframes legend-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 768px) {
  .line-legend {
    width: min(var(--legend-width, 124px), calc(100% - 20px));
    max-height: min(46vh, 320px);
    left: 10px;
    bottom: 10px;
  }

  .line-legend__list {
    max-height: calc(min(46vh, 320px) - 40px);
  }
}
</style>
