<script setup>
import { ref } from 'vue'
import { NTooltip } from 'naive-ui'
import { usePanelResize } from '../composables/usePanelResize'
import SchematicControls from './SchematicControls.vue'
import { useProjectStore } from '../stores/projectStore'

const { width, onPointerDown } = usePanelResize()
const collapsed = ref(false)
const store = useProjectStore()

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside class="layout-controls-panel ark-terminal-corner" :class="{ 'layout-controls-panel--collapsed': collapsed }" :style="collapsed ? {} : { width: `${width}px` }">
    <div v-if="!collapsed" class="layout-controls-panel__resize-handle" @pointerdown="onPointerDown" />
    <div class="layout-controls-panel__header">
      <div class="layout-controls-panel__header-indicator"></div>
      <template v-if="!collapsed">
        <span class="layout-controls-panel__block-icon">▣</span>
        <span class="layout-controls-panel__title">排版控制</span>
        <span class="layout-controls-panel__meta">AUTO-LYT</span>
      </template>
      <NTooltip :text="collapsed ? '展开面板' : '折叠面板'" placement="left">
        <template #trigger>
          <button class="layout-controls-panel__collapse-btn ark-glitch-hover" type="button" @click="toggleCollapse">
            <span class="layout-controls-panel__block-icon">{{ collapsed ? '◂' : '▸' }}</span>
          </button>
        </template>
        {{ collapsed ? '展开面板' : '折叠面板' }}
      </NTooltip>
    </div>
    <div v-if="!collapsed" class="layout-controls-panel__body">
      <SchematicControls />
    </div>
    <div v-if="!collapsed" class="layout-controls-panel__footer">
      <NTooltip placement="top">
        <template #trigger>
          <button
            class="pp-btn pp-btn--primary pp-btn--full"
            :disabled="store.isLayoutRunning || !store.project?.stations?.length"
            @click="store.runAutoLayout()"
          >
            {{ store.isLayoutRunning ? '排版中...' : '自动生成官方风' }}
          </button>
        </template>
        自动排版为官方风格
      </NTooltip>
    </div>
  </aside>
</template>

<style scoped>
.layout-controls-panel {
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

.layout-controls-panel--collapsed {
  width: 40px;
}

.layout-controls-panel__resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  transition: background-color var(--transition-normal);
}

.layout-controls-panel__resize-handle:hover,
.layout-controls-panel__resize-handle:active {
  background: var(--ark-pink);
}

.layout-controls-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--toolbar-border);
  background: linear-gradient(180deg, rgba(12, 12, 15, 0.82), rgba(9, 9, 12, 0.74));
  flex-shrink: 0;
}

.layout-controls-panel__block-icon {
  font-size: 14px;
  color: var(--ark-pink);
  line-height: 1;
  flex-shrink: 0;
}

.layout-controls-panel__title {
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

.layout-controls-panel__meta {
  margin-left: auto;
  font-size: 11px;
  color: rgba(168, 210, 255, 0.52);
  letter-spacing: 0.12em;
  white-space: nowrap;
}

.layout-controls-panel__collapse-btn {
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

.layout-controls-panel__collapse-btn:hover {
  color: var(--toolbar-text);
  border-color: rgba(249, 0, 191, 0.58);
  background: rgba(188, 31, 255, 0.2);
}

.layout-controls-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background-image:
    linear-gradient(var(--ark-grid-bold) 1px, transparent 1px),
    linear-gradient(90deg, var(--ark-grid-bold) 1px, transparent 1px);
  background-size: 36px 36px;
}

.layout-controls-panel__body::-webkit-scrollbar {
  width: 5px;
}

.layout-controls-panel__body::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border: 1px solid rgba(188, 31, 255, 0.3);
}

.layout-controls-panel__footer {
  padding: 12px 14px;
  border-top: 1px solid var(--toolbar-border);
  background: var(--toolbar-bg);
  flex-shrink: 0;
}

.pp-btn--full {
  width: 100%;
}

.layout-controls-panel__header-indicator {
  width: 3px;
  align-self: stretch;
  background: var(--ark-border-dim);
  flex-shrink: 0;
}
</style>
