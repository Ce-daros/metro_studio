<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import ToolbarProjectTab from './toolbar/ToolbarProjectTab.vue'
import ToolbarWorkflowTab from './toolbar/ToolbarWorkflowTab.vue'
import ToolbarObjectTab from './toolbar/ToolbarObjectTab.vue'
import ToolbarPublishTab from './toolbar/ToolbarPublishTab.vue'
import { useProjectStore } from '../stores/projectStore'
import { useToolbarProjectManagement } from '../composables/useToolbarProjectManagement.js'
import { useToolbarUiPreferences } from '../composables/useToolbarUiPreferences.js'
import { useToolbarStationOps } from '../composables/useToolbarStationOps.js'
import { useToolbarEdgeOps } from '../composables/useToolbarEdgeOps.js'
import { useToolbarLineOps } from '../composables/useToolbarLineOps.js'
import { useToolbarEditYear } from '../composables/useToolbarEditYear.js'
import { useWorldMetroRanking } from '../composables/useWorldMetroRanking.js'
import { useAnimationSettings } from '../composables/useAnimationSettings.js'

const store = useProjectStore()

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['toggle-collapse'])

const TAB_OPTIONS = [
  { key: 'project', label: '项目', block: '▣' },
  { key: 'workflow', label: '工具', block: '▧' },
  { key: 'object', label: '属性', block: '▨' },
  { key: 'publish', label: '导出', block: '▤' },
]
const MODE_LABELS = {
  select: '选择/拖拽',
  'add-station': '添加站点',
  'add-edge': '连接两站',
  'route-draw': '连续画线',
  'box-select': '框选',
  'quick-link': '快速连线',
  'anchor-edit': '控制点编辑',
  'delete-mode': '删除',
  'measure': '测量',
  'measure-two-point': '两点测量',
  'measure-multi-point': '多点测量',
  'annotation': '注释',
}

const activeTab = ref('project')
const toolbarContent = ref(null)

// ── Composables ──

const { getAutoAnimateConfig } = useAnimationSettings()
useAutoAnimate(toolbarContent, getAutoAnimateConfig())

const { refreshProjectOptions } = useToolbarProjectManagement()

const {
  uiTheme,
  applyUiTheme,
  restoreUiTheme,
} = useToolbarUiPreferences()

const { selectedStationCount } = useToolbarStationOps()
const { selectedEdgeCount, selectedEdge } = useToolbarEdgeOps()
const { activeLine, displayLineName } = useToolbarLineOps()

const {
  editYearInput,
  MIN_YEAR,
  MAX_YEAR,
  onEditYearInput,
  incrementEditYear,
  decrementEditYear,
} = useToolbarEditYear()

const {
  state: worldMetroRanking,
  rankingMessage: projectMetroRankingMessage,
  comparisonMessage: worldMetroComparisonMessage,
  timestamp: worldMetroRankingTimestamp,
} = useWorldMetroRanking()

// ── Computed ──

const currentProjectId = computed(() => store.project?.id || '')

const activeModeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)

const activeObjectLabel = computed(() => {
  if (store.selectedEdgeAnchor) return '控制点'
  if (selectedEdgeCount.value > 1) return `多线段（${selectedEdgeCount.value}）`
  if (selectedEdge.value) return '线段'
  if (selectedStationCount.value === 1) return '站点'
  if (selectedStationCount.value > 1) return `多站点（${selectedStationCount.value}）`
  if (activeLine.value) return '线路'
  return '无'
})

const contextSummary = computed(() => {
  if (store.selectedEdgeAnchor) {
    return `控制点 ${store.selectedEdgeAnchor.anchorIndex}`
  }
  if (selectedEdgeCount.value > 1) {
    return `已选 ${selectedEdgeCount.value} 条线段`
  }
  if (selectedEdge.value) {
    const fromStation = store.project?.stations?.find((s) => s.id === selectedEdge.value.fromStationId)
    const toStation = store.project?.stations?.find((s) => s.id === selectedEdge.value.toStationId)
    const fromName = fromStation?.nameZh || '未命名'
    const toName = toStation?.nameZh || '未命名'
    return `线段 ${fromName} ↔ ${toName}`
  }
  if (selectedStationCount.value === 1) {
    const station = store.project?.stations?.find((s) => s.id === store.selectedStationId)
    return station?.nameZh || station?.id || '站点'
  }
  if (selectedStationCount.value > 1) {
    return `已选 ${selectedStationCount.value} 个站点`
  }
  if (activeLine.value) {
    return `当前线路：${displayLineName(activeLine.value)}`
  }
  return '未选择对象'
})

const TAB_COMPONENTS = {
  project: ToolbarProjectTab,
  workflow: ToolbarWorkflowTab,
  object: ToolbarObjectTab,
  publish: ToolbarPublishTab,
}

const activeTabComponent = computed(() => TAB_COMPONENTS[activeTab.value] || null)

// ── Lifecycle ──

onMounted(async () => {
  restoreUiTheme()
  await refreshProjectOptions()
})
</script>

<template>
  <aside class="toolbar" :class="{ 'toolbar--collapsed': props.collapsed }">
    <section class="toolbar__section toolbar__section--header">
      <div class="toolbar__header-top">
        <div class="toolbar__brand">
          <h1>{{ props.collapsed ? 'MS' : 'Metro Studio' }}</h1>
          <p v-if="!props.collapsed" class="toolbar__subtitle">轨道交通线路图编辑器</p>
        </div>
        <button
          class="toolbar__collapse-btn"
          type="button"
          :aria-label="props.collapsed ? '展开侧边栏' : '收起侧边栏'"
          :title="props.collapsed ? '展开侧边栏' : '收起侧边栏'"
          @click="emit('toggle-collapse')"
        >
          {{ props.collapsed ? '»' : '«' }}
        </button>
      </div>

      <template v-if="!props.collapsed">
        <div class="toolbar__header-metrics">
          <div class="toolbar__display-settings">
            <div class="toolbar__theme-switch" role="group" aria-label="界面主题">
              <button class="toolbar__theme-btn" :class="{ active: uiTheme === 'light' }" @click="applyUiTheme('light')">日间</button>
              <button class="toolbar__theme-btn" :class="{ active: uiTheme === 'dark' }" @click="applyUiTheme('dark')">夜间</button>
            </div>
          </div>
          <section class="toolbar__world-ranking" aria-live="polite">
            <p class="toolbar__world-ranking-title">全球轨道交通长度排名</p>
            <p v-if="worldMetroRanking.loading" class="toolbar__world-ranking-main">排行榜加载中...</p>
            <p v-else class="toolbar__world-ranking-main">{{ projectMetroRankingMessage }}</p>
            <p v-if="!worldMetroRanking.loading && worldMetroRanking.error" class="toolbar__world-ranking-meta">
              {{ worldMetroRanking.error }}
            </p>
            <p v-else-if="!worldMetroRanking.loading && worldMetroComparisonMessage" class="toolbar__world-ranking-meta">
              {{ worldMetroComparisonMessage }}
            </p>
            <p v-if="worldMetroRankingTimestamp" class="toolbar__world-ranking-meta">
              数据时间: {{ worldMetroRankingTimestamp }}
            </p>
          </section>
        </div>

        <div class="toolbar__edit-year-section">
          <label class="toolbar__label toolbar__label--compact">新线建设年份</label>
          <div class="toolbar__year-selector">
            <button
              class="toolbar__year-btn"
              :disabled="store.currentEditYear <= MIN_YEAR"
              @click="decrementEditYear"
              aria-label="减少年份"
              title="减少年份"
            >
              −
            </button>
            <input
              type="number"
              class="toolbar__year-input"
              :value="editYearInput"
              @input="onEditYearInput"
              :min="MIN_YEAR"
              :max="MAX_YEAR"
              step="1"
            />
            <button
              class="toolbar__year-btn"
              :disabled="store.currentEditYear >= MAX_YEAR"
              @click="incrementEditYear"
              aria-label="增加年份"
              title="增加年份"
            >
              +
            </button>
          </div>
          <p class="toolbar__hint toolbar__hint--year">新放置的线将使用此年份</p>
        </div>

        <p class="toolbar__status">{{ store.statusText }}</p>
        <p class="toolbar__hint">当前工程 ID: {{ currentProjectId || '-' }}</p>
      </template>
    </section>

    <nav v-if="!props.collapsed" class="toolbar__tabs" aria-label="侧边栏功能选项卡">
      <button
        v-for="tab in TAB_OPTIONS"
        :key="tab.key"
        class="toolbar__tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span class="toolbar__tab-block">{{ tab.block }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <section v-if="!props.collapsed" class="toolbar__section toolbar__section--context">
      <h3>当前上下文</h3>
      <div class="toolbar__context-grid">
        <p><span>编辑模式</span><strong>{{ activeModeLabel }}</strong></p>
        <p><span>对象类型</span><strong>{{ activeObjectLabel }}</strong></p>
        <p><span>对象摘要</span><strong>{{ contextSummary }}</strong></p>
      </div>
    </section>

    <div v-if="!props.collapsed" ref="toolbarContent" class="toolbar__content">
      <component :is="activeTabComponent" />
    </div>
    <div v-else class="toolbar__collapsed-body">
      <p class="toolbar__hint">侧栏已收起</p>
      <button class="toolbar__btn toolbar__btn--small" type="button" @click="emit('toggle-collapse')">展开</button>
    </div>
  </aside>
</template>

<style src="./toolbar/toolbar-shared.css"></style>

<style scoped>
.toolbar {
  width: 100%;
  background: var(--toolbar-bg);
  color: var(--toolbar-text);
  overflow: hidden;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--toolbar-border);
}

.toolbar--collapsed {
  align-items: stretch;
}

.toolbar__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar__content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}

.toolbar__content::-webkit-scrollbar {
  width: 8px;
}

.toolbar__content::-webkit-scrollbar-thumb {
  background: var(--toolbar-scrollbar-thumb);
  border-radius: 999px;
}

.toolbar__section--header {
  background: var(--toolbar-header-bg);
}

.toolbar__section--context {
  padding: 10px 12px;
}

.toolbar__brand {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.toolbar__collapse-btn {
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-text);
  background: var(--toolbar-input-bg);
  border-radius: 8px;
  width: 30px;
  height: 30px;
  line-height: 1;
  cursor: pointer;
}

.toolbar__section h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0.01em;
}

.toolbar__subtitle {
  margin: 0;
  color: var(--toolbar-muted);
  font-size: 12px;
}

.toolbar__header-metrics {
  margin-top: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
}

.toolbar__display-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: start;
}

.toolbar__theme-switch {
  display: inline-flex;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 9px;
  overflow: hidden;
  width: fit-content;
  align-self: start;
}

.toolbar__theme-btn {
  border: none;
  color: var(--toolbar-muted);
  background: var(--toolbar-input-bg);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
}

.toolbar__theme-btn.active {
  background: var(--toolbar-tab-active-bg);
  color: var(--toolbar-tab-active-text);
}

.toolbar__label--compact {
  margin: 0;
}

.toolbar__world-ranking {
  border: 1px solid var(--toolbar-card-border);
  background: var(--toolbar-item-bg);
  border-radius: 8px;
  padding: 7px 9px;
  min-width: 0;
}

.toolbar__world-ranking-title {
  margin: 0;
  font-size: 11px;
  line-height: 1.25;
  color: var(--toolbar-muted);
}

.toolbar__world-ranking-main {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--toolbar-text);
  word-break: break-word;
}

.toolbar__world-ranking-meta {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--toolbar-hint);
  word-break: break-word;
}

.toolbar__status {
  margin: 10px 0 0;
  color: var(--toolbar-status);
  font-size: 12px;
  line-height: 1.45;
  padding: 8px 10px;
  border: 1px solid var(--toolbar-card-border);
  border-radius: 8px;
  background: var(--toolbar-item-bg);
}

.toolbar__tabs {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.toolbar__tab {
  position: relative;
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-muted);
  background: var(--toolbar-tab-bg);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.3;
  font-weight: 600;
  text-align: center;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.toolbar__tab:hover:not(.active) {
  border-color: var(--toolbar-button-hover-border);
}

.toolbar__tab.active {
  background: var(--toolbar-tab-active-bg);
  border-color: var(--toolbar-tab-active-border);
  color: var(--toolbar-tab-active-text);
}

.toolbar__context-grid {
  display: grid;
  gap: 6px;
}

.toolbar__context-grid p {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 8px;
  background: var(--toolbar-item-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar__context-grid span {
  font-size: 11px;
  color: var(--toolbar-muted);
}

.toolbar__context-grid strong {
  min-width: 0;
  text-align: right;
  font-size: 12px;
  color: var(--toolbar-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar__edit-year-section {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--toolbar-card-border);
  background: var(--toolbar-item-bg);
  border-radius: 8px;
}

.toolbar__year-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.toolbar__year-btn {
  border: 1px solid var(--toolbar-input-border);
  color: var(--toolbar-text);
  background: var(--toolbar-input-bg);
  border-radius: 7px;
  width: 28px;
  height: 28px;
  line-height: 1;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-normal);
}

.toolbar__year-btn:hover:not(:disabled) {
  border-color: var(--toolbar-button-hover-border);
  background: var(--toolbar-button-bg);
}

.toolbar__year-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar__year-input {
  flex: 1;
  min-width: 60px;
  max-width: 90px;
  padding: 6px 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 7px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  line-height: 1;
}

.toolbar__year-input:focus {
  outline: none;
  border-color: var(--toolbar-active-border);
}

.toolbar__year-input::-webkit-inner-spin-button,
.toolbar__year-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.toolbar__hint--year {
  margin-top: 6px;
  margin-bottom: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--toolbar-hint);
}

.toolbar__collapsed-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar__tab-block {
  font-size: 14px;
  color: var(--ark-pink);
  line-height: 1;
}

@media (max-width: 1060px) {
  .toolbar {
    padding: 12px;
  }
}
</style>
