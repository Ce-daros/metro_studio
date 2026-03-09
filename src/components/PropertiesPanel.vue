<script setup>
import { computed, ref, watch } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { NTooltip } from 'naive-ui'
import { useAnimationSettings } from '../composables/useAnimationSettings.js'
import { usePanelResize } from '../composables/usePanelResize'
import { useProjectStore } from '../stores/projectStore'
import PanelNoSelection from './panels/PanelNoSelection.vue'
import PanelStationSingle from './panels/PanelStationSingle.vue'
import PanelStationMulti from './panels/PanelStationMulti.vue'
import PanelEdgeSingle from './panels/PanelEdgeSingle.vue'
import PanelEdgeMulti from './panels/PanelEdgeMulti.vue'
import PanelAnchor from './panels/PanelAnchor.vue'
import PanelAnnotation from './panels/PanelAnnotation.vue'
import TimelineEventEditor from './TimelineEventEditor.vue'

const store = useProjectStore()
const { width, onPointerDown } = usePanelResize()
const collapsed = ref(false)
const activeView = ref('object')
const panelBody = ref(null)

const { getAutoAnimateConfig } = useAnimationSettings()
useAutoAnimate(panelBody, getAutoAnimateConfig())

const selectedStationCount = computed(() => store.selectedStationIds.length)
const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)
const hasTimelineYears = computed(() => store.timelineYears.length > 0)

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((station) => station.id === store.selectedStationId) || null
})

const panelType = computed(() => {
  if (store.selectedAnnotationId) return 'annotation'
  if (store.selectedEdgeAnchor) return 'anchor'
  if (selectedEdgeCount.value > 1) return 'edge-multi'
  if (selectedEdgeCount.value === 1) return 'edge-single'
  if (selectedStationCount.value === 1 && selectedStation.value) return 'station-single'
  if (selectedStationCount.value > 1) return 'station-multi'
  return 'none'
})

const panelTitle = computed(() => {
  switch (panelType.value) {
    case 'annotation':
      return '注释'
    case 'anchor':
      return '控制点'
    case 'edge-multi':
      return `线段批量编辑`
    case 'edge-single':
      return '线段属性'
    case 'station-single':
      return '站点属性'
    case 'station-multi':
      return '站点批量编辑'
    default:
      return '工程侧栏'
  }
})

const panelSubtitle = computed(() => {
  switch (panelType.value) {
    case 'annotation':
      return '编辑注释。'
    case 'anchor':
      return '编辑控制点。'
    case 'edge-multi':
      return `批量编辑 ${selectedEdgeCount.value} 条线段。`
    case 'edge-single':
      return '编辑当前线段。'
    case 'station-single':
      return '编辑当前站点。'
    case 'station-multi':
      return `批量编辑 ${selectedStationCount.value} 个站点。`
    default:
      return '管理线路和工程信息。'
  }
})

const selectionMeta = computed(() => {
  if (panelType.value === 'station-single' && selectedStation.value) {
    return selectedStation.value.nameZh || selectedStation.value.id
  }
  if (panelType.value === 'station-multi') {
    return `${selectedStationCount.value} stations`
  }
  if (panelType.value === 'edge-multi') {
    return `${selectedEdgeCount.value} edges`
  }
  if (panelType.value === 'edge-single') {
    return 'single edge'
  }
  if (panelType.value === 'anchor') {
    return 'geometry'
  }
  if (panelType.value === 'annotation') {
    return 'schematic note'
  }
  return store.project ? `${store.project.lines.length} lines` : 'project'
})

watch(panelType, (nextType, previousType) => {
  if (nextType !== previousType && nextType !== 'none') {
    activeView.value = 'object'
  }
})

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside
    class="properties-panel ark-terminal-corner"
    :class="{ 'properties-panel--collapsed': collapsed }"
    :style="collapsed ? {} : { width: `${width}px` }"
  >
    <div v-if="!collapsed" class="properties-panel__resize-handle" @pointerdown="onPointerDown" />

    <div class="properties-panel__header">
      <div class="properties-panel__header-indicator" :class="{ 'properties-panel__header-indicator--active': panelType !== 'none' }" />

      <template v-if="!collapsed">
        <div class="properties-panel__header-copy">
          <span class="properties-panel__eyebrow">Inspector</span>
          <span class="properties-panel__title">{{ panelTitle }}</span>
          <span class="properties-panel__subtitle">{{ selectionMeta }}</span>
        </div>

        <div class="properties-panel__header-actions">
          <div class="properties-panel__tabs">
            <button
              class="properties-panel__tab"
              :class="{ 'properties-panel__tab--active': activeView === 'object' }"
              type="button"
              @click="activeView = 'object'"
            >
              对象
            </button>
            <button
              class="properties-panel__tab"
              :class="{ 'properties-panel__tab--active': activeView === 'timeline' }"
              type="button"
              @click="activeView = 'timeline'"
            >
              年份事件
            </button>
          </div>

          <NTooltip placement="left">
            <template #trigger>
              <button class="properties-panel__collapse-btn ark-glitch-hover" type="button" @click="toggleCollapse">
                <span class="properties-panel__block-icon">{{ collapsed ? '◂' : '▸' }}</span>
              </button>
            </template>
            {{ collapsed ? '展开面板' : '折叠面板' }}
          </NTooltip>
        </div>
      </template>

      <template v-else>
        <NTooltip placement="left">
          <template #trigger>
            <button class="properties-panel__collapse-btn ark-glitch-hover" type="button" @click="toggleCollapse">
              <span class="properties-panel__block-icon">{{ collapsed ? '◂' : '▸' }}</span>
            </button>
          </template>
          {{ collapsed ? '展开面板' : '折叠面板' }}
        </NTooltip>
      </template>
    </div>

    <div v-if="!collapsed" ref="panelBody" class="properties-panel__body">
      <template v-if="activeView === 'object'">

        <PanelAnnotation v-if="panelType === 'annotation'" />
        <PanelAnchor v-else-if="panelType === 'anchor'" />
        <PanelEdgeMulti v-else-if="panelType === 'edge-multi'" />
        <PanelEdgeSingle v-else-if="panelType === 'edge-single'" />
        <PanelStationSingle v-else-if="panelType === 'station-single'" />
        <PanelStationMulti v-else-if="panelType === 'station-multi'" />
        <PanelNoSelection v-else />
      </template>

      <section v-else class="pp-inspector">
        <section class="pp-summary">
          <span class="pp-summary__eyebrow">Timeline Inspector</span>
          <h2 class="pp-summary__title">年份事件</h2>
          <p class="pp-summary__subtitle">在这里编辑年份事件。</p>
          <div class="pp-chip-row">
            <span class="pp-chip pp-chip--accent">{{ hasTimelineYears ? `${store.timelineYears.length} 个年份` : '暂无年份' }}</span>
            <span class="pp-chip pp-chip--muted">预览动画优先使用这里的文案</span>
          </div>
        </section>

        <section class="pp-card">
          <div class="pp-card__header">
            <div>
              <h3 class="pp-card__title">时间轴文案</h3>
              <p class="pp-card__subtitle">按年份编辑事件文案。</p>
            </div>
          </div>
          <TimelineEventEditor />
          <div v-if="!hasTimelineYears" class="pp-empty">暂无年份可编辑。</div>
        </section>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.properties-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(15, 15, 18, 0.94), rgba(8, 8, 10, 0.96));
  backdrop-filter: blur(16px) saturate(1.16);
  border: 1px solid rgba(188, 31, 255, 0.28);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(188, 31, 255, 0.08);
  overflow: hidden;
  flex-shrink: 0;
  transition: width var(--transition-slow, 0.25s ease);
}

.properties-panel--collapsed {
  width: 44px;
}

.properties-panel__resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  transition: background-color var(--transition-normal);
}

.properties-panel__resize-handle:hover,
.properties-panel__resize-handle:active {
  background: var(--ark-pink);
}

.properties-panel__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(188, 31, 255, 0.16);
  background:
    radial-gradient(circle at top left, rgba(255, 10, 192, 0.12), transparent 42%),
    linear-gradient(180deg, rgba(12, 12, 16, 0.98), rgba(10, 10, 14, 0.94));
  flex-shrink: 0;
}

.properties-panel__header-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.properties-panel__eyebrow {
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.properties-panel__title {
  color: var(--toolbar-text);
  font-family: var(--app-font-display);
  font-size: 16px;
  line-height: 1.1;
}

.properties-panel__subtitle {
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.properties-panel__header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.properties-panel__tabs {
  display: inline-flex;
  padding: 4px;
  border: 1px solid rgba(188, 31, 255, 0.16);
  background: rgba(8, 8, 12, 0.9);
  clip-path: var(--clip-chamfer-sm);
}

.properties-panel__tab {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  cursor: pointer;
  padding: 7px 12px;
  font-family: var(--app-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  clip-path: var(--clip-chamfer-xs);
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.properties-panel__tab:hover {
  color: var(--toolbar-text);
}

.properties-panel__tab--active {
  color: var(--ark-pink-light);
  background: rgba(255, 10, 192, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 10, 192, 0.24);
}

.properties-panel__block-icon {
  font-size: 14px;
  color: var(--ark-pink);
  line-height: 1;
}

.properties-panel__collapse-btn {
  border: 1px solid rgba(188, 31, 255, 0.22);
  background: rgba(8, 8, 10, 0.76);
  color: var(--toolbar-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition:
    color var(--transition-fast, 0.1s ease),
    background var(--transition-fast, 0.1s ease),
    border-color var(--transition-fast);
  clip-path: var(--clip-chamfer-sm);
}

.properties-panel__collapse-btn:hover {
  color: var(--toolbar-text);
  border-color: rgba(249, 0, 191, 0.58);
  background: rgba(188, 31, 255, 0.18);
}

.properties-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  background:
    linear-gradient(180deg, rgba(9, 9, 12, 0.98), rgba(7, 7, 10, 0.98)),
    repeating-linear-gradient(135deg, transparent 0 16px, rgba(255, 10, 192, 0.025) 16px 17px);
}

.properties-panel__body::-webkit-scrollbar {
  width: 6px;
}

.properties-panel__body::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border: 1px solid rgba(188, 31, 255, 0.22);
}

.properties-panel__header-indicator {
  width: 3px;
  align-self: stretch;
  background: rgba(255, 255, 255, 0.08);
  transition: background 150ms, box-shadow 150ms;
  flex-shrink: 0;
}

.properties-panel__header-indicator--active {
  background: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.properties-panel__hero {
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid rgba(188, 31, 255, 0.14);
  background:
    linear-gradient(180deg, rgba(16, 16, 22, 0.92), rgba(11, 11, 15, 0.92)),
    radial-gradient(circle at right top, rgba(255, 10, 192, 0.12), transparent 40%);
  clip-path: var(--clip-chamfer-sm);
}

.properties-panel__hero-eyebrow {
  display: inline-block;
  margin-bottom: 6px;
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.properties-panel__hero-title {
  margin: 0;
  color: var(--toolbar-text);
  font-size: 18px;
  line-height: 1.15;
}

.properties-panel__hero-text {
  margin: 8px 0 0;
  color: var(--toolbar-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
