import { watch, onBeforeUnmount } from 'vue'

const SOURCE_REACH_POINTS = 'metro-studio-reach-points'
const SOURCE_REACH_ORIGIN = 'metro-studio-reach-origin'

const LAYER_REACH_CIRCLES = 'metro-studio-reach-circles'
const LAYER_REACH_LABELS = 'metro-studio-reach-labels'
const LAYER_REACH_ORIGIN = 'metro-studio-reach-origin-circle'

const ALL_LAYERS = [LAYER_REACH_LABELS, LAYER_REACH_CIRCLES, LAYER_REACH_ORIGIN]
const ALL_SOURCES = [SOURCE_REACH_POINTS, SOURCE_REACH_ORIGIN]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

export function useMapReachability({ store, getMap }) {

  function removeLayers(map) {
    for (const id of ALL_LAYERS) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    for (const id of ALL_SOURCES) {
      if (map.getSource(id)) map.removeSource(id)
    }
  }

  function ensureSources(map) {
    if (!map.getSource(SOURCE_REACH_POINTS)) {
      map.addSource(SOURCE_REACH_POINTS, { type: 'geojson', data: EMPTY_FC })
    }
    if (!map.getSource(SOURCE_REACH_ORIGIN)) {
      map.addSource(SOURCE_REACH_ORIGIN, { type: 'geojson', data: EMPTY_FC })
    }
  }

  function ensureLayers(map) {
    if (!map.getLayer(LAYER_REACH_CIRCLES)) {
      map.addLayer({
        id: LAYER_REACH_CIRCLES,
        type: 'circle',
        source: SOURCE_REACH_POINTS,
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      })
    }
    if (!map.getLayer(LAYER_REACH_LABELS)) {
      map.addLayer({
        id: LAYER_REACH_LABELS,
        type: 'symbol',
        source: SOURCE_REACH_POINTS,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.4],
          'text-anchor': 'bottom',
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': '#e0e0e0',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
        },
      })
    }
    if (!map.getLayer(LAYER_REACH_ORIGIN)) {
      map.addLayer({
        id: LAYER_REACH_ORIGIN,
        type: 'circle',
        source: SOURCE_REACH_ORIGIN,
        paint: {
          'circle-radius': 10,
          'circle-color': '#f900bf',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
  }

  function buildPointsGeoJson() {
    const result = store.reachability.result
    if (!result) return EMPTY_FC
    const features = []
    for (const band of result.bands) {
      for (const s of band.stations) {
        if (!s.lngLat) continue
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: s.lngLat },
          properties: { label: s.name, color: band.color },
        })
      }
    }
    return { type: 'FeatureCollection', features }
  }

  function buildOriginGeoJson() {
    const result = store.reachability.result
    if (!result?.originLngLat) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: result.originLngLat },
        properties: {},
      }],
    }
  }

  function updateLayers() {
    const map = getMap()
    if (!map || !map.isStyleLoaded()) return
    ensureSources(map)
    ensureLayers(map)
    const ptsSrc = map.getSource(SOURCE_REACH_POINTS)
    const oriSrc = map.getSource(SOURCE_REACH_ORIGIN)
    if (ptsSrc) ptsSrc.setData(buildPointsGeoJson())
    if (oriSrc) oriSrc.setData(buildOriginGeoJson())
  }

  function clearLayers() {
    const map = getMap()
    if (!map || !map.isStyleLoaded()) return
    removeLayers(map)
  }

  function initReachability(map) {
    // no click handler needed — driven by dialog
  }

  function destroyReachability() {
    const map = getMap()
    if (map && map.isStyleLoaded()) removeLayers(map)
  }

  watch(
    () => ({
      active: store.reachability.active,
      result: store.reachability.result,
    }),
    (val) => {
      if (!val.active || !val.result) {
        clearLayers()
        return
      }
      updateLayers()
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    destroyReachability()
  })

  return { initReachability, destroyReachability }
}
