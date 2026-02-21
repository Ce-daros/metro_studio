<script setup>
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { useProjectStore } from '../stores/projectStore'
import {
  LAYER_EDGE_ANCHORS_HIT,
  LAYER_EDGES,
  LAYER_EDGES_HIT,
  LAYER_EDGES_SQUARE,
  LAYER_STATIONS,
} from './map-editor/constants'
import { buildMapStyle } from './map-editor/mapStyle'
import {
  ensureSources,
  ensureMapLayers,
  updateMapData,
  ensureLanduseLayer,
  removeLanduseLayer,
  setStationHighlightVisibility,
  updateMapDisplayVisibility,
} from './map-editor/mapLayers'
import { useMapContextMenu } from '../composables/useMapContextMenu.js'
import { useMapLineSelectionMenu } from '../composables/useMapLineSelectionMenu.js'
import { useMapExport } from '../composables/useMapExport.js'
import { useMapEventHandlers } from '../composables/useMapEventHandlers.js'
import { useMapBoundary } from '../composables/useMapBoundary.js'
import { useRouteDrawPreview } from '../composables/useRouteDrawPreview.js'
import { useMapTimelinePlayer } from '../composables/useMapTimelinePlayer.js'
import { useMapNavigation } from '../composables/useMapNavigation.js'
import { useMapReachability } from '../composables/useMapReachability.js'
import { useAnimationSettings } from '../composables/useAnimationSettings.js'
import { DEFAULT_MAP_CENTER } from '../lib/constants'
import { setMapGetter, setStoreGetter } from '../composables/useMapSearch.js'
import IconBase from './IconBase.vue'
import TimelineSlider from './TimelineSlider.vue'
import LanduseLegend from './LanduseLegend.vue'
import MapContextMenu from './map-editor/MapContextMenu.vue'
import MapLineSelectionMenu from './map-editor/MapLineSelectionMenu.vue'
import MapAnnotationMarkers from './map-editor/MapAnnotationMarkers.vue'
import MapNavigationOverlay from './map-editor/MapNavigationOverlay.vue'
import MapInterchangeMarkers from './map-editor/MapInterchangeMarkers.vue'
import MapLineLegend from './map-editor/MapLineLegend.vue'

const store = useProjectStore()
const mapContainer = ref(null)
const contextMenuCompRef = ref(null)
const lineSelectionMenuCompRef = ref(null)
const contextMenuRef = computed(() => contextMenuCompRef.value?.menuEl ?? null)
const lineSelectionMenuRef = computed(() => lineSelectionMenuCompRef.value?.menuEl ?? null)
const showHint = ref(false)
const mapCenterText = ref('--, --')
const mapZoomText = ref('--')
const mapZoomLevel = ref(4)
let map = null
let scaleControl = null
const GRID_SOURCE_ID = 'railmap-grid-source'
const GRID_MINOR_LAYER_ID = 'railmap-grid-minor'
const GRID_MAJOR_LAYER_ID = 'railmap-grid-major'

const { getAutoAnimateConfig } = useAnimationSettings()
useAutoAnimate(contextMenuRef, getAutoAnimateConfig())
useAutoAnimate(lineSelectionMenuRef, getAutoAnimateConfig())

function getMap() {
  return map
}

// ── Composables ──

const {
  contextMenu,
  contextMenuStyle,
  hasSelection,
  contextStation,
  contextTargetLabel,
  canMergeAtContextStation,
  closeContextMenu,
  adjustContextMenuPosition,
  openContextMenu,
  onContextOverlayMouseDown,
  setModeFromContext,
  addStationAtContext,
  clearSelectionFromContext,
  addEdgeAnchorFromContext,
  removeEdgeAnchorFromContext,
  clearContextEdgeAnchorsFromContext,
  renameContextStationFromContext,
  deleteContextStationFromContext,
  deleteContextEdgeFromContext,
  splitEdgeAtContext,
  mergeEdgesAtContextStation,
  aiTranslateContextStationEnglishFromContext,
} = useMapContextMenu({
  store,
  mapContainerRef: mapContainer,
  contextMenuRef,
  getMap,
})

const {
  lineSelectionMenu,
  closeLineSelectionMenu,
  openLineSelectionMenu,
  selectLineFromMenu,
  onLineSelectionMenuOverlayMouseDown,
} = useMapLineSelectionMenu({
  store,
  mapContainerRef: mapContainer,
  closeContextMenu,
})

const lineSelectionMenuStyle = computed(() => ({
  left: `${lineSelectionMenu.x}px`,
  top: `${lineSelectionMenu.y}px`,
}))

const { exportActualRoutePngFromMap } = useMapExport({ store, getMap })

const {
  routeDrawPreview,
  routeDrawDistanceLabel,
  routeDrawDistanceStyle,
  clearRouteDrawPreview,
  refreshRouteDrawPreviewProjectedPoints,
  updateRouteDrawPreview,
} = useRouteDrawPreview({ store, getMap })

const {
  selectionBox,
  handleStationClick,
  handleEdgeClick,
  handleEdgeAnchorClick,
  handleMapClick,
  handleMapContextMenu,
  startStationDrag,
  startEdgeAnchorDrag,
  onMouseMove,
  stopStationDrag,
  startBoxSelection,
  onInteractiveFeatureEnter,
  onInteractiveFeatureLeave,
  handleWindowResize,
} = useMapEventHandlers({
  store,
  getMap,
  closeContextMenu,
  closeLineSelectionMenu,
  openContextMenu,
  updateRouteDrawPreview,
  clearRouteDrawPreview,
  openLineSelectionMenu,
  refreshRouteDrawPreviewProjectedPoints,
  contextMenu,
})

const selectionBoxStyle = computed(() => {
  const left = Math.min(selectionBox.startX, selectionBox.endX)
  const top = Math.min(selectionBox.startY, selectionBox.endY)
  const width = Math.abs(selectionBox.endX - selectionBox.startX)
  const height = Math.abs(selectionBox.endY - selectionBox.startY)
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  }
})

const {
  fitMapToBoundary,
  setMapNotReady,
  onMapLoad: onBoundaryMapLoad,
  setupBoundaryWatcher,
} = useMapBoundary({ store, getMap })

const {
  onTimelineYearChange,
  onTimelinePlay,
  onTimelinePause,
  onTimelineStop,
  onTimelineSpeedChange,
  destroy: destroyTimelinePlayer,
} = useMapTimelinePlayer({ store })

const {
  navPrompt,
  navResultVisible,
  initNavigation,
  destroyNavigation,
} = useMapNavigation({ store, getMap })

const {
  initReachability,
  destroyReachability,
} = useMapReachability({ store, getMap })

// ── Map helpers ──

function lockMapNorthUp() {
  if (!map) return
  map.dragRotate?.disable()
  map.touchZoomRotate?.disableRotation()
  map.setBearing(0)
  map.setPitch(0)
}

function onWindowResize() {
  handleWindowResize(adjustContextMenuPosition)
}

// ── Escape callback registration ──
const registerEscapeCallback = inject('registerEscapeCallback', null)
const unregisterEscapeCallback = inject('unregisterEscapeCallback', null)

function escapeHandler() {
  if (contextMenu.visible) {
    closeContextMenu()
    return true
  }
  return false
}

function formatNavDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

const annotationMarkersKey = ref(0)
const interchangeMarkersKey = ref(0)

function getInterchangeMarkerStyle(lngLat) {
  if (!map || !lngLat) return { display: 'none' }
  const point = map.project(lngLat)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

function getAnnotationMarkerStyle(lngLat) {
  if (!map || !lngLat) return { display: 'none' }
  const point = map.project(lngLat)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}

const mapLegendLines = computed(() => {
  const lineById = new Map((store.project?.lines || []).map((line) => [line.id, line]))
  const visibleLineIds = new Set()

  for (const edge of store.project?.edges || []) {
    if (store.timelineFilterYear != null && edge.openingYear != null && edge.openingYear > store.timelineFilterYear) {
      continue
    }
    for (const lineId of edge.sharedByLineIds || []) {
      if (lineById.has(lineId)) visibleLineIds.add(lineId)
    }
  }

  return [...visibleLineIds].map((lineId) => {
    const line = lineById.get(lineId)
    return {
      id: line?.id || lineId,
      name: line?.nameZh || line?.nameEn || line?.id || lineId,
      color: line?.color || '#2563EB',
    }
  })
})

function updateAnnotationPositions() {
  annotationMarkersKey.value++
  interchangeMarkersKey.value++
}

function refreshViewportMeta() {
  if (!map) return
  const center = map.getCenter()
  const zoom = map.getZoom()
  mapCenterText.value = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
  mapZoomText.value = zoom.toFixed(2)
  mapZoomLevel.value = zoom
}

function normalizeLng(lng) {
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180
  return wrapped === -180 ? 180 : wrapped
}

function chooseGridStepDegrees(zoom) {
  const candidates = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]
  const pixelsPerDegree = (512 * (2 ** zoom)) / 360
  const targetPixelSpacing = 48
  let best = candidates[0]
  let bestDiff = Number.POSITIVE_INFINITY
  for (const step of candidates) {
    const diff = Math.abs(step * pixelsPerDegree - targetPixelSpacing)
    if (diff < bestDiff) {
      best = step
      bestDiff = diff
    }
  }
  return best
}

function buildGridLineFeatures(step, majorEvery = 5) {
  if (!map) return { minor: [], major: [] }
  const bounds = map.getBounds()
  const west = Math.max(-180, bounds.getWest() - step * 2)
  const east = Math.min(180, bounds.getEast() + step * 2)
  const south = Math.max(-85, bounds.getSouth() - step * 2)
  const north = Math.min(85, bounds.getNorth() + step * 2)
  const eps = step / 1000

  const minor = []
  const major = []

  const startLng = Math.floor(west / step) * step
  const startLat = Math.floor(south / step) * step

  for (let lng = startLng; lng <= east + eps; lng += step) {
    const rounded = Number(lng.toFixed(6))
    const isMajor = Math.round(rounded / step) % majorEvery === 0
    const target = isMajor ? major : minor
    target.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [normalizeLng(rounded), south],
          [normalizeLng(rounded), north],
        ],
      },
      properties: {},
    })
  }

  for (let lat = startLat; lat <= north + eps; lat += step) {
    const rounded = Number(lat.toFixed(6))
    const isMajor = Math.round(rounded / step) % majorEvery === 0
    const target = isMajor ? major : minor
    target.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [west, rounded],
          [east, rounded],
        ],
      },
      properties: {},
    })
  }

  return { minor, major }
}

function ensureGridLayers() {
  if (!map || !map.isStyleLoaded()) return
  if (!map.getSource(GRID_SOURCE_ID)) {
    map.addSource(GRID_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(GRID_MINOR_LAYER_ID)) {
    map.addLayer({
      id: GRID_MINOR_LAYER_ID,
      type: 'line',
      source: GRID_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'minor'],
      paint: {
        'line-color': 'rgba(188,31,255,0.48)',
        'line-width': 1.2,
        'line-opacity': 0.9,
      },
      layout: {
        visibility: store.showMapGrid ? 'visible' : 'none',
      },
    })
  }
  if (!map.getLayer(GRID_MAJOR_LAYER_ID)) {
    map.addLayer({
      id: GRID_MAJOR_LAYER_ID,
      type: 'line',
      source: GRID_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'major'],
      paint: {
        'line-color': 'rgba(249,0,191,0.82)',
        'line-width': 1.8,
        'line-opacity': 1,
        'line-blur': 0.25,
      },
      layout: {
        visibility: store.showMapGrid ? 'visible' : 'none',
      },
    })
  }
}

function refreshMapGridLayer() {
  if (!map || !map.isStyleLoaded()) return
  ensureGridLayers()
  const source = map.getSource(GRID_SOURCE_ID)
  if (!source?.setData) return

  if (!store.showMapGrid) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }

  const step = chooseGridStepDegrees(map.getZoom())
  const { minor, major } = buildGridLineFeatures(step)
  const features = [
    ...minor.map((f) => ({ ...f, properties: { kind: 'minor' } })),
    ...major.map((f) => ({ ...f, properties: { kind: 'major' } })),
  ]
  source.setData({ type: 'FeatureCollection', features })
}

function setGridVisibility(visible) {
  if (!map || !map.isStyleLoaded()) return
  const next = visible ? 'visible' : 'none'
  if (map.getLayer(GRID_MINOR_LAYER_ID)) map.setLayoutProperty(GRID_MINOR_LAYER_ID, 'visibility', next)
  if (map.getLayer(GRID_MAJOR_LAYER_ID)) map.setLayoutProperty(GRID_MAJOR_LAYER_ID, 'visibility', next)
}

// ── Lifecycle ──

onMounted(() => {
  store.registerActualRoutePngExporter(exportActualRoutePngFromMap)

  const pmtilesProtocol = new Protocol()
  maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: buildMapStyle(store.mapTileType),
    center: DEFAULT_MAP_CENTER,
    zoom: 4,
    bearing: 0,
    pitch: 0,
    dragRotate: false,
    touchPitch: false,
    maxPitch: 0,
    boxZoom: false,
    preserveDrawingBuffer: true,
    attributionControl: true,
  })
  lockMapNorthUp()

  setMapGetter(getMap)
  setStoreGetter(() => store)

  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  scaleControl = new maplibregl.ScaleControl({
    maxWidth: 120,
    unit: 'metric',
  })
  map.addControl(scaleControl, 'top-left')

  map.on('load', () => {
    lockMapNorthUp()
    ensureSources(map, store)
    ensureMapLayers(map, store)
    updateMapData(map, store)
    refreshMapGridLayer()
    setGridVisibility(store.showMapGrid)
    refreshViewportMeta()
    map.resize()

    onBoundaryMapLoad()

    if (store.showLanduseOverlay) {
      ensureLanduseLayer(map, store)
    }

    map.on('click', LAYER_STATIONS, handleStationClick)
    map.on('mousedown', LAYER_STATIONS, startStationDrag)
    map.on('click', LAYER_EDGES_HIT, handleEdgeClick)
    map.on('click', LAYER_EDGE_ANCHORS_HIT, handleEdgeAnchorClick)
    map.on('mousedown', LAYER_EDGE_ANCHORS_HIT, startEdgeAnchorDrag)
    map.on('mouseenter', LAYER_STATIONS, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_STATIONS, onInteractiveFeatureLeave)
    map.on('mouseenter', LAYER_EDGES_HIT, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_EDGES_HIT, onInteractiveFeatureLeave)
    map.on('mouseenter', LAYER_EDGE_ANCHORS_HIT, onInteractiveFeatureEnter)
    map.on('mouseleave', LAYER_EDGE_ANCHORS_HIT, onInteractiveFeatureLeave)

    initNavigation(map)
    initReachability(map)
  })

  map.on('click', handleMapClick)
  map.on('contextmenu', handleMapContextMenu)
  map.on('mousedown', startBoxSelection)
  map.on('mousemove', onMouseMove)
  map.on('mouseup', stopStationDrag)
  map.on('mouseleave', stopStationDrag)
  map.on('move', refreshRouteDrawPreviewProjectedPoints)
  map.on('move', updateAnnotationPositions)
  map.on('move', refreshMapGridLayer)
  map.on('move', refreshViewportMeta)
  map.on('zoom', updateAnnotationPositions)
  map.on('zoom', refreshMapGridLayer)
  map.on('zoom', refreshViewportMeta)
  window.addEventListener('resize', onWindowResize)
  if (registerEscapeCallback) registerEscapeCallback(escapeHandler)
})

onBeforeUnmount(() => {
  setMapNotReady()
  store.unregisterActualRoutePngExporter(exportActualRoutePngFromMap)
  window.removeEventListener('resize', onWindowResize)
  if (unregisterEscapeCallback) unregisterEscapeCallback(escapeHandler)
  closeContextMenu()
  destroyTimelinePlayer()
  destroyNavigation()
  destroyReachability()
  scaleControl = null
  maplibregl.removeProtocol('pmtiles')
  removeLanduseLayer(map)
  if (map) {
    map.remove()
  }
})

// ── Watchers ──

watch(
  () => ({
    mode: store.mode,
    pendingEdgeStartStationId: store.pendingEdgeStartStationId,
  }),
  () => {
    if (store.mode !== 'route-draw' || !store.pendingEdgeStartStationId) {
      clearRouteDrawPreview()
    }
  },
  { deep: false },
)

watch(
  () => store.mode,
  () => {
    if (contextMenu.visible) closeContextMenu()
  },
)

watch(
  () => store.navigation.active,
  (active) => {
    if (!map) return
    const opacity = active ? 0.2 : 0.88
    if (map.getLayer(LAYER_EDGES)) {
      map.setPaintProperty(LAYER_EDGES, 'line-opacity', opacity)
    }
    if (map.getLayer(LAYER_EDGES_SQUARE)) {
      map.setPaintProperty(LAYER_EDGES_SQUARE, 'line-opacity', opacity)
    }
  },
  { immediate: true },
)

watch(
  () => ({
    project: store.project,
    selectedStationId: store.selectedStationId,
    selectedStationIds: store.selectedStationIds,
    selectedEdgeId: store.selectedEdgeId,
    selectedEdgeIds: store.selectedEdgeIds,
    selectedEdgeAnchor: store.selectedEdgeAnchor,
    boundary: store.regionBoundary,
    timelineFilterYear: store.timelineFilterYear,
  }),
  () => {
    if (!map || !map.isStyleLoaded()) return
    ensureSources(map, store)
    ensureMapLayers(map, store)
    updateMapData(map, store)
  },
  { deep: true },
)

  setupBoundaryWatcher()

  watch(
    () => store.fitToNetworkTrigger,
    () => {
      if (!store.regionBoundary) return
      fitMapToBoundary(store.regionBoundary)
    },
  )

  watch(
    () => ({
      showLanduseOverlay: store.showLanduseOverlay,
      protomapsApiKey: store.protomapsApiKey,
    }),
    ({ showLanduseOverlay: visible }) => {
      if (!map || !map.isStyleLoaded()) return
      if (visible) {
        ensureLanduseLayer(map, store)
      } else {
        removeLanduseLayer(map)
      }
    },
  )

  watch(
    () => store.highlightStationLocations,
    (visible) => {
      if (!map || !map.isStyleLoaded()) return
      setStationHighlightVisibility(map, visible)
    },
  )

  watch(
    () => ({
      showStationMarkers: store.showStationMarkers,
      showStationLabels: store.showStationLabels,
      showLineLabels: store.showLineLabels,
      showInterchangeMarkers: store.showInterchangeMarkers,
    }),
    () => {
      if (!map || !map.isStyleLoaded()) return
      updateMapDisplayVisibility(map, store)
    },
    { deep: true },
  )

  watch(
    () => store.mapTileType,
    (newTileType) => {
      if (!map) return
      const center = map.getCenter()
      const zoom = map.getZoom()
      const bearing = map.getBearing()
      const pitch = map.getPitch()

      map.setStyle(buildMapStyle(newTileType))

      const onStyleLoad = () => {
        if (!map.isStyleLoaded()) return
        map.off('styledata', onStyleLoad)
        ensureSources(map, store)
        ensureMapLayers(map, store)
        updateMapData(map, store)
        refreshMapGridLayer()
        setGridVisibility(store.showMapGrid)
        if (store.showLanduseOverlay) {
          ensureLanduseLayer(map, store)
        }
        setStationHighlightVisibility(map, store.highlightStationLocations)
        updateMapDisplayVisibility(map, store)
        refreshViewportMeta()
        map.setCenter(center)
        map.setZoom(zoom)
        map.setBearing(bearing)
        map.setPitch(pitch)
        lockMapNorthUp()
      }
      map.on('styledata', onStyleLoad)
    },
  )

  watch(
    () => store.showMapGrid,
    (visible) => {
      if (!map || !map.isStyleLoaded()) return
      setGridVisibility(visible)
      refreshMapGridLayer()
    },
    { immediate: true },
  )
</script>

<template>
  <section class="map-editor">
    <div class="map-editor__container">
      <div ref="mapContainer" class="map-editor__map" @contextmenu.prevent></div>
      <div v-if="selectionBox.active" class="map-editor__selection-box" :style="selectionBoxStyle"></div>
      <svg v-if="routeDrawPreview.visible" class="map-editor__route-preview" aria-hidden="true">
        <line
          :x1="routeDrawPreview.startX"
          :y1="routeDrawPreview.startY"
          :x2="routeDrawPreview.endX"
          :y2="routeDrawPreview.endY"
          :stroke="routeDrawPreview.lineColor"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="8 6"
        />
      </svg>
      <div v-if="routeDrawPreview.visible" class="map-editor__distance-badge" :style="routeDrawDistanceStyle">
        {{ routeDrawDistanceLabel }}
      </div>

      <MapContextMenu
        ref="contextMenuCompRef"
        :visible="contextMenu.visible"
        :menu-style="contextMenuStyle"
        :context-menu="contextMenu"
        :mode="store.mode"
        :has-selection="hasSelection"
        :context-target-label="contextTargetLabel"
        :context-station="contextStation"
        :can-merge-at-context-station="canMergeAtContextStation"
        :is-station-english-retranslating="store.isStationEnglishRetranslating"
        @overlay-mousedown="onContextOverlayMouseDown"
        @set-mode="setModeFromContext"
        @add-station="addStationAtContext"
        @clear-selection="clearSelectionFromContext"
        @add-anchor="addEdgeAnchorFromContext"
        @remove-anchor="removeEdgeAnchorFromContext"
        @clear-anchors="clearContextEdgeAnchorsFromContext"
        @rename-station="renameContextStationFromContext"
        @delete-station="deleteContextStationFromContext"
        @delete-edge="deleteContextEdgeFromContext"
        @split-edge="splitEdgeAtContext"
        @merge-edges="mergeEdgesAtContextStation"
        @ai-translate="aiTranslateContextStationEnglishFromContext"
      />

      <MapLineSelectionMenu
        ref="lineSelectionMenuCompRef"
        :visible="lineSelectionMenu.visible"
        :menu-style="lineSelectionMenuStyle"
        :line-options="lineSelectionMenu.lineOptions"
        @overlay-mousedown="onLineSelectionMenuOverlayMouseDown"
        @select-line="selectLineFromMenu"
        @close="closeLineSelectionMenu"
      />


      <MapAnnotationMarkers
        :annotations="store.project?.annotations || []"
        :annotation-markers-key="annotationMarkersKey"
        :selected-annotation-id="store.selectedAnnotationId"
        :get-marker-style="getAnnotationMarkerStyle"
      />

      <MapInterchangeMarkers
        :stations="store.project?.stations || []"
        :line-by-id="store.lineById"
        :markers-key="interchangeMarkersKey"
        :get-marker-style="getInterchangeMarkerStyle"
        :style="store.interchangeMarkerStyle"
        :visible="store.showInterchangeMarkers"
        :zoom="mapZoomLevel"
      />

      <MapLineLegend
        :lines="mapLegendLines"
        :visible="store.showLineLabels"
      />

      <MapNavigationOverlay
        :nav-prompt="navPrompt"
        :nav-result-visible="navResultVisible"
        :navigation-result="store.navigation.result"
        :format-nav-distance="formatNavDistance"
        @exit-navigation="store.exitNavigation()"
      />

      <button
        class="map-editor__hint-toggle"
        :class="{ 'map-editor__hint-toggle--active': showHint }"
        @click="showHint = !showHint"
        title="显示/隐藏快捷键提示"
      >
        <IconBase name="info" :size="18" />
      </button>

      <p v-if="showHint" class="map-editor__hint">
        Shift + 拖拽框选站点 | Ctrl/⌘ + 拖拽框选线段 | Alt + 点击线段选中整条线路 | Delete 删除站点/线段/锚点 | Ctrl/Cmd+A 全选站点 | Ctrl/Cmd+Z 撤销 |
        Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做 | Esc 取消待连接起点/关闭菜单
      </p>

      <div v-if="store.showMapCoordinates" class="map-editor__coords">
        <span>中心 {{ mapCenterText }}</span>
        <span>缩放 {{ mapZoomText }}</span>
      </div>
    </div>
    <TimelineSlider
      @year-change="onTimelineYearChange"
      @play="onTimelinePlay"
      @pause="onTimelinePause"
      @stop="onTimelineStop"
      @speed-change="onTimelineSpeedChange"
    />
    <LanduseLegend :visible="store.showLanduseOverlay" />
  </section>
</template>

<style scoped>
.map-editor {
  border: 1px solid var(--workspace-panel-border);
  background: var(--workspace-panel-bg);
  box-shadow: inset 0 0 0 1px rgba(188, 31, 255, 0.18), 0 0 14px rgba(188, 31, 255, 0.16);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.map-editor__container {
  flex: 1;
  min-height: 0;
  position: relative;
}

.map-editor__map {
  position: absolute;
  inset: 0;
}

.map-editor__selection-box {
  position: absolute;
  border: 1px solid rgba(249, 0, 191, 0.76);
  background:
    linear-gradient(180deg, rgba(188, 31, 255, 0.12), rgba(249, 0, 191, 0.2)),
    repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0 2px, transparent 2px 6px);
  background-size: 100% 100%, 100% 24px;
  animation: selection-appear var(--transition-fast) forwards, ark-scanline 0.9s linear infinite;
  pointer-events: none;
  z-index: 10;
  box-shadow: inset 0 0 10px rgba(188, 31, 255, 0.34), 0 0 12px rgba(249, 0, 191, 0.28);
}

.map-editor__route-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 12;
}

.map-editor__distance-badge {
  position: absolute;
  transform: translate(0, -100%);
  margin-top: -8px;
  padding: 3px 7px;
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  line-height: 1;
  pointer-events: none;
  z-index: 13;
}


.map-editor__ai-menu {
  position: absolute;
  width: 356px;
  max-height: calc(100% - 16px);
  overflow: auto;
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  padding: 10px;
  box-shadow: 0 0 0 1px rgba(188, 31, 255, 0.22), 0 0 18px rgba(188, 31, 255, 0.24);
}

.map-editor__ai-loading {
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--toolbar-muted);
}

.map-editor__ai-error {
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--toolbar-danger-border);
}

.map-editor__ai-candidate-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
}

.map-editor__ai-candidate {
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  text-align: left;
  padding: 8px 9px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: border-color var(--transition-normal), background-color var(--transition-normal);
}

.map-editor__ai-candidate:hover {
  border-color: var(--toolbar-button-hover-border);
  background: var(--toolbar-button-bg);
}

.map-editor__ai-candidate strong {
  font-size: 13px;
}

.map-editor__ai-candidate span {
  font-size: 12px;
  color: var(--toolbar-muted);
}

.map-editor__ai-candidate small {
  font-size: 11px;
  line-height: 1.35;
  color: var(--toolbar-hint);
}


.map-editor__hint-toggle {
  position: absolute;
  left: 12px;
  bottom: clamp(56px, 28vh, 244px);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border: 1px solid var(--toolbar-border);
  cursor: pointer;
  z-index: 12;
  transition: all 0.2s ease;
  padding: 0;
}

.map-editor__hint-toggle:hover {
  background: var(--toolbar-hover-bg);
  border-color: var(--toolbar-hover-border);
  box-shadow: 0 0 10px rgba(249, 0, 191, 0.24);
}

.map-editor__hint-toggle--active {
  background: var(--toolbar-primary-bg);
  color: #fff;
  border-color: var(--toolbar-primary-border);
}

.map-editor__hint {
  position: absolute;
  left: 52px;
  bottom: clamp(56px, 28vh, 244px);
  margin: 0;
  padding: 5px 8px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  border: 1px solid var(--toolbar-border);
  font-size: 11px;
  z-index: 11;
  pointer-events: none;
  opacity: 0.95;
}

.map-editor__coords {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 8px;
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  line-height: 1.2;
  z-index: 12;
  pointer-events: none;
}

:deep(.maplibregl-ctrl-scale) {
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
}

.search-marker {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: transform 0.2s ease, opacity 0.2s ease;
  pointer-events: auto;
  animation: search-marker-rotate 8s linear infinite;
  opacity: 0.95;
}

.search-marker:hover {
  transform: scale(1.15);
  animation-play-state: paused;
  opacity: 1;
}

.search-marker svg {
  display: block;
}

@keyframes search-marker-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
