import { computed, ref, onMounted } from 'vue'
import { CITY_PRESETS } from '../lib/osm/cityPresets'
import {
  DEFAULT_UI_THEME,
  UI_THEME_STORAGE_KEY,
  normalizeUiTheme,
} from '../lib/uiPreferences'
import { setNaiveThemeDark } from '../lib/naiveTheme'
import { useAnimationSettings } from './useAnimationSettings.js'
import { useDialog } from './useDialog.js'
import { getEffectiveBindings, formatBindingDisplay } from '../lib/shortcutRegistry'
import { getLocationIqApiKey, setLocationIqApiKey } from '../lib/osm/nominatimClient'
import { isTrial, PURCHASE_URL } from './useLicense'

// ── City preset filtering ──

const CHINESE_CITY_REGIONS = [
  { label: '华北', ids: ['beijing', 'tianjin', 'shijiazhuang', 'taiyuan'] },
  { label: '东北', ids: ['shenyang', 'dalian', 'changchun', 'harbin'] },
  { label: '华东', ids: ['shanghai', 'nanjing', 'hangzhou', 'suzhou', 'wuxi', 'changzhou', 'xuzhou', 'ningbo', 'wenzhou', 'shaoxing', 'hefei', 'wuhu', 'fuzhou', 'xiamen', 'jinan', 'qingdao', 'nanchang'] },
  { label: '华中', ids: ['wuhan', 'changsha', 'zhengzhou', 'luoyang'] },
  { label: '华南', ids: ['guangzhou', 'shenzhen', 'foshan', 'dongguan', 'nanning'] },
  { label: '西部', ids: ['chengdu', 'chongqing', 'xian', 'kunming', 'guiyang', 'urumqi', 'lanzhou'] },
  { label: '港澳台', ids: ['hongkong', 'taipei'] },
]

const CHINESE_CITY_IDS = new Set(CHINESE_CITY_REGIONS.flatMap((r) => r.ids))
const INTERNATIONAL_CITY_PRESETS = CITY_PRESETS.filter((p) => !CHINESE_CITY_IDS.has(p.id))

function buildCityMenuItems(presets, importing) {
  return presets.map((p) => ({
    type: 'item',
    label: `${p.name} ${p.nameEn}`,
    action: `importCity_${p.id}`,
    disabled: importing,
  }))
}

function buildChineseCityMenuItems(importing) {
  const presetMap = Object.fromEntries(CITY_PRESETS.map((p) => [p.id, p]))
  return CHINESE_CITY_REGIONS.map((region) => ({
    type: 'submenu',
    label: region.label,
    icon: 'git-branch',
    children: buildCityMenuItems(region.ids.map((id) => presetMap[id]).filter(Boolean), importing),
  }))
}

// ── UI theme / font ──

/**
 * Composable that provides menu structure definitions and action dispatch logic
 * for the MenuBar component.
 *
 * @param {Object} store - The project store instance (from useProjectStore)
 * @param {Function} emit - The component's emit function
 * @param {{ fileInputRef: import('vue').Ref }} refs - Refs needed by actions
 * @returns Menu item computeds, action handler, and UI preference helpers
 */
export function useMenuBarActions(store, emit, refs) {
  const uiTheme = ref(DEFAULT_UI_THEME)
  const { enabled: animationsEnabled, toggleAnimation } = useAnimationSettings()
  const { prompt } = useDialog()

  // ── UI preference helpers ──

  function applyUiTheme(theme) {
    const next = normalizeUiTheme(theme)
    uiTheme.value = next
    document.documentElement.setAttribute('data-ui-theme', next)
    setNaiveThemeDark(next === 'dark')
    try { window.localStorage.setItem(UI_THEME_STORAGE_KEY, next) } catch { /* noop */ }
  }

  function restoreUiPreferences() {
    try {
      applyUiTheme(window.localStorage.getItem(UI_THEME_STORAGE_KEY) || DEFAULT_UI_THEME)
    } catch {
      applyUiTheme(DEFAULT_UI_THEME)
    }
  }

  // ── Menu structure definitions ──

  const fileMenuItems = computed(() => {
    const importing = store.isImporting
    return [
      { type: 'item', label: '新建工程', action: 'createProject', icon: 'folder' },
      { type: 'item', label: '打开文件...', action: 'openFile', icon: 'upload', disabled: isTrial.value },
      { type: 'item', label: '保存文件', action: 'exportFile', icon: 'download', disabled: !store.project },
      { type: 'separator' },
      { type: 'item', label: '本地库', action: 'showProjectList', icon: 'folder-open' },
      { type: 'item', label: '存入本地库', action: 'persistToDb', icon: 'save', disabled: !store.project },
      { type: 'separator' },
      { type: 'item', label: '复制当前工程', action: 'duplicateProject', icon: 'copy', disabled: !store.project },
      { type: 'item', label: '重命名工程', action: 'renameProject', icon: 'edit', disabled: !store.project },
      { type: 'item', label: '删除当前工程', action: 'deleteProject', icon: 'trash', disabled: !store.project },
      { type: 'separator' },
      { type: 'submenu', label: '导入线网', icon: 'route', disabled: isTrial.value, children: [
        { type: 'item', label: '导入济南 OSM 线网', action: 'importOsm', icon: 'route', disabled: importing || isTrial.value },
        { type: 'separator' },
        { type: 'submenu', label: '中国城市', icon: 'git-branch', children: buildChineseCityMenuItems(importing) },
        { type: 'submenu', label: '国际城市', icon: 'git-branch', children: buildCityMenuItems(INTERNATIONAL_CITY_PRESETS, importing) },
      ]},
    ]
  })

  const editMenuItems = computed(() => {
    const bindings = getEffectiveBindings()
    const shortcutOf = (id) => {
      const b = bindings.find((x) => x.id === id)
      return b ? formatBindingDisplay(b.binding) : ''
    }
    return [
      { type: 'item', label: '撤销', action: 'undo', shortcut: shortcutOf('edit.undo'), icon: 'undo', disabled: !store.canUndo },
      { type: 'item', label: '重做', action: 'redo', shortcut: shortcutOf('edit.redo'), icon: 'redo', disabled: !store.canRedo },
      { type: 'separator' },
      { type: 'item', label: '全选站点', action: 'selectAll', shortcut: shortcutOf('edit.selectAll'), icon: 'check-circle' },
      { type: 'item', label: '全选所有线路', action: 'selectAllLines', shortcut: shortcutOf('edit.selectAllLines'), icon: 'check-circle' },
      { type: 'item', label: '清空选择', action: 'clearSelection', shortcut: shortcutOf('edit.escape'), icon: 'x-circle' },
      { type: 'separator' },
      { type: 'item', label: '复制选中', action: 'copy', shortcut: shortcutOf('edit.copy'), icon: 'copy', disabled: !(store.selectedEdgeIds?.length || store.selectedStationIds?.length) },
      { type: 'item', label: '粘贴', action: 'paste', shortcut: shortcutOf('edit.paste'), icon: 'clipboard' },
      { type: 'separator' },
      { type: 'item', label: '删除选中对象', action: 'deleteSelectedObjects', shortcut: shortcutOf('edit.delete'), icon: 'trash', disabled: !(store.selectedStationIds.length || store.selectedEdgeIds?.length) },
      { type: 'separator' },
      { type: 'item', label: '批量编辑站名', action: 'batchNameEdit', icon: 'edit', disabled: !store.project?.stations?.length },
      { type: 'separator' },
      { type: 'item', label: '删除所有未命名新站', action: 'deleteNewStations', icon: 'trash', disabled: !store.project?.stations?.some((s) => s.nameZh?.startsWith('新站 ')) },
    ]
  })

  const aiMenuItems = computed(() => [
    { type: 'item', label: 'AI翻译选中站英文', action: 'aiTranslateSelected', icon: 'languages', disabled: !store.selectedStationIds.length || store.isStationEnglishRetranslating },
    { type: 'item', label: '按规范重译全图英文', action: 'aiTranslateAll', icon: 'languages', disabled: !store.project?.stations?.length || store.isStationEnglishRetranslating },
    { type: 'separator' },
    { type: 'item', label: '报站生成', action: 'ttsGeneration', icon: 'volume-2' },
  ])

  const viewMenuItems = computed(() => [
    { type: 'toggle', label: '显示站点标识', checked: store.showStationMarkers, action: 'toggleStationMarkers', icon: 'map-pin' },
    { type: 'toggle', label: '显示站点名', checked: store.showStationLabels, action: 'toggleStationLabels', icon: 'eye' },
    { type: 'toggle', label: '显示换乘标记', checked: store.showInterchangeMarkers, action: 'toggleInterchangeMarkers', icon: 'target' },
    { type: 'toggle', label: '显示区域覆盖', checked: store.showLanduseOverlay, action: 'toggleLanduseOverlay', icon: 'map' },
    { type: 'separator' },
    { type: 'toggle', label: '显示网格', checked: store.showMapGrid, action: 'toggleMapGrid', icon: 'box' },
    { type: 'toggle', label: '显示坐标', checked: store.showMapCoordinates, action: 'toggleMapCoordinates', icon: 'map-pin' },
    { type: 'separator' },
    { type: 'item', label: '重置视图到线网', action: 'fitToNetwork', icon: 'focus', disabled: !store.regionBoundary },
  ])

  const exportMenuItems = computed(() => [
    { type: 'item', label: '导出实际走向图 PNG', action: 'exportActualRoute', icon: 'map', disabled: !store.project },
    { type: 'item', label: '导出官方风格图 PNG', action: 'exportSchematic', icon: 'layout', disabled: !store.project },
    { type: 'item', label: '导出车辆 HUD 打包', action: 'exportHudZip', icon: 'monitor', disabled: !store.project },
    { type: 'separator' },
      { type: 'submenu', label: '导出时间轴视频', icon: 'film', disabled: !store.project || !store.timelineHasData, children: isTrial.value
        ? [{ type: 'item', label: '720p (1280×720)', action: 'exportTimeline_720p', icon: 'film' }]
        : [
        { type: 'item', label: '1080p (1920×1080)', action: 'exportTimeline_1080p', icon: 'film' },
        { type: 'item', label: '2K (2560×1440)', action: 'exportTimeline_2k', icon: 'film' },
        { type: 'item', label: '4K (3840×2160)', action: 'exportTimeline_4k', icon: 'film' },
      ]},
    { type: 'separator' },
    { type: 'submenu', label: '车站显示模式', icon: 'eye', children: [
      { type: 'toggle', label: '显示所有车站', checked: store.exportStationVisibilityMode === 'all', action: 'stationVisAll', icon: 'eye' },
      { type: 'toggle', label: '仅显示换乘站', checked: store.exportStationVisibilityMode === 'interchange', action: 'stationVisInterchange', icon: 'eye' },
      { type: 'toggle', label: '隐藏所有车站', checked: store.exportStationVisibilityMode === 'none', action: 'stationVisNone', icon: 'eye-off' },
    ]},
  ])

  const settingsMenuItems = computed(() => [
    { type: 'item', label: '快捷键绑定', action: 'shortcutSettings', icon: 'sliders' },
    { type: 'separator' },
    { type: 'item', label: 'AI 配置', action: 'aiConfig', icon: 'settings' },
    { type: 'item', label: '配置 Protomaps API Key', action: 'configProtomapsKey', icon: 'key' },
    { type: 'item', label: '配置 LocationIQ API Key', action: 'configLocationIqKey', icon: 'key' },
    { type: 'item', label: '输入激活码', action: 'activationCode', icon: 'key' },
    { type: 'separator' },
    { type: 'toggle', label: '启用动画', checked: animationsEnabled.value, action: 'toggleAnimations', icon: 'zap' },
    { type: 'separator' },
    { type: 'submenu', label: '地图瓦片类型', icon: 'layers', children: [
      { type: 'toggle', label: 'OpenStreetMap 标准', checked: store.mapTileType === 'osm', action: 'mapTileOsm', icon: 'map' },
      { type: 'separator' },
      { type: 'toggle', label: 'CartoDB Voyager', checked: store.mapTileType === 'voyager', action: 'mapTileVoyager', icon: 'compass' },
      { type: 'toggle', label: 'CartoDB 浅色', checked: store.mapTileType === 'positron', action: 'mapTilePositron', icon: 'sun' },
      { type: 'toggle', label: 'CartoDB 深色', checked: store.mapTileType === 'dark', action: 'mapTileDark', icon: 'moon' },
      { type: 'separator' },
      { type: 'toggle', label: 'Stamen Toner 高对比', checked: store.mapTileType === 'stamenToner', action: 'mapTileStamenToner', icon: 'minimize-2' },
      { type: 'toggle', label: 'Stamen Terrain 地形', checked: store.mapTileType === 'stamenTerrain', action: 'mapTileStamenTerrain', icon: 'mountain' },
      { type: 'separator' },
      { type: 'toggle', label: 'ESRI 卫星影像', checked: store.mapTileType === 'satellite', action: 'mapTileSatellite', icon: 'globe' },
      { type: 'toggle', label: 'ESRI 街道地图', checked: store.mapTileType === 'esriWorldStreet', action: 'mapTileEsriWorldStreet', icon: 'map-pin' },
      { type: 'toggle', label: 'ESRI 地形地图', checked: store.mapTileType === 'esriWorldTopo', action: 'mapTileEsriWorldTopo', icon: 'layers' },
      { type: 'separator' },
      { type: 'toggle', label: 'Wikimedia 维基', checked: store.mapTileType === 'wikimedia', action: 'mapTileWikimedia', icon: 'globe' },
      { type: 'toggle', label: 'OpenTopoMap 地形图', checked: store.mapTileType === 'topo', action: 'mapTileTopo', icon: 'mountain' },
    ]},
  ])

  const statisticsMenuItems = computed(() => {
    const lineCount = store.project?.lines?.length || 0
    const stationCount = store.project?.stations?.length || 0
    const edgeCount = store.project?.edges?.length || 0
    return [
      { type: 'item', label: `线路总数: ${lineCount}`, icon: 'git-branch', disabled: true },
      { type: 'item', label: `站点总数: ${stationCount}`, icon: 'map-pin', disabled: true },
      { type: 'item', label: `线段总数: ${edgeCount}`, icon: 'route', disabled: true },
      { type: 'separator' },
      { type: 'item', label: '更多统计', action: 'statisticsMore', icon: 'bar-chart-2' },
    ]
  })

  const helpMenuItems = computed(() => [
    { type: 'item', label: '使用指南', action: 'helpGuide', icon: 'book-open' },
    { type: 'item', label: '功能介绍', action: 'helpFeat', icon: 'layers' },
    { type: 'item', label: '快捷键参考', action: 'helpKeys', icon: 'keyboard' },
    { type: 'separator' },
    ...(isTrial.value ? [{ type: 'item', label: '购买正式版', action: 'purchase', icon: 'star' }] : []),
    { type: 'item', label: '关于项目', action: 'about', icon: 'info' },
  ])

  const menus = computed(() => [
    { key: 'file', label: '文件', items: fileMenuItems.value },
    { key: 'edit', label: '编辑', items: editMenuItems.value },
    { key: 'view', label: '视图', items: viewMenuItems.value },
    { key: 'ai', label: 'AI', items: aiMenuItems.value },
    { key: 'export', label: '导出', items: exportMenuItems.value },
    { key: 'statistics', label: '统计', items: statisticsMenuItems.value },
    { key: 'settings', label: '设置', items: settingsMenuItems.value },
    { key: 'help', label: '帮助', items: helpMenuItems.value },
  ])

  function toggleTheme() {
    applyUiTheme(uiTheme.value === 'light' ? 'dark' : 'light')
  }

  async function handleConfigProtomapsKey() {
    const key = await prompt({
      title: '配置 Protomaps API Key',
      message: '请输入您的 Protomaps API Key（非商业用途免费，从 https://protomaps.com/account 获取）：',
      placeholder: 'your-api-key-here',
      defaultValue: store.protomapsApiKey,
      confirmText: '保存',
      cancelText: '取消',
    })
    if (key !== null) {
      store.setProtomapsApiKey(key)
      try {
        window.localStorage.setItem('protomapsApiKey', key)
      } catch { /* noop */ }
    }
  }

  async function handleConfigLocationIqKey() {
    const key = await prompt({
      title: '配置 LocationIQ API Key',
      message: '配置后站点上下文抓取速度提升约 2 倍。免费注册：https://locationiq.com（每天 5000 次）',
      placeholder: 'pk.xxxxxxxxxxxxxxxx',
      defaultValue: getLocationIqApiKey(),
      confirmText: '保存',
      cancelText: '取消',
    })
    if (key !== null) setLocationIqApiKey(key)
  }

  // ── Action dispatch ──

  function handleAction(action) {
    if (!action) return

    if (action === 'openFile') {
      refs.fileInputRef.value?.click()
      return }
    if (action === 'fitToNetwork') { store.fitToNetwork(); return }
    if (action.startsWith('importCity_')) { emit('action', action); return }
    if (action.startsWith('exportTimeline_')) {
      const resolution = action.slice('exportTimeline_'.length)
      store.exportTimelineVideo({ resolution })
      return
    }
    if (action === 'stationVisAll') { store.setExportStationVisibilityMode('all'); return }
    if (action === 'stationVisInterchange') { store.setExportStationVisibilityMode('interchange'); return }
    if (action === 'stationVisNone') { store.setExportStationVisibilityMode('none'); return }
    if (action === 'mapTileOsm') { store.setMapTileType('osm'); return }
    if (action === 'mapTileVoyager') { store.setMapTileType('voyager'); return }
    if (action === 'mapTileStamenToner') { store.setMapTileType('stamenToner'); return }
    if (action === 'mapTileStamenTerrain') { store.setMapTileType('stamenTerrain'); return }
    if (action === 'mapTileSatellite') { store.setMapTileType('satellite'); return }
    if (action === 'mapTileEsriWorldStreet') { store.setMapTileType('esriWorldStreet'); return }
    if (action === 'mapTileEsriWorldTopo') { store.setMapTileType('esriWorldTopo'); return }
    if (action === 'mapTileWikimedia') { store.setMapTileType('wikimedia'); return }
    if (action === 'mapTileTopo') { store.setMapTileType('topo'); return }
    if (action === 'mapTilePositron') { store.setMapTileType('positron'); return }
    if (action === 'mapTileDark') { store.setMapTileType('dark'); return }
    if (action === 'showProjectList') { emit('show-project-list'); return }
    if (action === 'aiConfig') { emit('show-ai-config'); return }
    if (action === 'ttsGeneration') { emit('show-tts-dialog'); return }
    if (action === 'shortcutSettings') { emit('show-shortcut-settings'); return }
    if (action === 'toggleAnimations') { toggleAnimation(); return }
    if (action === 'toggleStationMarkers') { store.toggleStationMarkers(); return }
    if (action === 'toggleStationLabels') { store.toggleStationLabels(); return }
    if (action === 'toggleLineLabels') { store.toggleLineLabels(); return }
    if (action === 'toggleInterchangeMarkers') { store.toggleInterchangeMarkers(); return }
    if (action === 'toggleLanduseOverlay') { store.toggleLanduseOverlay(); return }
    if (action === 'toggleMapGrid') { store.toggleMapGrid(); return }
    if (action === 'toggleMapCoordinates') { store.toggleMapCoordinates(); return }
    if (action === 'configProtomapsKey') { handleConfigProtomapsKey(); return }
    if (action === 'configLocationIqKey') { handleConfigLocationIqKey(); return }
    if (action === 'activationCode') { emit('show-activation-code'); return }
    if (action === 'statisticsMore') { emit('show-statistics'); return }
    if (action === 'about') { emit('show-about'); return }
    if (action === 'batchNameEdit') { emit('show-batch-name-edit'); return }
    if (action === 'purchase') { window.open(PURCHASE_URL, '_blank'); return }
    if (action === 'helpGuide') { emit('show-help', 'guide'); return }
    if (action === 'helpFeat') { emit('show-help', 'feat'); return }
    if (action === 'helpKeys') { emit('show-help', 'guide'); return }

    // Simple store actions
    const simpleActions = {
      undo: () => store.undo(),
      redo: () => store.redo(),
      selectAll: () => store.selectAllStations(),
      selectAllLines: () => store.selectAllLines(),
      clearSelection: () => store.clearSelection(),
      copy: () => store.copySelectedEdges(),
      paste: () => store.pasteEdges(),
      deleteSelectedObjects: () => {
        if (store.selectedStationIds.length) store.deleteSelectedStations()
        if (store.selectedEdgeIds?.length) store.deleteSelectedEdge()
      },
      deleteStations: () => store.deleteSelectedStations(),
      deleteNewStations: () => store.deleteNewStations(),
      deleteEdges: () => store.deleteSelectedEdge(),
      exportActualRoute: () => store.exportActualRoutePng(),
      exportSchematic: () => store.exportOfficialSchematicPng(),
      exportHudZip: () => store.exportAllLineHudZip(),
      exportTimeline: () => store.exportTimelineVideo(),
      exportFile: () => store.exportProjectFile(),
      persistToDb: () => store.persistNow(),
      aiTranslateSelected: () => store.retranslateSelectedStationEnglishNamesWithAi(),
      aiTranslateAll: () => store.retranslateAllStationEnglishNamesWithAi(),
    }

    if (simpleActions[action]) {
      simpleActions[action]()
      return
    }

    // Actions that need prompts or emit to parent
    emit('action', action)
  }

  onMounted(() => {
    restoreUiPreferences()
  })

  return {
    uiTheme,
    menus,
    fileMenuItems,
    editMenuItems,
    aiMenuItems,
    exportMenuItems,
    handleAction,
    applyUiTheme,
    restoreUiPreferences,
    toggleTheme,
  }
}
