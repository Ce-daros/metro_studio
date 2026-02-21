<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { NConfigProvider, NMessageProvider, NDialogProvider } from 'naive-ui'
import { naiveTheme, naiveThemeOverrides } from './lib/naiveTheme'
import NaiveApiBridge from './components/NaiveApiBridge.vue'
import IconSprite from './components/IconSprite.vue'
import MenuBar from './components/MenuBar.vue'
import ToolStrip from './components/ToolStrip.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import LayoutControlsPanel from './components/LayoutControlsPanel.vue'
import MapEditor from './components/MapEditor.vue'
import SchematicView from './components/SchematicView.vue'
import VehicleHudView from './components/VehicleHudView.vue'
import TimelinePreviewView from './components/TimelinePreviewView.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import StatusBar from './components/StatusBar.vue'
import ProjectListDialog from './components/ProjectListDialog.vue'
import ProgressBar from './components/ProgressBar.vue'
import AiConfigDialog from './components/AiConfigDialog.vue'
import ShortcutSettingsDialog from './components/ShortcutSettingsDialog.vue'
import StatisticsDialog from './components/StatisticsDialog.vue'
import AboutDialog from './components/AboutDialog.vue'
import UpgradeDialog from './components/UpgradeDialog.vue'
import BatchNameEditDialog from './components/BatchNameEditDialog.vue'
import StationTTSDialog from './components/StationTTSDialog.vue'
import MapSearchDialog from './components/MapSearchDialog.vue'
import NoProjectWelcome from './components/NoProjectWelcome.vue'
import HelpView from './components/HelpView.vue'
import { useProjectStore } from './stores/projectStore'
import { useAutoSave } from './composables/useAutoSave'
import { useDialog } from './composables/useDialog.js'
import { useAnimationSettings } from './composables/useAnimationSettings.js'
import { useShortcuts } from './composables/useShortcuts.js'
import { useMapSearch } from './composables/useMapSearch.js'
import { isTrial, TRIAL_LIMITS } from './composables/useLicense'

const store = useProjectStore()
const { searchVisible, mapViewbox, targetProvince, openSearchDialogWithProvince, closeSearchDialog, onSearchResultSelect } = useMapSearch()
const { saveState, lastSavedAt, saveNow } = useAutoSave()
const { confirm, prompt } = useDialog()
const { enabled, getAutoAnimateConfig } = useAnimationSettings()

provide('autoSaveSaveState', saveState)
provide('autoSaveLastSavedAt', lastSavedAt)
provide('autoSaveSaveNow', saveNow)

const stationRenameTrigger = ref(0)
provide('stationRenameTrigger', stationRenameTrigger)

function showUpgradeDialog(msg) {
  upgradeMessage.value = msg
  upgradeVisible.value = true
}
provide('showUpgradeDialog', showUpgradeDialog)

// ── Escape callback registry ──
// MapEditor (and other components) can register callbacks to handle Escape
// in their own context (e.g. close context menu, close AI menu).
const escapeCallbacks = new Set()
provide('registerEscapeCallback', (cb) => escapeCallbacks.add(cb))
provide('unregisterEscapeCallback', (cb) => escapeCallbacks.delete(cb))


const WORKSPACE_VIEW_STORAGE_KEY = 'metro_studio_workspace_active_view'
const activeView = ref('map')
const projectListVisible = ref(false)
const aiConfigVisible = ref(false)
const shortcutSettingsVisible = ref(false)
const statisticsVisible = ref(false)
const aboutVisible = ref(false)
const batchNameEditVisible = ref(false)
const ttsDialogVisible = ref(false)
const upgradeVisible = ref(false)
const upgradeMessage = ref('')
const helpVisible = ref(false)
const helpInitCategory = ref('guide')
const ttsDialogRef = ref(null)
const globalFileInputRef = ref(null)
const canvasContainer = ref(null)
const viewChanging = ref(false)
const viewChangeProgress = ref(0)
const hasActiveProject = computed(() => Boolean(store.project))

useAutoAnimate(canvasContainer, getAutoAnimateConfig())

function handleBeforeUnload(event) {
  store.flushPersist()
  event.preventDefault()
  event.returnValue = ''
}

function loadWorkspaceViewState() {
  try {
    const saved = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)
    if (saved && ['map', 'schematic', 'hud', 'preview'].includes(saved)) {
      activeView.value = saved
    }
  } catch {
    activeView.value = 'map'
  }
}

async function setActiveView(viewKey) {
  if (!['map', 'schematic', 'hud', 'preview'].includes(viewKey)) return

  viewChanging.value = true
  viewChangeProgress.value = 0

  const progressInterval = setInterval(() => {
    if (viewChangeProgress.value < 90) {
      viewChangeProgress.value += 30
    }
  }, 50)

  activeView.value = viewKey
  try {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, viewKey)
  } catch { /* noop */ }

  await nextTick()

  clearInterval(progressInterval)
  viewChangeProgress.value = 100
  setTimeout(() => {
    viewChanging.value = false
    viewChangeProgress.value = 0
  }, 200)

  if (viewKey === 'schematic') {
    if (!store.project?.meta?.hasAutoLayoutTriggered && store.project?.stations?.length >= 2 && !store.isLayoutRunning) {
      store.project.meta.hasAutoLayoutTriggered = true
      store.touchProject('')
      store.runAutoLayout()
    }
  }
}

function handleMenuAction(action) {
  if (!action) return

  const actionMap = {
    createProject: async () => {
      if (isTrial.value) {
        const projects = await store.listProjects()
        if (projects.length >= TRIAL_LIMITS.maxProjects) {
          showUpgradeDialog(`试用版最多创建 ${TRIAL_LIMITS.maxProjects} 个项目，请激活正式版以解除限制。`)
          return
        }
      }
      const name = await prompt({ title: '新建工程', message: '请输入工程名称', defaultValue: '新建工程', placeholder: '工程名称' })
      if (name === null) return
      await store.createNewProject(name.trim() || '新建工程')
    },
    duplicateProject: async () => {
      if (!store.project) return
      if (isTrial.value) {
        const projects = await store.listProjects()
        if (projects.length >= TRIAL_LIMITS.maxProjects) {
          showUpgradeDialog(`试用版最多创建 ${TRIAL_LIMITS.maxProjects} 个项目，请激活正式版以解除限制。`)
          return
        }
      }
      const name = await prompt({ title: '复制工程', message: '请输入副本名称', defaultValue: `${store.project.name} 副本`, placeholder: '副本名称' })
      if (name === null) return
      await store.duplicateCurrentProject(name.trim() || `${store.project.name} 副本`)
    },
    renameProject: async () => {
      if (!store.project) return
      const name = await prompt({ title: '重命名工程', message: '请输入新名称', defaultValue: store.project.name, placeholder: '工程名称' })
      if (name === null) return
      await store.renameCurrentProject(name.trim() || store.project.name)
    },
    deleteProject: async () => {
      if (!store.project) return
      const ok = await confirm({ title: '删除工程', message: `确认删除工程「${store.project.name}」吗？此操作不可撤销。`, confirmText: '删除', danger: true })
      if (!ok) return
      await store.deleteProjectById(store.project.id)
    },
    importOsm: () => {
      store.importJinanNetwork()
    },
    aiConfig: () => {
      aiConfigVisible.value = true
    },
    shortcutSettings: () => {
      shortcutSettingsVisible.value = true
    },
  }

  if (action.startsWith('importCity_')) {
    const cityId = action.slice('importCity_'.length)
    store.importCityNetwork(cityId)
    return
  }

  if (actionMap[action]) {
    actionMap[action]()
  }
}

async function onGlobalFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    await store.importProjectFile(file)
  } catch (error) {
    store.statusText = `加载工程失败: ${error.message || '未知错误'}`
  } finally {
    event.target.value = ''
  }
}

function openGlobalProjectFilePicker() {
  globalFileInputRef.value?.click()
}

function onShowReachability({ stationId, thresholdMeters }) {
  store.setReachability(stationId, thresholdMeters)
}

// ── Shortcut system ──

function getShortcutContext() {
  if (store.navigation?.active) return 'navigation'
  if (activeView.value === 'map') return 'mapEditor'
  return 'global'
}

const { rebuildBindings } = useShortcuts({
  // 文件
  'file.save': () => {
    store.persistNow().then(() => {
      store.statusText = '已保存到本地库'
    }).catch(() => {})
  },
  'file.exportFile': () => {
    if (isTrial.value) { showUpgradeDialog('导出功能仅限正式版使用，请激活 License Key 以解除限制。'); return }
    store.exportProjectFile()
  },
  'file.newProject': () => handleMenuAction('createProject'),
  'file.openFile': () => globalFileInputRef.value?.click(),
  'file.exportPng': () => {
    if (isTrial.value) { showUpgradeDialog('导出功能仅限正式版使用，请激活 License Key 以解除限制。'); return }
    store.exportOfficialSchematicPng()
  },

  // 编辑
  'edit.undo': () => store.undo(),
  'edit.redo': () => store.redo(),
  'edit.redoAlt': () => store.redo(),
  'edit.selectAll': () => store.selectAllStations(),
  'edit.selectAllLines': () => store.selectAllLines(),
  'edit.copy': () => store.copySelectedEdges(),
  'edit.paste': () => store.pasteEdges(),
  'edit.escape': () => {
    // Let registered escape callbacks handle first (context menus, AI menus, etc.)
    for (const cb of escapeCallbacks) {
      if (cb()) return
    }
    // 退出样式刷模式
    if (store.styleBrush.active) {
      store.deactivateStyleBrush()
      return
    }
    store.cancelPendingEdgeStart()
    store.clearSelection()
  },
  'edit.delete': () => {
    if (store.selectedEdgeAnchor) { store.removeSelectedEdgeAnchor(); return }
    if ((store.selectedEdgeIds?.length || 0) > 0) { store.deleteSelectedEdge(); return }
    if (store.selectedStationIds.length) { store.deleteSelectedStations(); return }
  },
  'edit.deleteAlt': () => {
    if (store.selectedEdgeAnchor) { store.removeSelectedEdgeAnchor(); return }
    if ((store.selectedEdgeIds?.length || 0) > 0) { store.deleteSelectedEdge(); return }
    if (store.selectedStationIds.length) { store.deleteSelectedStations(); return }
  },
  'edit.renameStation': () => {
    if (store.selectedStationIds.length === 1) {
      stationRenameTrigger.value += 1
    }
  },
  'edit.search': () => openSearchDialog(),

  // 视图
  'view.map': () => setActiveView('map'),
  'view.schematic': () => setActiveView('schematic'),
  'view.hud': () => setActiveView('hud'),
  'view.preview': () => setActiveView('preview'),

  // 工具
  'tool.select': () => store.setMode('select'),
  'tool.addStation': () => store.setMode('add-station'),
  'tool.addEdge': () => store.setMode('add-edge'),
  'tool.routeDraw': () => store.setMode('route-draw'),
  'tool.styleBrush': () => store.setMode('style-brush'),
  'tool.boxSelect': () => store.setMode('box-select'),
  'tool.anchorEdit': () => store.setMode('anchor-edit'),
  'tool.annotation': () => store.setMode('annotation'),

  // 导航
  'nav.exit': () => {
    if (store.navigation?.active) store.exitNavigation()
  },
}, { getContext: getShortcutContext })

onMounted(async () => {
  loadWorkspaceViewState()
  window.addEventListener('beforeunload', handleBeforeUnload)
  await store.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
  <NDialogProvider>
  <NMessageProvider>
  <NaiveApiBridge>
  <div class="unsupported-screen">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ab2ce" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <div>请在桌面浏览器中访问</div>
    <div style="font-size:12px;color:#9ab2ce">需要至少 768px 的屏幕宽度</div>
  </div>
  <IconSprite />
  <main class="app ark-terminal-corner">
    <div class="app__fx-layer app__fx-layer--grid" aria-hidden="true">
      <span class="app__serial app__serial--right">NO.001</span>
    </div>
    <div class="app__fx-layer app__fx-layer--noise" aria-hidden="true"></div>
    <template v-if="hasActiveProject">
      <MenuBar
        :active-view="activeView"
        @set-view="setActiveView"
        @action="handleMenuAction"
        @show-project-list="projectListVisible = true"
        @show-ai-config="aiConfigVisible = true"
        @show-tts-dialog="ttsDialogVisible = true; nextTick(() => ttsDialogRef?.onOpen())"
        @show-shortcut-settings="shortcutSettingsVisible = true"
        @show-statistics="statisticsVisible = true"
        @show-about="aboutVisible = true"
        @show-batch-name-edit="batchNameEditVisible = true"
        @show-search="openSearchDialogWithProvince"
        @show-help="(cat) => { helpInitCategory = cat; helpVisible = true }"
      />
      <div class="app__body">
        <ToolStrip
          v-if="activeView === 'map'"
          :mode="store.mode"
          :can-undo="store.canUndo"
          :can-redo="store.canRedo"
          @set-mode="store.setMode($event)"
          @undo="store.undo()"
          @redo="store.redo()"
        />
        <div ref="canvasContainer" class="app__canvas">
          <ProgressBar :visible="viewChanging" :progress="viewChangeProgress" />
          <section
            class="app__panel"
            :class="{ 'app__panel--active': activeView === 'map' }"
            :aria-hidden="activeView !== 'map'"
          >
            <ErrorBoundary><MapEditor /></ErrorBoundary>
          </section>
          <section
            class="app__panel"
            :class="{ 'app__panel--active': activeView === 'schematic' }"
            :aria-hidden="activeView !== 'schematic'"
          >
            <ErrorBoundary><SchematicView /></ErrorBoundary>
          </section>
          <section
            class="app__panel"
            :class="{ 'app__panel--active': activeView === 'hud' }"
            :aria-hidden="activeView !== 'hud'"
          >
            <ErrorBoundary><VehicleHudView /></ErrorBoundary>
          </section>
          <section
            class="app__panel"
            :class="{ 'app__panel--active': activeView === 'preview' }"
            :aria-hidden="activeView !== 'preview'"
          >
            <ErrorBoundary><TimelinePreviewView :active="activeView === 'preview'" /></ErrorBoundary>
          </section>
        </div>
        <PropertiesPanel v-if="activeView !== 'schematic'" />
        <LayoutControlsPanel v-if="activeView === 'schematic'" />
      </div>
      <StatusBar />
    </template>
    <NoProjectWelcome
      v-else
      class="app__welcome-full"
      @create-project="handleMenuAction('createProject')"
      @import-project="openGlobalProjectFilePicker"
      @enter-directly="store.createNewProject('未命名工程')"
    />
  </main>
  <ProjectListDialog :visible="projectListVisible" @close="projectListVisible = false" />
  <AiConfigDialog :visible="aiConfigVisible" @close="aiConfigVisible = false" @save="store.statusText = 'AI 配置已保存'" />
  <ShortcutSettingsDialog
    :visible="shortcutSettingsVisible"
    @close="shortcutSettingsVisible = false"
    @bindings-changed="rebuildBindings()"
  />
  <StatisticsDialog :visible="statisticsVisible" @close="statisticsVisible = false" @show-reachability="onShowReachability" />
  <AboutDialog :visible="aboutVisible" @close="aboutVisible = false" />
  <UpgradeDialog :visible="upgradeVisible" :message="upgradeMessage" @close="upgradeVisible = false" />
  <BatchNameEditDialog :visible="batchNameEditVisible" @close="batchNameEditVisible = false" />
  <StationTTSDialog ref="ttsDialogRef" :project="store.project" :visible="ttsDialogVisible" @close="ttsDialogVisible = false" />
  <MapSearchDialog :visible="searchVisible" :viewbox="mapViewbox" :target-province="targetProvince" @close="closeSearchDialog" @select="onSearchResultSelect" />
  <HelpView v-if="helpVisible" :init-category="helpInitCategory" @close="helpVisible = false" />
  <input
    ref="globalFileInputRef"
    type="file"
      accept=".json,.metro-studio.json"
    style="display: none"
    @change="onGlobalFileSelected"
  />
  </NaiveApiBridge>
  </NMessageProvider>
  </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.unsupported-screen {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--ark-bg-deep, #050505);
  color: var(--ark-text, #eef3ff);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 15px;
  text-align: center;
  padding: 24px;
}

@media (max-width: 767px) {
  .unsupported-screen {
    display: flex;
  }
  .app {
    display: none;
  }
}

.app {
  min-height: 100vh;
  height: 100vh;
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--app-shell-gradient);
  color: var(--app-text);
  overflow: hidden;
}

.app__fx-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.app__fx-layer--grid {
  background-image:
    linear-gradient(var(--ark-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--ark-grid) 1px, transparent 1px),
    repeating-linear-gradient(135deg, transparent 0 12px, rgba(249, 0, 191, 0.04) 12px 13px);
  background-size: 40px 40px, 40px 40px, 24px 24px;
}

.app__fx-layer--grid::before {
  content: '';
  position: absolute;
  right: 14px;
  top: 54px;
  width: 34px;
  height: 34px;
  opacity: 0.36;
  background:
    linear-gradient(90deg, rgba(249, 0, 191, 0.7) 0 3px, transparent 3px 6px),
    linear-gradient(0deg, rgba(188, 31, 255, 0.72) 0 3px, transparent 3px 6px);
  background-size: 6px 6px;
}

.app__fx-layer--noise {
  opacity: 0.14;
  mix-blend-mode: screen;
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.25) 0.45px, transparent 0.55px),
    radial-gradient(rgba(188, 31, 255, 0.18) 0.45px, transparent 0.55px);
  background-size: 3px 3px, 2px 2px;
  background-position: 0 0, 8px 8px;
}

.app__serial {
  position: absolute;
  top: 52px;
  font-family: var(--app-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: rgba(168, 210, 255, 0.45);
  text-transform: uppercase;
}

.app__serial--left {
  left: 62px;
}

.app__serial--right {
  right: 16px;
}

.app__body {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 8px;
  padding: 8px;
  min-height: 0;
  overflow: hidden;
}

.app__welcome-full {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.app__canvas {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  background: var(--workspace-bg);
  border: 1px solid rgba(188, 31, 255, 0.34);
  box-shadow: 0 0 0 1px rgba(188, 31, 255, 0.16), 0 0 16px rgba(188, 31, 255, 0.2);
  overflow: hidden;
}

.app__canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    repeating-linear-gradient(45deg, transparent 0 15px, rgba(188, 31, 255, 0.035) 15px 16px),
    linear-gradient(180deg, transparent 0%, rgba(5, 6, 9, 0.65) 100%);
  z-index: 0;
}

.app__panel {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transition: opacity var(--transition-normal);
  border: 1px solid rgba(188, 31, 255, 0.28);
  box-shadow: inset 0 0 0 1px rgba(249, 0, 191, 0.12), 0 0 10px rgba(188, 31, 255, 0.14);
}

.app__panel > * {
  width: 100%;
  height: 100%;
}

.app__panel--active {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}
</style>
