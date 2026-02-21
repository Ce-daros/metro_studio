<script setup>
import { computed, ref } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { useProjectStore } from '../stores/projectStore'
import { usePanelResize } from '../composables/usePanelResize'
import { useAnimationSettings } from '../composables/useAnimationSettings.js'
import IconBase from './IconBase.vue'
import { NTooltip } from 'naive-ui'
import PanelNoSelection from './panels/PanelNoSelection.vue'
import PanelStationSingle from './panels/PanelStationSingle.vue'
import PanelStationMulti from './panels/PanelStationMulti.vue'
import PanelEdgeSingle from './panels/PanelEdgeSingle.vue'
import PanelEdgeMulti from './panels/PanelEdgeMulti.vue'
import PanelAnchor from './panels/PanelAnchor.vue'
import PanelAnnotation from './panels/PanelAnnotation.vue'

const store = useProjectStore()
const { width, onPointerDown } = usePanelResize()
const collapsed = ref(false)
const panelBody = ref(null)

const { getAutoAnimateConfig } = useAnimationSettings()
useAutoAnimate(panelBody, getAutoAnimateConfig())

const selectedStationCount = computed(() => store.selectedStationIds.length)
const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((s) => s.id === store.selectedStationId) || null
})

const panelType = computed(() => {
  console.log('[panel] selectedAnnotationId:', store.selectedAnnotationId, 'anchor:', store.selectedEdgeAnchor, 'edges:', selectedEdgeCount.value, 'stations:', selectedStationCount.value)
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
    case 'annotation': return '注释'
    case 'anchor': return '锚点'
    case 'edge-multi': return `线段（${selectedEdgeCount.value}）`
    case 'edge-single': return '线段'
    case 'station-single': return '站点'
    case 'station-multi': return `站点（${selectedStationCount.value}）`
    default: return '属性'
  }
})

const panelIcon = computed(() => {
  switch (panelType.value) {
    case 'annotation': return 'message-square'
    case 'anchor': return 'anchor'
    case 'edge-multi':
    case 'edge-single': return 'git-branch'
    case 'station-single':
    case 'station-multi': return 'map-pin'
    default: return 'settings'
  }
})

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside class="properties-panel ark-terminal-corner" :class="{ 'properties-panel--collapsed': collapsed }" :style="collapsed ? {} : { width: `${width}px` }">
    <div v-if="!collapsed" class="properties-panel__resize-handle" @pointerdown="onPointerDown" />
    <div class="properties-panel__header">
      <div class="properties-panel__header-indicator" :class="{ 'properties-panel__header-indicator--active': panelType !== 'none' }"></div>
      <template v-if="!collapsed">
        <IconBase :name="panelIcon" :size="14" class="properties-panel__header-icon" />
        <span class="properties-panel__title">{{ panelTitle }}</span>
      </template>
      <NTooltip placement="left">
        <template #trigger>
          <button class="properties-panel__collapse-btn ark-glitch-hover" type="button" @click="toggleCollapse">
            <IconBase :name="collapsed ? 'chevron-left' : 'chevron-right'" :size="14" />
          </button>
        </template>
        {{ collapsed ? '展开面板' : '折叠面板' }}
      </NTooltip>
    </div>
    <div v-if="!collapsed" ref="panelBody" class="properties-panel__body">
      <PanelAnnotation v-if="panelType === 'annotation'" />
      <PanelAnchor v-else-if="panelType === 'anchor'" />
      <PanelEdgeMulti v-else-if="panelType === 'edge-multi'" />
      <PanelEdgeSingle v-else-if="panelType === 'edge-single'" />
      <PanelStationSingle v-else-if="panelType === 'station-single'" />
      <PanelStationMulti v-else-if="panelType === 'station-multi'" />
      <PanelNoSelection v-else />
    </div>
  </aside>
</template>

<style scoped>
.properties-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(14, 14, 17, 0.9), rgba(8, 8, 11, 0.86));
  backdrop-filter: blur(14px) saturate(1.24);
  border: 1px solid rgba(188, 31, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(188, 31, 255, 0.14), 0 0 16px rgba(188, 31, 255, 0.18);
  overflow: hidden;
  flex-shrink: 0;
  transition: width var(--transition-slow, 0.25s ease);
}

.properties-panel--collapsed {
  width: 40px;
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
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--toolbar-border);
  background: linear-gradient(180deg, rgba(12, 12, 15, 0.82), rgba(9, 9, 12, 0.74));
  flex-shrink: 0;
}

.properties-panel__header-icon {
  flex-shrink: 0;
  color: var(--ark-pink);
}

.properties-panel__title {
  font-family: var(--app-font-display);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--toolbar-text);
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.properties-panel__collapse-btn {
  border: 1px solid rgba(188, 31, 255, 0.26);
  background: rgba(8, 8, 10, 0.68);
  color: var(--toolbar-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  transition: color var(--transition-fast, 0.1s ease), background var(--transition-fast, 0.1s ease), border-color var(--transition-fast);
  clip-path: var(--clip-chamfer-sm);
}

.properties-panel__collapse-btn:hover {
  color: var(--toolbar-text);
  border-color: rgba(249, 0, 191, 0.58);
  background: rgba(188, 31, 255, 0.2);
}

.properties-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  background-image:
    linear-gradient(var(--ark-grid-bold) 1px, transparent 1px),
    linear-gradient(90deg, var(--ark-grid-bold) 1px, transparent 1px),
    repeating-linear-gradient(135deg, transparent 0 11px, rgba(249, 0, 191, 0.035) 11px 12px);
  background-size: 36px 36px, 36px 36px, 22px 22px;
  background-position: -1px -1px;
}

.properties-panel__header-indicator {
  width: 3px;
  align-self: stretch;
  background: var(--ark-border-dim);
  transition: background 150ms, box-shadow 150ms;
  flex-shrink: 0;
}

.properties-panel__header-indicator--active {
  background: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.properties-panel__body::-webkit-scrollbar {
  width: 5px;
}

.properties-panel__body::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border: 1px solid rgba(188, 31, 255, 0.3);
}
</style>
