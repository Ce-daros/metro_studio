<script setup>
import { computed, ref } from 'vue'
import { NTooltip } from 'naive-ui'
import { usePanelResize } from '../composables/usePanelResize'
import { useProjectStore } from '../stores/projectStore'
import SchematicControls from './SchematicControls.vue'

const { width, onPointerDown } = usePanelResize()
const collapsed = ref(false)
const store = useProjectStore()

const layoutSummary = computed(() => {
  return store.project?.layoutConfig?.paramReduction?.enabled ? '语义降维' : '地理种子'
})

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside
    class="layout-controls-panel ark-terminal-corner"
    :class="{ 'layout-controls-panel--collapsed': collapsed }"
    :style="collapsed ? {} : { width: `${width}px` }"
  >
    <div v-if="!collapsed" class="layout-controls-panel__resize-handle" @pointerdown="onPointerDown" />

    <div class="layout-controls-panel__header">
      <div class="layout-controls-panel__header-indicator" />

      <template v-if="!collapsed">
        <div class="layout-controls-panel__header-copy">
          <span class="layout-controls-panel__eyebrow">Tool Panel</span>
          <span class="layout-controls-panel__title">排版控制</span>
          <span class="layout-controls-panel__subtitle">{{ layoutSummary }} · {{ store.project?.stations?.length || 0 }} 个站点</span>
        </div>

        <div class="layout-controls-panel__header-actions">
          <span class="layout-controls-panel__meta">AUTO-LYT</span>
          <NTooltip placement="left">
            <template #trigger>
              <button class="layout-controls-panel__collapse-btn ark-glitch-hover" type="button" @click="toggleCollapse">
                <span class="layout-controls-panel__block-icon">{{ collapsed ? '◂' : '▸' }}</span>
              </button>
            </template>
            {{ collapsed ? '展开面板' : '折叠面板' }}
          </NTooltip>
        </div>
      </template>

      <template v-else>
        <NTooltip placement="left">
          <template #trigger>
            <button class="layout-controls-panel__collapse-btn ark-glitch-hover" type="button" @click="toggleCollapse">
              <span class="layout-controls-panel__block-icon">{{ collapsed ? '◂' : '▸' }}</span>
            </button>
          </template>
          {{ collapsed ? '展开面板' : '折叠面板' }}
        </NTooltip>
      </template>
    </div>

    <div v-if="!collapsed" class="layout-controls-panel__body">
      <SchematicControls />
    </div>

    <div v-if="!collapsed" class="layout-controls-panel__footer">
      <p class="layout-controls-panel__footer-text">修改参数后，手动执行一次生成。</p>
      <button
        class="pp-btn pp-btn--primary layout-controls-panel__run-btn"
        type="button"
        :disabled="store.isLayoutRunning || !store.project?.stations?.length"
        @click="store.runAutoLayout()"
      >
        {{ store.isLayoutRunning ? '排版中...' : '生成官方风示意图' }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.layout-controls-panel {
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

.layout-controls-panel--collapsed {
  width: 44px;
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
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(188, 31, 255, 0.16);
  background:
    radial-gradient(circle at top left, rgba(255, 10, 192, 0.12), transparent 42%),
    linear-gradient(180deg, rgba(12, 12, 16, 0.98), rgba(10, 10, 14, 0.94));
  flex-shrink: 0;
}

.layout-controls-panel__header-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout-controls-panel__eyebrow {
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.layout-controls-panel__title {
  color: var(--toolbar-text);
  font-family: var(--app-font-display);
  font-size: 16px;
  line-height: 1.1;
}

.layout-controls-panel__subtitle {
  color: var(--toolbar-muted);
  font-family: var(--app-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.layout-controls-panel__header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.layout-controls-panel__block-icon {
  font-size: 14px;
  color: var(--ark-pink);
  line-height: 1;
}

.layout-controls-panel__meta {
  color: rgba(168, 210, 255, 0.56);
  font-family: var(--app-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.layout-controls-panel__collapse-btn {
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

.layout-controls-panel__collapse-btn:hover {
  color: var(--toolbar-text);
  border-color: rgba(249, 0, 191, 0.58);
  background: rgba(188, 31, 255, 0.18);
}

.layout-controls-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  background:
    linear-gradient(180deg, rgba(9, 9, 12, 0.98), rgba(7, 7, 10, 0.98)),
    repeating-linear-gradient(135deg, transparent 0 16px, rgba(255, 10, 192, 0.025) 16px 17px);
}

.layout-controls-panel__body::-webkit-scrollbar {
  width: 6px;
}

.layout-controls-panel__body::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border: 1px solid rgba(188, 31, 255, 0.22);
}

.layout-controls-panel__footer {
  padding: 12px;
  border-top: 1px solid rgba(188, 31, 255, 0.16);
  background: linear-gradient(180deg, rgba(12, 12, 16, 0.96), rgba(9, 9, 12, 0.94));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.layout-controls-panel__footer-text {
  margin: 0;
  color: var(--toolbar-muted);
  font-size: 12px;
  line-height: 1.5;
}

.layout-controls-panel__run-btn {
  width: 100%;
}

.layout-controls-panel__header-indicator {
  width: 3px;
  align-self: stretch;
  background: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
  flex-shrink: 0;
}
</style>
