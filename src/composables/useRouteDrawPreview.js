import { computed, reactive } from 'vue'
import { haversineDistanceMeters } from '../lib/geo'
import { LAYER_STATIONS } from '../components/map-editor/constants'

const ROUTE_DRAW_SHORT_DISTANCE_METERS = 500
const ROUTE_DRAW_LONG_DISTANCE_METERS = 2000
const ROUTE_DRAW_SHORT_COLOR = '#EF4444'
const ROUTE_DRAW_LONG_COLOR = '#A855F7'

/**
 * Continuous route drawing preview state, distance calculation, and color gradient.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 * @param {() => maplibregl.Map|null} deps.getMap - Getter for the map instance
 */
export function useRouteDrawPreview({ store, getMap }) {
  function isRouteDrawMode() {
    return store.mode === 'route-draw' || store.mode === 'route-draw-naming'
  }

  const routeDrawPreview = reactive({
    visible: false,
    startLngLat: null,
    endLngLat: null,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    pointerX: 0,
    pointerY: 0,
    distanceMeters: 0,
    lineColor: '#2563EB',
  })

  const routeDrawDistanceLabel = computed(() =>
    Number.isFinite(routeDrawPreview.distanceMeters) ? `${Math.round(routeDrawPreview.distanceMeters)} m` : '',
  )

  const routeDrawDistanceStyle = computed(() => ({
    left: `${routeDrawPreview.pointerX + 14}px`,
    top: `${routeDrawPreview.pointerY + 14}px`,
  }))

  function findStationById(stationId) {
    if (!store.project || !stationId) return null
    return store.project.stations.find((station) => station.id === stationId) || null
  }

  function getActiveLineBaseColor() {
    if (!store.project) return '#2563EB'
    const activeLine = store.project.lines.find((line) => line.id === store.activeLineId)
    return activeLine?.color || '#2563EB'
  }

  function resolveRouteDrawColorByDistance(distanceMeters) {
    if (distanceMeters < ROUTE_DRAW_SHORT_DISTANCE_METERS) return ROUTE_DRAW_SHORT_COLOR
    if (distanceMeters > ROUTE_DRAW_LONG_DISTANCE_METERS) return ROUTE_DRAW_LONG_COLOR
    return getActiveLineBaseColor()
  }

  function clearRouteDrawPreview() {
    routeDrawPreview.visible = false
    routeDrawPreview.startLngLat = null
    routeDrawPreview.endLngLat = null
    routeDrawPreview.distanceMeters = 0
  }

  function refreshRouteDrawPreviewProjectedPoints() {
    const map = getMap()
    if (!map || !routeDrawPreview.visible || !routeDrawPreview.startLngLat || !routeDrawPreview.endLngLat) return
    const startPoint = map.project(routeDrawPreview.startLngLat)
    const endPoint = map.project(routeDrawPreview.endLngLat)
    routeDrawPreview.startX = startPoint.x
    routeDrawPreview.startY = startPoint.y
    routeDrawPreview.endX = endPoint.x
    routeDrawPreview.endY = endPoint.y
  }

  function updateRouteDrawPreview(event) {
    const map = getMap()
    if (!map || !isRouteDrawMode() || !store.pendingEdgeStartStationId) {
      clearRouteDrawPreview()
      return
    }
    const startStation = findStationById(store.pendingEdgeStartStationId)
    if (!startStation?.lngLat) {
      clearRouteDrawPreview()
      return
    }

    const hitStations = map.queryRenderedFeatures(event.point, { layers: [LAYER_STATIONS] })
    const hoveredStationId = hitStations[0]?.properties?.id || null
    const hoveredStation = hoveredStationId ? findStationById(hoveredStationId) : null
    const endLngLat = hoveredStation?.lngLat || [event.lngLat.lng, event.lngLat.lat]
    const distanceMeters = haversineDistanceMeters(startStation.lngLat, endLngLat)

    routeDrawPreview.visible = true
    routeDrawPreview.startLngLat = [...startStation.lngLat]
    routeDrawPreview.endLngLat = [...endLngLat]
    routeDrawPreview.pointerX = event.point.x
    routeDrawPreview.pointerY = event.point.y
    routeDrawPreview.distanceMeters = distanceMeters
    routeDrawPreview.lineColor = resolveRouteDrawColorByDistance(distanceMeters)
    refreshRouteDrawPreviewProjectedPoints()
  }

  return {
    routeDrawPreview,
    routeDrawDistanceLabel,
    routeDrawDistanceStyle,
    clearRouteDrawPreview,
    refreshRouteDrawPreviewProjectedPoints,
    updateRouteDrawPreview,
  }
}
