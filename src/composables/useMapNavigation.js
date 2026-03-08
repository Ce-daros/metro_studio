import { watch, onBeforeUnmount, computed } from 'vue'
import {
  resolveEdgeWaypointsForRender,
  buildCurveFromWaypoints,
} from '../components/map-editor/dataBuilders'

const SOURCE_NAV_ROUTE = 'metro-studio-nav-route'
const SOURCE_NAV_WALK = 'metro-studio-nav-walk'
const SOURCE_NAV_MARKERS = 'metro-studio-nav-markers'

const LAYER_NAV_ROUTE_OUTLINE = 'metro-studio-nav-route-outline'
const LAYER_NAV_ROUTE_LINE = 'metro-studio-nav-route-line'
const LAYER_NAV_ROUTE_ANIMATE = 'metro-studio-nav-route-animate'
const LAYER_NAV_WALK_LINE = 'metro-studio-nav-walk-line'
const LAYER_NAV_MARKERS = 'metro-studio-nav-markers-layer'
const LAYER_NAV_MARKERS_LABEL = 'metro-studio-nav-markers-label'

const ALL_LAYERS = [
  LAYER_NAV_MARKERS_LABEL,
  LAYER_NAV_MARKERS,
  LAYER_NAV_ROUTE_ANIMATE,
  LAYER_NAV_ROUTE_LINE,
  LAYER_NAV_ROUTE_OUTLINE,
  LAYER_NAV_WALK_LINE,
]
const ALL_SOURCES = [SOURCE_NAV_ROUTE, SOURCE_NAV_WALK, SOURCE_NAV_MARKERS]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

/**
 * 导航地图交互和图层管理 composable。
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store
 * @param {() => maplibregl.Map|null} deps.getMap
 */
export function useMapNavigation({ store, getMap }) {
  let animFrameId = null
  let dashOffset = 0
  let navClickHandler = null

  function logNavigation(level, message, extra = {}) {
    console[level](`[MapNavigation] ${message}`, {
      navigation: store.navigation || null,
      projectId: store.project?.id || null,
      stationCount: store.project?.stations?.length || 0,
      edgeCount: store.project?.edges?.length || 0,
      mapReady: Boolean(getMap()),
      styleLoaded: Boolean(getMap()?.isStyleLoaded?.()),
      ...extra,
    })
  }

  const navigationState = computed(() => store.navigation || {
    active: false,
    originLngLat: null,
    destinationLngLat: null,
    result: null,
  })

  const navPrompt = computed(() => {
    if (!navigationState.value.active) return ''
    if (!navigationState.value.originLngLat) return '点击地图选择起点'
    if (!navigationState.value.destinationLngLat) return '点击地图选择终点'
    return ''
  })

  const navResultVisible = computed(() => {
    return navigationState.value.active && navigationState.value.destinationLngLat != null
  })

  // ── 图层管理 ──

  function removeLayers(map) {
    for (const layerId of ALL_LAYERS) {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
    }
    for (const sourceId of ALL_SOURCES) {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }

  function ensureSources(map) {
    if (!map.getSource(SOURCE_NAV_ROUTE)) {
      map.addSource(SOURCE_NAV_ROUTE, { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getSource(SOURCE_NAV_WALK)) {
      map.addSource(SOURCE_NAV_WALK, { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getSource(SOURCE_NAV_MARKERS)) {
      map.addSource(SOURCE_NAV_MARKERS, { type: 'geojson', data: EMPTY_FC })
    }
  }

  function ensureLayers(map) {
    if (!map.getLayer(LAYER_NAV_ROUTE_OUTLINE)) {
      map.addLayer({
        id: LAYER_NAV_ROUTE_OUTLINE,
        type: 'line',
        source: SOURCE_NAV_ROUTE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.85,
        },
      })
    }
    if (!map.getLayer(LAYER_NAV_ROUTE_LINE)) {
      map.addLayer({
        id: LAYER_NAV_ROUTE_LINE,
        type: 'line',
        source: SOURCE_NAV_ROUTE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 6,
          'line-opacity': 1,
        },
      })
    }
    if (!map.getLayer(LAYER_NAV_ROUTE_ANIMATE)) {
      map.addLayer({
        id: LAYER_NAV_ROUTE_ANIMATE,
        type: 'line',
        source: SOURCE_NAV_ROUTE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 6,
          'line-opacity': 0.45,
          'line-dasharray': [0, 4, 3],
        },
      })
    }
    if (!map.getLayer(LAYER_NAV_WALK_LINE)) {
      map.addLayer({
        id: LAYER_NAV_WALK_LINE,
        type: 'line',
        source: SOURCE_NAV_WALK,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#6b7280',
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 3],
        },
      })
    }
    if (!map.getLayer(LAYER_NAV_MARKERS)) {
      map.addLayer({
        id: LAYER_NAV_MARKERS,
        type: 'circle',
        source: SOURCE_NAV_MARKERS,
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
    if (!map.getLayer(LAYER_NAV_MARKERS_LABEL)) {
      map.addLayer({
        id: LAYER_NAV_MARKERS_LABEL,
        type: 'symbol',
        source: SOURCE_NAV_MARKERS,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })
    }
  }

  // ── 数据构建 ──

  function buildRouteGeoJson() {
    const result = navigationState.value.result
    if (!result) return EMPTY_FC

    const project = store.project
    if (!project) return EMPTY_FC

    const stationMap = new Map((project.stations || []).map((s) => [s.id, s]))
    const edgeMap = new Map((project.edges || []).map((e) => [e.id, e]))
    const lineMap = new Map((project.lines || []).map((l) => [l.id, l]))

    const features = []

    for (const edgeId of result.edgeIds) {
      const edge = edgeMap.get(edgeId)
      if (!edge) continue

      const linearWaypoints = resolveEdgeWaypointsForRender(edge, stationMap)
      if (linearWaypoints.length < 2) continue

      const shouldSmooth = Boolean(edge.isCurved) && linearWaypoints.length >= 3 && linearWaypoints.length <= 20
      const coordinates = shouldSmooth ? buildCurveFromWaypoints(linearWaypoints) : linearWaypoints

      const line = lineMap.get(edge.sharedByLineIds?.[0])
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          id: edgeId,
          color: line?.color || '#2563EB',
        },
      })
    }

    return { type: 'FeatureCollection', features }
  }

  function buildWalkGeoJson() {
    const result = navigationState.value.result
    const nav = navigationState.value
    if (!result || !nav.originLngLat || !nav.destinationLngLat) return EMPTY_FC

    const project = store.project
    if (!project) return EMPTY_FC

    const stationMap = new Map((project.stations || []).map((s) => [s.id, s]))
    const originStation = stationMap.get(result.originStationId)
    const destStation = stationMap.get(result.destStationId)

    const features = []

    if (originStation?.lngLat) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [nav.originLngLat, originStation.lngLat],
        },
        properties: { type: 'walk-origin' },
      })
    }

    if (destStation?.lngLat) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [destStation.lngLat, nav.destinationLngLat],
        },
        properties: { type: 'walk-dest' },
      })
    }

    return { type: 'FeatureCollection', features }
  }

  function buildMarkersGeoJson() {
    const nav = navigationState.value
    const features = []

    if (nav.originLngLat) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: nav.originLngLat },
        properties: { label: '起点', color: '#22c55e' },
      })
    }

    if (nav.destinationLngLat) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: nav.destinationLngLat },
        properties: { label: '终点', color: '#ef4444' },
      })
    }

    return { type: 'FeatureCollection', features }
  }

  // ── 更新地图数据 ──

  function updateNavLayers() {
    const map = getMap()
    if (!map || !map.isStyleLoaded()) return

    try {
      ensureSources(map)
      ensureLayers(map)

      const routeSrc = map.getSource(SOURCE_NAV_ROUTE)
      const walkSrc = map.getSource(SOURCE_NAV_WALK)
      const markersSrc = map.getSource(SOURCE_NAV_MARKERS)

      if (routeSrc) routeSrc.setData(buildRouteGeoJson())
      if (walkSrc) walkSrc.setData(buildWalkGeoJson())
      if (markersSrc) markersSrc.setData(buildMarkersGeoJson())
    } catch (error) {
      logNavigation('error', 'updateNavLayers failed', { error })
      throw error
    }
  }

  function clearNavLayers() {
    const map = getMap()
    if (!map || !map.isStyleLoaded()) return
    removeLayers(map)
  }

  // ── 流动动画 ──

  function startAnimation() {
    stopAnimation()
    dashOffset = 0

    function animate() {
      const map = getMap()
      if (!map || !map.getLayer(LAYER_NAV_ROUTE_ANIMATE)) {
        animFrameId = null
        return
      }

      dashOffset = (dashOffset + 0.15) % 7
      map.setPaintProperty(LAYER_NAV_ROUTE_ANIMATE, 'line-dasharray', [
        0,
        dashOffset,
        3,
        7 - dashOffset,
      ])

      animFrameId = requestAnimationFrame(animate)
    }

    animFrameId = requestAnimationFrame(animate)
  }

  function stopAnimation() {
    if (animFrameId != null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
  }

  // ── 点击拦截 ──

  function onNavMapClick(e) {
    if (!navigationState.value.active) return

    const lngLat = [e.lngLat.lng, e.lngLat.lat]

    if (!store.navigation.originLngLat) {
      store.setNavigationOrigin(lngLat)
    } else if (!store.navigation.destinationLngLat) {
      store.setNavigationDestination(lngLat)
    }
  }

  // ── 初始化 / 清理 ──

  function initNavigation(map) {
    navClickHandler = onNavMapClick
    map.on('click', navClickHandler)
  }

  function destroyNavigation() {
    stopAnimation()
    const map = getMap()
    if (map) {
      if (navClickHandler) {
        map.off('click', navClickHandler)
        navClickHandler = null
      }
      if (map.isStyleLoaded()) {
        removeLayers(map)
      }
    }
  }

  // ── Watchers ──

  // 监听导航状态变化，更新图层
  watch(
    () => ({
      active: navigationState.value.active,
      origin: navigationState.value.originLngLat,
      dest: navigationState.value.destinationLngLat,
      result: navigationState.value.result,
    }),
    (newVal) => {
      logNavigation('info', 'watch:navigation-state', { state: newVal })
      if (!newVal.active) {
        stopAnimation()
        clearNavLayers()
        return
      }

      updateNavLayers()

      if (newVal.result) {
        startAnimation()
      } else {
        stopAnimation()
      }
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    destroyNavigation()
  })

  return {
    navPrompt,
    navResultVisible,
    initNavigation,
    destroyNavigation,
    updateNavLayers,
  }
}
