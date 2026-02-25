import {
  LAYER_EDGE_ANCHORS,
  LAYER_EDGE_ANCHORS_HIT,
  LAYER_EDGES,
  LAYER_EDGES_SQUARE,
  LAYER_EDGES_HIT,
  LAYER_EDGES_SELECTED,
  LAYER_STATIONS,
  LAYER_STATIONS_HIGHLIGHT,
  LAYER_PULSES,
  SOURCE_EDGE_ANCHORS,
  SOURCE_EDGES,
  SOURCE_STATIONS,
  SOURCE_PULSES,
} from './constants'
import {
  buildBoundaryGeoJson,
  buildEdgeAnchorsGeoJson,
  buildEdgesGeoJson,
  buildStationsGeoJson,
} from './dataBuilders'
import { LINE_STYLE_OPTIONS, getLineStyleMap } from '../../lib/lineStyles'

const LAYER_LANDUSE = 'landuse-overlay'
const LAYER_POPULATION_1KM = 'population-overlay-1km'
const LAYER_POPULATION_100M = 'population-overlay-100m'
const LAYER_STATIONS_LABEL = 'railmap-stations-label'
const LAYER_STATIONS_INTERCHANGE = 'railmap-stations-interchange'

const COMMON_LANDUSE_TYPES = [
  'residential',
  'commercial',
  'industrial',
  'retail',
  'school',
  'university',
  'cemetery',
  'military',
  'railway',
  'garages',
  'bus_station',
  'stadium',
]

const LANDUSE_COLORS = {
  residential: '#FFD700',
  commercial: '#FF1493',
  industrial: '#FF4500',
  retail: '#FF1111',
  school: '#87CEEB',
  university: '#9370DB',
  cemetery: '#D3D3D3',
  military: '#808080',
  railway: '#A52A2A',
  garages: '#C0C0C0',
  bus_station: '#FF4444',
  stadium: '#32CD32',
}

const lineStyleIds = LINE_STYLE_OPTIONS.map((item) => item.id)
const doubleLineStyleIds = lineStyleIds.filter((styleId) => getLineStyleMap(styleId).lineGapWidth > 0)
const edgeLayerCaps = {
  nonSquare: 'butt',
  square: 'square',
}

export function buildLineStyleNumericExpression(field) {
  const expression = ['case']
  for (const styleId of lineStyleIds) {
    expression.push(['==', ['get', 'lineStyle'], styleId], getLineStyleMap(styleId)[field])
  }
  expression.push(getLineStyleMap('solid')[field])
  return expression
}

export function buildLineDasharrayExpression() {
  const expression = ['case']
  for (const styleId of lineStyleIds) {
    expression.push(['==', ['get', 'lineStyle'], styleId], ['literal', getLineStyleMap(styleId).dasharray])
  }
  expression.push(['literal', getLineStyleMap('solid').dasharray])
  return expression
}

export function ensureSources(map, store) {
  if (!map) return

  if (!map.getSource(SOURCE_STATIONS)) {
    map.addSource(SOURCE_STATIONS, {
      type: 'geojson',
      data: buildStationsGeoJson(store.project, store.selectedStationIds),
    })
  }

  if (!map.getSource(SOURCE_EDGES)) {
    map.addSource(SOURCE_EDGES, {
      type: 'geojson',
      data: buildEdgesGeoJson(store.project, null, store.selectedEdgeIds),
    })
  }

  if (!map.getSource(SOURCE_EDGE_ANCHORS)) {
    map.addSource(SOURCE_EDGE_ANCHORS, {
      type: 'geojson',
      data: buildEdgeAnchorsGeoJson(store.project, store.selectedEdgeId, store.selectedEdgeAnchor),
    })
  }

  if (!map.getSource('region-boundary')) {
    map.addSource('region-boundary', {
      type: 'geojson',
      data: buildBoundaryGeoJson(store.regionBoundary),
    })
  } else {
    map.getSource('region-boundary').setData(buildBoundaryGeoJson(store.regionBoundary))
  }
}

function updateSelectedEdgeFilter() {
  // No longer needed - selection handled via opacity blink
}

function getStationIdsForSelectedEdges(store) {
  const stationIds = new Set()
  for (const edgeId of store.selectedEdgeIds) {
    const edge = store.project?.edges?.find(e => e.id === edgeId)
    if (edge) {
      stationIds.add(edge.fromStationId)
      stationIds.add(edge.toStationId)
    }
  }
  return [...stationIds]
}

function updateStationVisibilityFilter(map, store) {
  if (!map || !map.getLayer(LAYER_STATIONS)) return
  
  // 布线模式和添加边模式下显示所有站点
  if (store.mode === 'route-draw' || store.mode === 'add-edge') {
    map.setFilter(LAYER_STATIONS, ['==', ['get', 'id'], ['get', 'id']])
    return
  }
  
  const hasSelectedEdges = store.selectedEdgeIds && store.selectedEdgeIds.length > 0
  if (!hasSelectedEdges) {
    map.setFilter(LAYER_STATIONS, ['==', ['get', 'id'], ['get', 'id']])
    return
  }
  const visibleStationIds = getStationIdsForSelectedEdges(store)
  map.setFilter(LAYER_STATIONS, [
    'any',
    ['==', ['get', 'isInterchange'], true],
    ['in', ['get', 'id'], ['literal', visibleStationIds]]
  ])
}

export function updateMapData(map, store) {
  if (!map) return
  const stationSource = map.getSource(SOURCE_STATIONS)
  const edgeSource = map.getSource(SOURCE_EDGES)
  const anchorSource = map.getSource(SOURCE_EDGE_ANCHORS)
  const filterYear = store.timelineFilterYear
  if (stationSource) {
    stationSource.setData(buildStationsGeoJson(store.project, store.selectedStationIds, filterYear))
  }
  if (edgeSource) {
    edgeSource.setData(buildEdgesGeoJson(store.project, filterYear, store.selectedEdgeIds))
  }
  if (anchorSource) {
    anchorSource.setData(buildEdgeAnchorsGeoJson(store.project, store.selectedEdgeId, store.selectedEdgeAnchor))
  }

  const pulseSource = map.getSource(SOURCE_PULSES)
  if (!pulseSource && store.mapPulsesGeoJson) {
    map.addSource(SOURCE_PULSES, {
      type: 'geojson',
      data: store.mapPulsesGeoJson,
    })
  } else if (pulseSource && store.mapPulsesGeoJson) {
    pulseSource.setData(store.mapPulsesGeoJson)
  }

  updateSelectedEdgeFilter(map, store)
  updateStationVisibilityFilter(map, store)
  updateMapDisplayVisibility(map, store)
}

export function ensureMapLayers(map, store) {
  if (!map) return

  if (!map.getLayer(LAYER_EDGES_HIT)) {
    map.addLayer({
      id: LAYER_EDGES_HIT,
      type: 'line',
      source: SOURCE_EDGES,
      paint: {
        'line-color': '#000000',
        'line-width': 22,
        'line-opacity': 0.001,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    })
  }

  const edgePaint = {
    'line-color': ['coalesce', ['get', 'color'], '#2563EB'],
    'line-width': buildLineStyleNumericExpression('lineWidth'),
    'line-gap-width': buildLineStyleNumericExpression('lineGapWidth'),
    'line-opacity': 0.88,
    'line-dasharray': buildLineDasharrayExpression(),
  }

  if (!map.getLayer(LAYER_EDGES)) {
    map.addLayer({
      id: LAYER_EDGES,
      type: 'line',
      source: SOURCE_EDGES,
      paint: edgePaint,
      layout: {
        'line-cap': edgeLayerCaps.nonSquare,
        'line-join': 'round',
      },
    })
  }

  if (!map.getLayer(LAYER_EDGES_SQUARE)) {
    map.addLayer({
      id: LAYER_EDGES_SQUARE,
      type: 'line',
      source: SOURCE_EDGES,
      filter: ['boolean', false],
      paint: edgePaint,
      layout: {
        'line-cap': edgeLayerCaps.square,
        'line-join': 'round',
      },
    })
  }

  updateSelectedEdgeFilter(map, store)

  if (!map.getLayer(LAYER_EDGE_ANCHORS_HIT)) {
    map.addLayer({
      id: LAYER_EDGE_ANCHORS_HIT,
      type: 'circle',
      source: SOURCE_EDGE_ANCHORS,
      paint: {
        'circle-radius': 12,
        'circle-color': '#000000',
        'circle-opacity': 0.001,
      },
    })
  }

  if (!map.getLayer(LAYER_EDGE_ANCHORS)) {
    map.addLayer({
      id: LAYER_EDGE_ANCHORS,
      type: 'circle',
      source: SOURCE_EDGE_ANCHORS,
      paint: {
        'circle-radius': ['case', ['==', ['get', 'isSelected'], true], 6, 5],
        'circle-color': ['case', ['==', ['get', 'isSelected'], true], '#F97316', '#38BDF8'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#082F49',
        'circle-opacity': 0.95,
      },
    })
  }

  if (!map.getLayer(LAYER_STATIONS_HIGHLIGHT)) {
    map.addLayer({
      id: LAYER_STATIONS_HIGHLIGHT,
      type: 'circle',
      source: SOURCE_STATIONS,
      paint: {
        'circle-radius': 14,
        'circle-color': '#F59E0B',
        'circle-opacity': 0.35,
        'circle-blur': 0.6,
      },
    })
    map.setLayoutProperty(LAYER_STATIONS_HIGHLIGHT, 'visibility', store.highlightStationLocations ? 'visible' : 'none')
  }

  if (!map.getLayer(LAYER_STATIONS)) {
    map.addLayer({
      id: LAYER_STATIONS,
      type: 'circle',
      source: SOURCE_STATIONS,
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'isSelected'], true], 8,
          5,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'proposed'], true],
          '#1a1a1f',
          ['==', ['get', 'underConstruction'], true],
          '#1a1a1f',
          '#ffffff',
        ],
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'isSelected'], true],
          3,
          2.5,
        ],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'proposed'], true],
          '#475a74',
          ['==', ['get', 'underConstruction'], true],
          '#ff4d88',
          '#bc1fff',
        ],
        'circle-stroke-opacity': 0.9,
      },
    })
    updateStationVisibilityFilter(map, store)
  }

  if (!map.getLayer(LAYER_STATIONS_INTERCHANGE)) {
    map.addLayer({
      id: LAYER_STATIONS_INTERCHANGE,
      type: 'circle',
      source: SOURCE_STATIONS,
      filter: ['==', ['get', 'isInterchange'], true],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7.5, 14, 10.5],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#f900bf',
        'circle-stroke-opacity': 0, // 默认隐藏，由 HTML Marker 代替
      },
    })
  }

  if (!map.getLayer(LAYER_PULSES) && map.getSource(SOURCE_PULSES)) {
    map.addLayer({
      id: LAYER_PULSES,
      type: 'circle',
      source: SOURCE_PULSES,
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacity'],
        'circle-blur': 0.4,
      },
    })
  }

  if (!map.getLayer(LAYER_STATIONS_LABEL)) {
    map.addLayer({
      id: LAYER_STATIONS_LABEL,
      type: 'symbol',
      source: SOURCE_STATIONS,
      layout: {
        'text-field': [
          'case',
          ['>', ['length', ['coalesce', ['get', 'nameEn'], '']], 0],
          [
            'format',
            ['coalesce', ['get', 'nameZh'], ''],
            {},
            '\n',
            {},
            ['get', 'nameEn'],
            { 'font-scale': 0.8 },
          ],
          ['coalesce', ['get', 'nameZh'], ''],
        ],
        'text-font': ['Noto Sans CJK SC Regular', 'Noto Sans Regular'],
        'text-size': 12,
        'text-offset': [
          'case',
          ['==', ['get', 'isInterchange'], true],
          ['literal', [1.4, 0.2]],
          ['literal', [0.8, 0.2]],
        ],
        'text-anchor': 'left',
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      },
    })
  }

  updateMapDisplayVisibility(map, store)
}

export function setStationHighlightVisibility(map, visible) {
  if (!map || !map.getLayer(LAYER_STATIONS_HIGHLIGHT)) return
  map.setLayoutProperty(LAYER_STATIONS_HIGHLIGHT, 'visibility', visible ? 'visible' : 'none')
}

export function updateMapDisplayVisibility(map, store) {
  if (!map) return
  const darkBasemap = store.mapTileType === 'dark'
  if (map.getLayer(LAYER_STATIONS)) {
    map.setLayoutProperty(LAYER_STATIONS, 'visibility', store.showStationMarkers ? 'visible' : 'none')
    if (store.showStationMarkers) {
      updateStationVisibilityFilter(map, store)
    }
  }
  if (map.getLayer(LAYER_STATIONS_LABEL)) {
    map.setLayoutProperty(LAYER_STATIONS_LABEL, 'visibility', store.showStationLabels ? 'visible' : 'none')
    map.setPaintProperty(LAYER_STATIONS_LABEL, 'text-color', darkBasemap ? '#eef3ff' : '#111827')
    map.setPaintProperty(LAYER_STATIONS_LABEL, 'text-halo-color', darkBasemap ? 'rgba(5, 5, 5, 0.85)' : '#ffffff')
    map.setPaintProperty(LAYER_STATIONS_LABEL, 'text-halo-width', darkBasemap ? 2 : 1.4)
  }
  if (map.getLayer(LAYER_STATIONS_INTERCHANGE)) {
    // 始终隐藏静态换乘标识，改用动态 HTML Marker
    map.setPaintProperty(LAYER_STATIONS_INTERCHANGE, 'circle-stroke-opacity', 0)
  }
}

export function ensureLanduseLayer(map, store) {
  if (!map) return

  if (!store.protomapsApiKey) {
    console.warn('Protomaps API Key not configured. Please set it in Settings > Configure Protomaps API Key')
    removeLanduseLayer(map)
    return
  }

  if (!map.getSource('protomaps')) {
    try {
      map.addSource('protomaps', {
        type: 'vector',
        url: `https://api.protomaps.com/tiles/v4.json?key=${store.protomapsApiKey}`,
        attribution: '© Protomaps © OpenStreetMap contributors',
      })
    } catch (e) {
      console.error('Failed to add protomaps source:', e)
      return
    }
  }

  if (!map.getLayer(LAYER_LANDUSE)) {
    try {
      const colorExpression = ['case']
      for (const [landuse, color] of Object.entries(LANDUSE_COLORS)) {
        colorExpression.push(['==', ['get', 'kind'], landuse], color)
      }
      colorExpression.push('#E8F4C6')

      const beforeLayer = getOverlayAnchorLayer(map)
      const layerDef = {
        id: LAYER_LANDUSE,
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landuse',
        paint: {
          'fill-color': colorExpression,
          'fill-opacity': 0.75,
        },
      }
      if (beforeLayer) map.addLayer(layerDef, beforeLayer)
      else map.addLayer(layerDef)
      normalizeOverlayOrder(map)
    } catch (e) {
      console.error('Failed to add landuse layer:', e)
      return
    }
  }

  updateLanduseVisibility(map, store.overlayLayers.includes('zoning'))
}

export function removeLanduseLayer(map) {
  if (!map) return

  if (map.getLayer(LAYER_LANDUSE)) {
    map.removeLayer(LAYER_LANDUSE)
  }

  if (map.getSource('protomaps')) {
    map.removeSource('protomaps')
  }
}

export function updateLanduseVisibility(map, visible) {
  if (!map || !map.getLayer(LAYER_LANDUSE)) return
  map.setLayoutProperty(LAYER_LANDUSE, 'visibility', visible ? 'visible' : 'none')
}

const WORLDPOP_BASE = 'https://worldpop.arcgis.com/arcgis/rest/services'
const DEFAULT_POP_YEAR = 2020

function clampPopulationYear(year) {
  const n = Number.isFinite(Number(year)) ? Math.floor(Number(year)) : DEFAULT_POP_YEAR
  return Math.max(2000, Math.min(2020, n))
}

export function getPopulationYearFromStore(store) {
  const sourceYear = store?.timelineFilterYear ?? store?.currentEditYear ?? DEFAULT_POP_YEAR
  return clampPopulationYear(sourceYear)
}

// 50-step population density color ramp (log-spaced thresholds, interpolated yellow→red)
const POP_STOPS = [[1,[255,255,178]],[100,[254,217,118]],[1000,[253,141,60]],[5000,[227,26,28]],[20000,[128,0,38]]]

function buildPopRamp(n) {
  const thresholds = [0]
  for (let i = 1; i <= n; i++) thresholds.push(Math.round(Math.pow(20000, i / n)))
  const colormap = [[0, 0, 0, 0]]
  const ranges = [], outputs = []
  for (let i = 0; i < n; i++) {
    ranges.push(thresholds[i], thresholds[i + 1])
    outputs.push(i + 1)
    const v = thresholds[i + 1]
    let lo = POP_STOPS[0], hi = POP_STOPS[POP_STOPS.length - 1]
    for (let j = 0; j < POP_STOPS.length - 1; j++) {
      if (v <= POP_STOPS[j + 1][0]) { lo = POP_STOPS[j]; hi = POP_STOPS[j + 1]; break }
    }
    const t = Math.min(1, (Math.log(v) - Math.log(lo[0] || 1)) / (Math.log(hi[0]) - Math.log(lo[0] || 1)))
    colormap.push([i + 1, Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t), Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t), Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t)])
  }
  ranges.push(thresholds[n], 1e9)
  outputs.push(n + 1)
  colormap.push([n + 1, 128, 0, 38])
  return { colormap, ranges, outputs }
}

const _ramp = buildPopRamp(255)

function getOverlayAnchorLayer(map) {
  if (map.getLayer(LAYER_STATIONS_LABEL)) return LAYER_STATIONS_LABEL
  if (map.getLayer(LAYER_STATIONS)) return LAYER_STATIONS
  return null
}

function moveLayerSafe(map, layerId, beforeId) {
  if (!map.getLayer(layerId)) return
  if (beforeId && map.getLayer(beforeId)) map.moveLayer(layerId, beforeId)
  else map.moveLayer(layerId)
}

function normalizeOverlayOrder(map) {
  if (!map) return
  const anchor = getOverlayAnchorLayer(map)
  moveLayerSafe(map, LAYER_LANDUSE, anchor)
  moveLayerSafe(map, LAYER_POPULATION_1KM, anchor)
  moveLayerSafe(map, LAYER_POPULATION_100M, anchor)
}

function worldpopTileUrl(resolution, year) {
  const ts = Date.UTC(year, 0, 1)
  const mosaicRule = encodeURIComponent(JSON.stringify({
    multidimensionalDefinition: [{
      dimensionName: 'StdTime',
      values: [ts],
      isSlice: true,
    }],
  }))
  const rule = encodeURIComponent(JSON.stringify({
    rasterFunction: 'Colormap',
    rasterFunctionArguments: {
      Colormap: _ramp.colormap,
      Raster: {
        rasterFunction: 'Remap',
        rasterFunctionArguments: {
          InputRanges: _ramp.ranges,
          OutputValues: _ramp.outputs,
          AllowUnmatched: false,
        },
      },
    },
  }))
  return `${WORLDPOP_BASE}/WorldPop_Population_Density_${resolution}/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&f=image&noData=0&noDataInterpretation=esriNoDataMatchAny&renderingRule=${rule}&mosaicRule=${mosaicRule}&time=${ts},${ts}&year=${year}`
}

let _currentPopYear = DEFAULT_POP_YEAR

function updateOrAddSource(map, srcId, tileUrl, attr) {
  const existing = map.getSource(srcId)
  if (existing) {
    existing.setTiles([tileUrl])
  } else {
    map.addSource(srcId, { type: 'raster', tileSize: 512, attribution: attr, tiles: [tileUrl] })
  }
}

export function ensurePopulationLayer(map, year) {
  if (!map) return
  const yr = year ?? _currentPopYear
  _currentPopYear = yr
  const beforeLayer = getOverlayAnchorLayer(map)
  const attr = '© WorldPop / Esri (CC BY 4.0)'

  // 1km layer: zoom 0–8
  const src1km = 'worldpop-density-1km'
  try { updateOrAddSource(map, src1km, worldpopTileUrl('1km', yr), attr) }
  catch (e) { console.error('Failed to setup 1km population source:', e); return }
  if (!map.getLayer(LAYER_POPULATION_1KM)) {
    try {
      const layerDef = { id: LAYER_POPULATION_1KM, type: 'raster', source: src1km,
        maxzoom: 9, paint: { 'raster-opacity': 0.35 },
      }
      if (beforeLayer) map.addLayer(layerDef, beforeLayer)
      else map.addLayer(layerDef)
    } catch (e) { console.error('Failed to add 1km population layer:', e) }
  }

  // 100m layer: zoom 9+
  const src100m = 'worldpop-density-100m'
  try { updateOrAddSource(map, src100m, worldpopTileUrl('100m', yr), attr) }
  catch (e) { console.error('Failed to setup 100m population source:', e); return }
  if (!map.getLayer(LAYER_POPULATION_100M)) {
    try {
      const layerDef = { id: LAYER_POPULATION_100M, type: 'raster', source: src100m,
        minzoom: 9, paint: { 'raster-opacity': 0.35 },
      }
      if (beforeLayer) map.addLayer(layerDef, beforeLayer)
      else map.addLayer(layerDef)
    } catch (e) { console.error('Failed to add 100m population layer:', e) }
  }

  normalizeOverlayOrder(map)
}

export function removePopulationLayer(map) {
  if (!map) return
  for (const [layer, src] of [[LAYER_POPULATION_1KM, 'worldpop-density-1km'], [LAYER_POPULATION_100M, 'worldpop-density-100m']]) {
    if (map.getLayer(layer)) map.removeLayer(layer)
    if (map.getSource(src)) map.removeSource(src)
  }
}

export function setPopulationYear(map, year) {
  if (!map) return
  const nextYear = clampPopulationYear(year)
  if (nextYear === _currentPopYear && map.getSource('worldpop-density-1km')) return
  ensurePopulationLayer(map, nextYear)
}

const OVERLAY_HANDLERS = {
  zoning: { ensure: ensureLanduseLayer, remove: removeLanduseLayer },
  population: { ensure: (map, store) => ensurePopulationLayer(map, getPopulationYearFromStore(store)), remove: removePopulationLayer },
}

export function ensureOverlay(map, store, id) {
  const h = OVERLAY_HANDLERS[id]
  if (h) h.ensure(map, store)
}

export function removeOverlay(map, id) {
  const h = OVERLAY_HANDLERS[id]
  if (h) h.remove(map)
}

export function syncOverlays(map, store) {
  for (const id of Object.keys(OVERLAY_HANDLERS)) {
    if (store.overlayLayers.includes(id)) ensureOverlay(map, store, id)
    else removeOverlay(map, id)
  }
  normalizeOverlayOrder(map)
}

export { COMMON_LANDUSE_TYPES, LANDUSE_COLORS }

let _blinkTimer = 0
export function startSelectionBlink(map) {
  stopSelectionBlink()
  let phase = 0
  const tick = () => {
    phase = (phase + 1) % 270
    const sel = 0.15 + 0.73 * (0.5 + 0.5 * Math.sin(phase / 270 * Math.PI * 2))
    const expr = ['case', ['==', ['get', 'isSelected'], true], sel, 0.88]
    for (const id of [LAYER_EDGES, LAYER_EDGES_SQUARE]) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', expr)
    }
    _blinkTimer = requestAnimationFrame(tick)
  }
  _blinkTimer = requestAnimationFrame(tick)
}

export function stopSelectionBlink() {
  if (_blinkTimer) cancelAnimationFrame(_blinkTimer)
  _blinkTimer = 0
}
