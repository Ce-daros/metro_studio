<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import MetroSavingIcon from './MetroSavingIcon.vue'
import { useWorldMetroRanking } from '../composables/useWorldMetroRanking'
import { NTooltip } from 'naive-ui'

const store = useProjectStore()
const { state: ranking, rankingMessage, comparisonMessage, timestamp, refresh: refreshRanking } = useWorldMetroRanking()

const saveState = inject('autoSaveSaveState')
const lastSavedAt = inject('autoSaveLastSavedAt')
const saveNow = inject('autoSaveSaveNow')

const appVersion = import.meta.env.__APP_VERSION__ || '0.1.0'

const saveIndicator = computed(() => {
  switch (saveState?.value) {
    case 'saving':
      return { label: '正在保存...', cssClass: 'status-bar__save--saving' }
    case 'unsaved':
      return { label: '未保存更改', cssClass: 'status-bar__save--unsaved' }
    case 'error':
      return { label: '保存失败', cssClass: 'status-bar__save--error' }
    case 'saved':
    default:
      return { label: '已保存', cssClass: 'status-bar__save--saved' }
  }
})

const lastSavedLabel = computed(() => {
  if (!lastSavedAt?.value) return ''
  const d = lastSavedAt.value
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
})

const MODE_LABELS = {
  select: '选择/拖拽',
  'add-station': '添加站点',
  'add-edge': '添加线段',
  'route-draw': '连续布线',
  'style-brush': '样式刷',
  'box-select': '框选',
  'quick-link': '快速连线',
  'anchor-edit': '锚点编辑',
  'delete-mode': '删除',
  'measure': '测量',
  'measure-two-point': '两点测量',
  'measure-multi-point': '多点测量',
  'annotation': '注释',
}

const modeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)

const selectionSummary = computed(() => {
  const stationCount = store.selectedStationIds?.length || 0
  const edgeCount = store.selectedEdgeIds?.length || 0
  const anchorSelected = store.selectedEdgeAnchor ? 1 : 0

  const parts = []
  if (stationCount > 0) parts.push(`${stationCount} 站点`)
  if (edgeCount > 0) parts.push(`${edgeCount} 线段`)
  if (anchorSelected > 0) parts.push(`${anchorSelected} 锚点`)

  return parts.length > 0 ? parts.join(', ') : '无选中'
})

const projectSummary = computed(() => {
  if (!store.project) return '无工程'
  const stationCount = store.project.stations?.length || 0
  const edgeCount = store.project.edges?.length || 0
  const lineCount = store.project.lines?.length || 0
  return `${lineCount} 线路 · ${stationCount} 站点 · ${edgeCount} 线段`
})
</script>

<template>
  <footer class="status-bar ark-terminal-corner">
    <div class="status-bar__edge-line"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[模式]</span>
      <Transition name="mode-fade" mode="out-in">
        <span :key="modeLabel" class="status-bar__badge ark-chamfer">{{ modeLabel }}</span>
      </Transition>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section status-bar__section--grow">
      <span class="status-bar__label">[工程]</span>
      <span class="status-bar__value">{{ projectSummary }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section status-bar__section--save" @click="saveNow">
      <MetroSavingIcon :state="saveState?.value || 'saved'" />
      <span class="status-bar__value">{{ saveIndicator.label }}</span>
      <span v-if="lastSavedLabel && saveState?.value !== 'saving'" class="status-bar__save-time">{{ lastSavedLabel }}</span>
    </div>
    <div v-if="store.statusText || store.importProgress >= 0" class="status-bar__divider"></div>
    <div v-if="store.statusText || store.importProgress >= 0" class="status-bar__section status-bar__section--status">
      <div v-if="store.importProgress >= 0" class="status-bar__import-progress">
        <div class="status-bar__import-track">
          <div class="status-bar__import-fill" :style="{ width: `${store.importProgress}%` }" />
        </div>
        <span class="status-bar__value status-bar__value--status">{{ store.statusText }} {{ store.importProgress }}%</span>
      </div>
      <span v-else class="status-bar__value status-bar__value--status">{{ store.statusText }}</span>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[排名]</span>
      <NTooltip placement="top">
        <template #trigger>
          <span class="status-bar__value status-bar__value--ranking" @click="refreshRanking" style="cursor: pointer;">
            {{ ranking.loading ? '加载中...' : rankingMessage }}
          </span>
        </template>
        {{ `${comparisonMessage || ''}${timestamp ? ` · ${timestamp}` : ''}` }}
      </NTooltip>
    </div>
    <div class="status-bar__divider"></div>
    <div class="status-bar__section">
      <span class="status-bar__label">[版本]</span>
      <span class="status-bar__value status-bar__value--version">{{ appVersion }}</span>
    </div>
    <div class="status-bar__barcode" aria-hidden="true"></div>
  </footer>
</template>

<style scoped>
.status-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  background: linear-gradient(180deg, rgba(12, 12, 15, 0.84), rgba(7, 7, 9, 0.9));
  backdrop-filter: blur(14px) saturate(1.24);
  border-top: 1px solid rgba(188, 31, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(188, 31, 255, 0.12), 0 0 14px rgba(188, 31, 255, 0.18);
  font-family: var(--app-font-mono);
  font-size: 12px;
  line-height: 1.4;
  min-height: 28px;
}

.status-bar__edge-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ark-pink);
  opacity: 0.2;
}

.status-bar__section {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  min-width: 0;
}

.status-bar__section--grow {
  flex: 1;
  min-width: 0;
}

.status-bar__section--status {
  margin-left: auto;
  min-width: 0;
}

.status-bar__label {
  color: var(--ark-text-dim);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.status-bar__badge {
  color: #fff;
  font-weight: 500;
  background: rgba(249, 0, 191, 0.18);
  border: 1px solid rgba(249, 0, 191, 0.5);
  padding: 1px 6px;
  font-size: 12px;
  clip-path: var(--clip-chamfer-sm);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.status-bar__badge:not(.status-bar__badge--year) {
  animation: signal-blink 4s infinite ease-in-out;
}

.status-bar__badge--year {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.status-bar__value {
  color: var(--workspace-panel-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-bar__value--status {
  color: var(--toolbar-status);
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-bar__value--ranking {
  color: var(--toolbar-text);
  transition: color var(--transition-fast);
}

.status-bar__value--ranking:hover {
  color: var(--toolbar-tab-active-text);
}

.status-bar__value--status {
  display: inline-block;
}

.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.mode-fade-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.mode-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.status-bar__value--version {
  font-size: 12px;
  color: var(--workspace-panel-muted);
  font-weight: 400;
}

.status-bar__divider {
  width: 1px;
  height: 12px;
  background: var(--workspace-panel-border);
  flex-shrink: 0;
}

.status-bar__section--save {
  cursor: pointer;
  border: 1px solid transparent;
  padding: 2px 6px;
  margin: -2px 0;
  transition: background var(--transition-fast), border-color var(--transition-fast);
  clip-path: var(--clip-chamfer-sm);
}

.status-bar__section--save:hover {
  background: rgba(188, 31, 255, 0.12);
  border-color: rgba(249, 0, 191, 0.5);
}


.status-bar__save-time {
  color: var(--ark-text-dim);
  font-size: 12px;
}

.status-bar__import-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-bar__import-track {
  width: 80px;
  height: 4px;
  background: rgba(188, 31, 255, 0.15);
  flex-shrink: 0;
  overflow: hidden;
}

.status-bar__import-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ark-purple, #bc1fff), var(--ark-pink, #f900bf));
  box-shadow: 0 0 6px rgba(249, 0, 191, 0.5);
  transition: width 0.3s ease;
}

.status-bar__barcode {
  position: relative;
  margin-left: auto;
  width: 52px;
  height: 10px;
  opacity: 0.45;
  background:
    repeating-linear-gradient(90deg, rgba(188, 31, 255, 0.78) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(249, 0, 191, 0.7) 0 2px, transparent 2px 6px);
  pointer-events: none;
  overflow: hidden;
}

.status-bar__barcode::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent);
  width: 20px;
  animation: scanner-sweep 2s infinite linear;
}

@media (max-width: 960px) {
  .status-bar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 12px;
  }

  .status-bar__section--grow {
    flex-basis: 100%;
  }
}
</style>
