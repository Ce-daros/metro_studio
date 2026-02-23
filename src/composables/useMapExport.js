import maplibregl from 'maplibre-gl'
import JSZip from 'jszip'
import { LAYER_STATIONS } from '../components/map-editor/constants'
import { buildInterchangeMarkerEntries } from '../components/map-editor/interchangeMarkersShared'
import { collectProjectBounds, sanitizeFileName } from '../components/map-editor/dataBuilders'
import { buildMapStyle, TILE_SOURCES } from '../components/map-editor/mapStyle'
import {
  ensureMapLayers,
  ensureSources,
  getPopulationYearFromStore,
  setPopulationYear,
  syncOverlays,
  updateMapData,
  updateMapDisplayVisibility,
} from '../components/map-editor/mapLayers'
import { isTrial, TRIAL_LIMITS } from './useLicense'

const RESOLUTION_PRESET_LONG_EDGE = Object.freeze({
  '2k': 2048,
  '4k': 4096,
  '8k': 8192,
})

const HIGH_RES_TILE_SIZE = 2048
const MAX_SINGLE_CANVAS_EDGE = 16384
const MAX_SINGLE_CANVAS_AREA = 268435456
const WEB_MERCATOR_MAX_LAT = 85.05112878

/**
 * PNG export full workflow for the map editor.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 * @param {() => maplibregl.Map|null} deps.getMap - Getter for the map instance
 */
export function useMapExport({ store, getMap }) {
  function updateActualRouteProgress(patch) {
    const prev = store.actualRouteExportProgress || {}
    const startedAt = Number.isFinite(prev.startedAt) ? prev.startedAt : Date.now()
    const next = {
      active: true,
      phase: 'running',
      message: '',
      done: 0,
      total: 0,
      percent: 0,
      etaSeconds: null,
      workerCount: prev.workerCount || 1,
      startedAt,
      ...prev,
      ...patch,
    }

    if (Number.isFinite(next.total) && next.total > 0) {
      const safeDone = Math.max(0, Math.min(next.total, Number(next.done) || 0))
      next.done = safeDone
      next.percent = Math.max(0, Math.min(100, Math.round((safeDone / next.total) * 100)))
      const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
      if (safeDone > 0 && safeDone < next.total) {
        const speed = safeDone / elapsedSeconds
        const remaining = Math.max(0, next.total - safeDone)
        next.etaSeconds = speed > 0 ? Math.ceil(remaining / speed) : null
      } else {
        next.etaSeconds = 0
      }
    } else {
      next.percent = Number.isFinite(next.percent) ? Math.max(0, Math.min(100, Math.round(next.percent))) : 0
      next.etaSeconds = null
    }

    store.actualRouteExportProgress = next
  }

  function clearActualRouteProgress({ message = '', failed = false } = {}) {
    const prev = store.actualRouteExportProgress || {}
    const done = Number(prev.done) || 0
    const total = Number(prev.total) || done
    store.actualRouteExportProgress = {
      ...prev,
      active: false,
      phase: failed ? 'error' : 'done',
      message: message || prev.message || '',
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : failed ? 0 : 100,
      etaSeconds: failed ? null : 0,
      startedAt: prev.startedAt || Date.now(),
    }
  }

  function traceActualExport(step, payload) {
    const suffix = payload == null ? '' : ` ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
    store.statusText = `[地图导出] ${step}${suffix}`
  }

  function resolveMap(mapInstance) {
    const map = mapInstance || getMap()
    if (!map) throw new Error('真实地图未初始化')
    return map
  }

  function resolveLongEdgePx(resolutionPreset) {
    if (typeof resolutionPreset === 'number' && Number.isFinite(resolutionPreset)) {
      const rounded = Math.round(resolutionPreset)
      return rounded >= 1024 ? rounded : null
    }
    const key = String(resolutionPreset || '').trim().toLowerCase()
    if (['12k', '16k', '24k'].includes(key)) return RESOLUTION_PRESET_LONG_EDGE['8k']
    return RESOLUTION_PRESET_LONG_EDGE[key] || null
  }

  function normalizeBasemap(basemap) {
    const key = String(basemap || '').trim()
    return TILE_SOURCES[key] ? key : store.mapTileType || 'osm'
  }

  function waitForMapIdle(mapInstance, { timeoutMs = 5000 } = {}) {
    const map = resolveMap(mapInstance)
    if (map.loaded() && !map.isMoving()) return Promise.resolve()

    return new Promise((resolve) => {
      let done = false
      let timeoutId = 0

      const finish = () => {
        if (done) return
        done = true
        map.off('idle', onIdle)
        if (timeoutId) window.clearTimeout(timeoutId)
        resolve()
      }

      const onIdle = () => {
        finish()
      }

      map.once('idle', onIdle)
      timeoutId = window.setTimeout(() => {
        traceActualExport('等待 idle 超时，切换稳定帧兜底')
        finish()
      }, timeoutMs)
    })
  }

  function waitForMapRenderFrame(mapInstance) {
    const map = resolveMap(mapInstance)
    return new Promise((resolve) => {
      map.once('render', resolve)
      map.triggerRepaint()
    })
  }

  async function waitForMapStable(
    mapInstance,
    { timeoutMs = 6500, idleTimeoutMs = 2500, stableFrames = 3 } = {},
  ) {
    const map = resolveMap(mapInstance)
    await waitForMapIdle(map, { timeoutMs: idleTimeoutMs })

    const deadline = Date.now() + timeoutMs
    let stableCount = 0

    while (Date.now() < deadline) {
      await waitForMapRenderFrame(map)
      await new Promise((resolve) => requestAnimationFrame(resolve))

      if (map.loaded() && !map.isMoving()) {
        stableCount += 1
        if (stableCount >= stableFrames) return
      } else {
        stableCount = 0
      }
    }
  }

  async function fitMapToProjectForExport(project, mapInstance) {
    const map = resolveMap(mapInstance)
    const bounds = collectProjectBounds(project)
    if (!bounds) return

    const lngSpan = Math.abs(bounds.maxLng - bounds.minLng)
    const latSpan = Math.abs(bounds.maxLat - bounds.minLat)
    if (lngSpan < 1e-6 && latSpan < 1e-6) {
      map.jumpTo({
        center: [bounds.minLng, bounds.minLat],
        zoom: Math.max(map.getZoom(), 13.5),
        bearing: 0,
        pitch: 0,
      })
      await waitForMapRenderFrame(map)
      return
    }

    map.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      {
        padding: { top: 52, bottom: 52, left: 52, right: 52 },
        maxZoom: 16,
        bearing: 0,
        pitch: 0,
        duration: 0,
      },
    )
    await waitForMapStable(map)
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error('导出失败'))
      }, 'image/png')
    })
  }

  async function blobHasVisualContent(blob) {
    try {
      const probe = document.createElement('canvas')
      probe.width = 32
      probe.height = 32
      const context = probe.getContext('2d', { willReadFrequently: true })
      if (!context) return true

      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob)
        try {
          context.drawImage(bitmap, 0, 0, probe.width, probe.height)
        } finally {
          bitmap.close?.()
        }
      } else {
        const image = await loadBlobAsImage(blob)
        context.drawImage(image, 0, 0, probe.width, probe.height)
      }

      const { data } = context.getImageData(0, 0, probe.width, probe.height)
      let nonTransparent = 0
      let minLum = 255
      let maxLum = 0

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]
        if (alpha <= 8) continue
        nonTransparent += 1
        const lum = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3)
        if (lum < minLum) minLum = lum
        if (lum > maxLum) maxLum = lum
      }

      if (nonTransparent < 40) return false
      return maxLum - minLum > 18
    } catch {
      return true
    }
  }

  function loadBlobAsImage(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      const objectUrl = URL.createObjectURL(blob)
      image.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(image)
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('无法读取导出图像'))
      }
      image.src = objectUrl
    })
  }

  function clampLatitude(lat) {
    return Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, lat))
  }

  function lngLatToNormalizedMercator(lng, lat) {
    const clampedLat = clampLatitude(lat)
    const x = (lng + 180) / 360
    const rad = clampedLat * Math.PI / 180
    const y = (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2
    return { x, y }
  }

  function normalizedMercatorToLngLat(x, y) {
    const wrappedX = x - Math.floor(x)
    const clampedY = Math.max(1e-7, Math.min(1 - 1e-7, y))
    const lng = wrappedX * 360 - 180
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * clampedY))) * 180 / Math.PI
    return [lng, lat]
  }

  function expandBounds(bounds, paddingRatio = 0.04) {
    const lngSpan = Math.max(1e-4, Math.abs(bounds.maxLng - bounds.minLng))
    const latSpan = Math.max(1e-4, Math.abs(bounds.maxLat - bounds.minLat))
    const lngPad = lngSpan * paddingRatio
    const latPad = latSpan * paddingRatio

    return {
      minLng: bounds.minLng - lngPad,
      maxLng: bounds.maxLng + lngPad,
      minLat: clampLatitude(bounds.minLat - latPad),
      maxLat: clampLatitude(bounds.maxLat + latPad),
    }
  }

  function computeHighResPlan(bounds, longEdgePx) {
    const expanded = expandBounds(bounds)
    const nw = lngLatToNormalizedMercator(expanded.minLng, expanded.maxLat)
    const se = lngLatToNormalizedMercator(expanded.maxLng, expanded.minLat)

    const minNormX = Math.min(nw.x, se.x)
    const maxNormX = Math.max(nw.x, se.x)
    const minNormY = Math.min(nw.y, se.y)
    const maxNormY = Math.max(nw.y, se.y)
    const spanNormX = Math.max(1e-8, maxNormX - minNormX)
    const spanNormY = Math.max(1e-8, maxNormY - minNormY)

    let outputWidth = 0
    let outputHeight = 0
    if (spanNormX >= spanNormY) {
      outputWidth = longEdgePx
      outputHeight = Math.max(1, Math.round(longEdgePx * (spanNormY / spanNormX)))
    } else {
      outputHeight = longEdgePx
      outputWidth = Math.max(1, Math.round(longEdgePx * (spanNormX / spanNormY)))
    }

    const zoomByX = Math.log2(outputWidth / (512 * spanNormX))
    const zoomByY = Math.log2(outputHeight / (512 * spanNormY))
    const zoom = Math.max(0, Math.min(20, Math.min(zoomByX, zoomByY)))

    return {
      outputWidth,
      outputHeight,
      minNormX,
      minNormY,
      spanNormX,
      spanNormY,
      zoom,
      bounds: expanded,
    }
  }

  function computeParallelWorkers(totalTiles, longEdgePx) {
    const hardwareThreads = Math.max(1, Number(navigator.hardwareConcurrency) || 4)
    const deviceMemory = Math.max(2, Number(navigator.deviceMemory) || 8)
    const byCpu = Math.max(1, Math.floor(hardwareThreads * 0.6))
    const byMemory = Math.max(1, Math.floor(deviceMemory * 0.9))
    let cap = Math.max(1, Math.min(10, byCpu, byMemory))

    if (longEdgePx >= 8192) {
      const highResCap = deviceMemory >= 16 ? 8 : deviceMemory >= 8 ? 6 : 4
      cap = Math.min(cap, highResCap)
    }

    let workers = Math.max(1, Math.min(cap, totalTiles))
    if (totalTiles >= 6) workers = Math.max(2, workers)
    return workers
  }

  function buildHighResTileTasks(plan) {
    const cols = Math.ceil(plan.outputWidth / HIGH_RES_TILE_SIZE)
    const rows = Math.ceil(plan.outputHeight / HIGH_RES_TILE_SIZE)
    const tasks = []

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const offsetX = col * HIGH_RES_TILE_SIZE
        const offsetY = row * HIGH_RES_TILE_SIZE
        const drawWidth = Math.min(HIGH_RES_TILE_SIZE, plan.outputWidth - offsetX)
        const drawHeight = Math.min(HIGH_RES_TILE_SIZE, plan.outputHeight - offsetY)
        const centerNormX = plan.minNormX + ((offsetX + HIGH_RES_TILE_SIZE / 2) / plan.outputWidth) * plan.spanNormX
        const centerNormY = plan.minNormY + ((offsetY + HIGH_RES_TILE_SIZE / 2) / plan.outputHeight) * plan.spanNormY
        const [centerLng, centerLat] = normalizedMercatorToLngLat(centerNormX, centerNormY)

        tasks.push({
          row,
          col,
          offsetX,
          offsetY,
          drawWidth,
          drawHeight,
          centerLng,
          centerLat,
        })
      }
    }

    return {
      cols,
      rows,
      tasks,
    }
  }

  function createOffscreenContainer(sizePx) {
    const container = document.createElement('div')
    container.setAttribute('aria-hidden', 'true')
    Object.assign(container.style, {
      position: 'fixed',
      left: '-100000px',
      top: '-100000px',
      width: `${sizePx}px`,
      height: `${sizePx}px`,
      pointerEvents: 'none',
      opacity: '0',
      overflow: 'hidden',
      zIndex: '-1',
    })
    document.body.appendChild(container)
    return container
  }

  async function createOffscreenExportMap({ tileType, sizePx }) {
    const container = createOffscreenContainer(sizePx)
    const map = new maplibregl.Map({
      container,
      style: buildMapStyle(tileType),
      center: [110, 34],
      zoom: 4,
      bearing: 0,
      pitch: 0,
      dragRotate: false,
      touchPitch: false,
      maxPitch: 0,
      boxZoom: false,
      interactive: false,
      preserveDrawingBuffer: true,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: 1,
    })

    await new Promise((resolve) => {
      if (map.loaded()) {
        resolve()
        return
      }
      map.once('load', resolve)
    })

    return {
      map,
      destroy() {
        try {
          map.remove()
        } finally {
          container.remove()
        }
      },
    }
  }

  function prepareOffscreenMapData(map, basemapType) {
    const renderStore = {
      ...store,
      mapTileType: basemapType,
    }

    ensureSources(map, renderStore)
    ensureMapLayers(map, renderStore)
    updateMapData(map, renderStore)
    updateMapDisplayVisibility(map, renderStore)
    syncOverlays(map, renderStore)

    if (renderStore.overlayLayers.includes('population')) {
      setPopulationYear(map, getPopulationYearFromStore(renderStore))
    }
  }

  function buildDefaultStationsLabelOffsetExpression() {
    return [
      'case',
      ['==', ['get', 'isInterchange'], true],
      ['literal', [1.4, 0.2]],
      ['literal', [0.8, 0.2]],
    ]
  }

  function buildExportStationsLabelOffsetExpression({
    project,
    lineById,
    zoom,
    markerStyle,
    renderInterchangeMarkers,
  }) {
    const fallback = buildDefaultStationsLabelOffsetExpression()
    if (!renderInterchangeMarkers) return fallback

    const effectiveLineById = lineById && typeof lineById.get === 'function'
      ? lineById
      : new Map((project?.lines || []).map((line) => [line.id, line]))
    const markers = buildInterchangeMarkerEntries({
      stations: project?.stations || [],
      lineById: effectiveLineById,
      zoom,
      visible: true,
    })
    if (!markers.length) return fallback

    const offsetMatch = ['match', ['get', 'id']]
    const fontSize = 12
    const haloPaddingPx = 2.4
    const markerSafeGapPx = markerStyle === 'pie' ? 8 : 11

    function pushMatchKeysForStationId(stationId, value) {
      const keySet = new Set([stationId])
      const asString = String(stationId)
      if (asString) keySet.add(asString)
      const asNumber = Number(stationId)
      if (Number.isFinite(asNumber)) keySet.add(asNumber)
      for (const key of keySet) {
        offsetMatch.push(key, value)
      }
    }

    for (const marker of markers) {
      const widthPx = markerStyle === 'pie' ? marker.pieContainerSize : marker.containerSize
      const halfWidthPx = widthPx / 2
      // Marker is composited after the map canvas, so label needs extra gap
      // beyond pure half-width to avoid the halo/text being visually covered.
      const safeOffsetPx = halfWidthPx + markerSafeGapPx + haloPaddingPx
      const offsetXEm = Math.max(1.85, Number((safeOffsetPx / fontSize).toFixed(2)))
      pushMatchKeysForStationId(marker.id, ['literal', [offsetXEm, 0.14]])
    }
    offsetMatch.push(['literal', [1.85, 0.14]])

    return [
      'case',
      ['==', ['get', 'isInterchange'], true],
      offsetMatch,
      ['literal', [0.86, 0.2]],
    ]
  }

  function applyActualExportDisplayOverrides(map, stationVisibilityMode, options = {}) {
    const labelLayerId = 'railmap-stations-label'
    const stationLayerId = LAYER_STATIONS
    const hasLabelLayer = Boolean(map.getLayer(labelLayerId))
    const hasStationLayer = Boolean(map.getLayer(stationLayerId))
    const previousStationVisibility = hasStationLayer ? map.getLayoutProperty(stationLayerId, 'visibility') || 'visible' : 'visible'
    const previousStationFilter = hasStationLayer ? map.getFilter(stationLayerId) : null
    const previousTextOffset = hasLabelLayer ? map.getLayoutProperty(labelLayerId, 'text-offset') : null

    if (hasLabelLayer) {
      const labelOffset = buildExportStationsLabelOffsetExpression({
        project: options.project || store.project,
        lineById: options.lineById,
        zoom: Number.isFinite(options.zoom) ? options.zoom : map.getZoom(),
        markerStyle: options.markerStyle === 'pie' ? 'pie' : 'bar',
        renderInterchangeMarkers: Boolean(options.renderInterchangeMarkers),
      })
      map.setLayoutProperty(labelLayerId, 'text-offset', labelOffset)
    }

    if (hasStationLayer) {
      if (stationVisibilityMode === 'none') {
        map.setLayoutProperty(stationLayerId, 'visibility', 'none')
      } else if (stationVisibilityMode === 'interchange') {
        map.setLayoutProperty(stationLayerId, 'visibility', 'visible')
        map.setFilter(stationLayerId, ['==', ['get', 'isInterchange'], true])
      } else {
        map.setLayoutProperty(stationLayerId, 'visibility', 'visible')
        map.setFilter(stationLayerId, null)
      }
    }

    return () => {
      if (hasLabelLayer && map.getLayer(labelLayerId)) {
        map.setLayoutProperty(labelLayerId, 'text-offset', previousTextOffset)
      }
      if (hasStationLayer && map.getLayer(stationLayerId)) {
        map.setLayoutProperty(stationLayerId, 'visibility', previousStationVisibility)
        map.setFilter(stationLayerId, previousStationFilter || null)
      }
    }
  }

  function buildRoundedRectPath(context, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2))
    context.beginPath()
    context.moveTo(x + r, y)
    context.lineTo(x + width - r, y)
    context.arcTo(x + width, y, x + width, y + r, r)
    context.lineTo(x + width, y + height - r)
    context.arcTo(x + width, y + height, x + width - r, y + height, r)
    context.lineTo(x + r, y + height)
    context.arcTo(x, y + height, x, y + height - r, r)
    context.lineTo(x, y + r)
    context.arcTo(x, y, x + r, y, r)
    context.closePath()
  }

  function drawBarInterchangeMarker(context, marker, centerX, centerY, scale = 1) {
    const borderWidth = marker.borderWidth * scale
    const dotSize = marker.dotSize * scale
    const gap = marker.gap * scale
    const colorsCount = marker.colors.length
    const outerWidth = marker.containerSize * scale
    const outerHeight = dotSize + gap * 2 + borderWidth * 2
    const left = centerX - outerWidth / 2 + borderWidth / 2
    const top = centerY - outerHeight / 2 + borderWidth / 2
    const drawWidth = Math.max(1, outerWidth - borderWidth)
    const drawHeight = Math.max(1, outerHeight - borderWidth)
    const radius = drawHeight / 2

    context.save()
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#000000'
    context.lineWidth = borderWidth
    buildRoundedRectPath(context, left, top, drawWidth, drawHeight, radius)
    context.fill()
    context.stroke()

    const dotStep = dotSize + gap
    const dotsLeft = centerX - ((colorsCount * dotSize + (colorsCount - 1) * gap) / 2)
    const dotCenterY = centerY
    for (let i = 0; i < colorsCount; i += 1) {
      const dotCenterX = dotsLeft + dotSize / 2 + i * dotStep
      context.beginPath()
      context.fillStyle = marker.colors[i]
      context.arc(dotCenterX, dotCenterY, dotSize / 2, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  function drawPieInterchangeMarker(context, marker, centerX, centerY, scale = 1) {
    const pieSize = marker.pieSize * scale
    const pieBorder = marker.pieBorder * scale
    const half = pieSize / 2
    const left = centerX - half
    const top = centerY - half
    const colors = marker.shownColors?.length ? marker.shownColors : marker.colors.slice(0, 4)

    context.save()
    if (colors.length <= 1) {
      context.fillStyle = colors[0] || '#bc1fff'
    } else if (typeof context.createConicGradient === 'function') {
      const gradient = context.createConicGradient(-Math.PI / 2, centerX, centerY)
      const count = colors.length
      for (let i = 0; i < count; i += 1) {
        gradient.addColorStop(i / count, colors[i])
        gradient.addColorStop((i + 1) / count, colors[i])
      }
      context.fillStyle = gradient
    } else {
      context.fillStyle = colors[0] || '#bc1fff'
    }

    context.fillRect(left, top, pieSize, pieSize)
    context.strokeStyle = '#000000'
    context.lineWidth = pieBorder
    context.strokeRect(
      left + pieBorder / 2,
      top + pieBorder / 2,
      Math.max(1, pieSize - pieBorder),
      Math.max(1, pieSize - pieBorder),
    )
    context.restore()
  }

  function drawInterchangeMarkersOnTile(
    context,
    map,
    markers,
    markerStyle,
    tile,
    scale = 1,
  ) {
    if (!markers.length) return

    for (const marker of markers) {
      if (!marker.lngLat) continue
      const projected = map.project(marker.lngLat)
      const markerContainerSize = (markerStyle === 'pie' ? marker.pieContainerSize : marker.containerSize) * scale
      const half = markerContainerSize / 2
      const drawX = projected.x * scale
      const drawY = projected.y * scale
      if (
        drawX < -half ||
        drawX > tile.drawWidth + half ||
        drawY < -half ||
        drawY > tile.drawHeight + half
      ) {
        continue
      }

      if (markerStyle === 'pie') {
        drawPieInterchangeMarker(context, marker, drawX, drawY, scale)
      } else {
        drawBarInterchangeMarker(context, marker, drawX, drawY, scale)
      }
    }
  }

  function drawMapTileToCanvas(map, targetContext, { sx = 0, sy = 0, sw, sh, dx = 0, dy = 0 } = {}) {
    const sourceCanvas = map.getCanvas()
    const sourceWidth = sourceCanvas.width
    const sourceHeight = sourceCanvas.height
    const scaleX = sourceWidth / HIGH_RES_TILE_SIZE
    const scaleY = sourceHeight / HIGH_RES_TILE_SIZE
    const targetWidth = Math.max(1, sw || HIGH_RES_TILE_SIZE)
    const targetHeight = Math.max(1, sh || HIGH_RES_TILE_SIZE)
    const sourceX = Math.max(0, Math.round(sx * scaleX))
    const sourceY = Math.max(0, Math.round(sy * scaleY))
    const sourceW = Math.max(1, Math.min(sourceWidth - sourceX, Math.round(targetWidth * scaleX)))
    const sourceH = Math.max(1, Math.min(sourceHeight - sourceY, Math.round(targetHeight * scaleY)))
    targetContext.drawImage(sourceCanvas, sourceX, sourceY, sourceW, sourceH, dx, dy, targetWidth, targetHeight)
  }

  async function exportHighResolutionActualRoute({
    project,
    stationVisibilityMode,
    basemap,
    longEdgePx,
    resolutionLabel,
  }) {
    const targetProject = project || store.project
    const bounds = collectProjectBounds(targetProject)
    if (!bounds) {
      throw new Error('当前工程没有可导出的站点范围')
    }

    const plan = computeHighResPlan(bounds, longEdgePx)
    const { cols, rows, tasks } = buildHighResTileTasks(plan)
    const totalTiles = tasks.length
    const workerCount = computeParallelWorkers(totalTiles, longEdgePx)
    const canOutputSinglePng =
      plan.outputWidth <= MAX_SINGLE_CANVAS_EDGE &&
      plan.outputHeight <= MAX_SINGLE_CANVAS_EDGE &&
      (plan.outputWidth * plan.outputHeight) <= MAX_SINGLE_CANVAS_AREA

    traceActualExport('高分辨率导出参数', {
      preset: resolutionLabel,
      basemap,
      width: plan.outputWidth,
      height: plan.outputHeight,
      zoom: Number(plan.zoom.toFixed(3)),
      rows,
      cols,
      singlePng: canOutputSinglePng,
    })

    updateActualRouteProgress({
      active: true,
      phase: 'preparing',
      message: `正在准备导出环境（自动并行 ${workerCount} 路）`,
      done: 0,
      total: totalTiles,
      workerCount,
      startedAt: Date.now(),
    })

    const contexts = []
    const zip = canOutputSinglePng ? null : new JSZip()
    const finalCanvas = canOutputSinglePng ? document.createElement('canvas') : null
    const finalContext = finalCanvas ? finalCanvas.getContext('2d', { alpha: false }) : null
    const markerStyle = store.interchangeMarkerStyle === 'pie' ? 'pie' : 'bar'
    const shouldRenderInterchangeMarkers = store.showInterchangeMarkers && stationVisibilityMode !== 'none'
    const lineById = targetProject === store.project && store.lineById?.get
      ? store.lineById
      : new Map((targetProject?.lines || []).map((line) => [line.id, line]))
    const interchangeMarkers = shouldRenderInterchangeMarkers
      ? buildInterchangeMarkerEntries({
        stations: targetProject?.stations || [],
        lineById,
        zoom: plan.zoom,
        visible: true,
      })
      : []

    if (finalCanvas) {
      finalCanvas.width = plan.outputWidth
      finalCanvas.height = plan.outputHeight
      if (!finalContext) throw new Error('高分辨率导出失败: 无法创建最终画布')
      finalContext.fillStyle = '#ffffff'
      finalContext.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
    }

    const progressStep = Math.max(1, Math.floor(totalTiles / 60))

    async function commitRenderedTile(map, tile) {
      const tileCanvas = document.createElement('canvas')
      tileCanvas.width = tile.drawWidth
      tileCanvas.height = tile.drawHeight
      const tileContext = tileCanvas.getContext('2d', { alpha: false })
      if (!tileContext) {
        throw new Error('高分辨率导出失败: 无法创建分块画布')
      }
      tileContext.fillStyle = '#ffffff'
      tileContext.fillRect(0, 0, tile.drawWidth, tile.drawHeight)
      drawMapTileToCanvas(map, tileContext, {
        sw: tile.drawWidth,
        sh: tile.drawHeight,
      })
      drawInterchangeMarkersOnTile(tileContext, map, interchangeMarkers, markerStyle, tile)

      if (finalContext) {
        finalContext.drawImage(tileCanvas, tile.offsetX, tile.offsetY)
        return
      }

      const tileBlob = await canvasToPngBlob(tileCanvas)
      zip.file(`tiles/row_${String(tile.row + 1).padStart(3, '0')}_col_${String(tile.col + 1).padStart(3, '0')}.png`, tileBlob)
    }

    try {
      const preparedContexts = await Promise.all(
        Array.from({ length: workerCount }, async () => {
          const context = await createOffscreenExportMap({ tileType: basemap, sizePx: HIGH_RES_TILE_SIZE })
          prepareOffscreenMapData(context.map, basemap)
          const restoreDisplay = applyActualExportDisplayOverrides(context.map, stationVisibilityMode, {
            project: targetProject,
            lineById,
            zoom: plan.zoom,
            markerStyle,
            renderInterchangeMarkers: shouldRenderInterchangeMarkers,
          })
          await waitForMapStable(context.map, { timeoutMs: 5000, idleTimeoutMs: 1500, stableFrames: 2 })
          return { ...context, restoreDisplay }
        }),
      )
      contexts.push(...preparedContexts)

      updateActualRouteProgress({
        phase: 'rendering',
        message: `正在并行渲染分块（0/${totalTiles}）`,
        done: 0,
        total: totalTiles,
        workerCount,
      })

      let tileDone = 0
      let nextTaskIndex = 0

      async function workerLoop(workerId) {
        const context = contexts[workerId]
        while (true) {
          const taskIndex = nextTaskIndex
          if (taskIndex >= totalTiles) return
          nextTaskIndex += 1

          const tile = tasks[taskIndex]
          context.map.jumpTo({
            center: [tile.centerLng, tile.centerLat],
            zoom: plan.zoom,
            bearing: 0,
            pitch: 0,
          })

          await waitForMapStable(context.map, { timeoutMs: 4200, idleTimeoutMs: 1200, stableFrames: 2 })
          await waitForMapRenderFrame(context.map)
          await new Promise((resolve) => requestAnimationFrame(resolve))
          await commitRenderedTile(context.map, tile)

          tileDone += 1
          if (tileDone % progressStep === 0 || tileDone === totalTiles) {
            traceActualExport('高分辨率渲染进度', {
              done: tileDone,
              total: totalTiles,
              percent: Math.round((tileDone / totalTiles) * 100),
              workerCount,
            })
          }
          updateActualRouteProgress({
            phase: 'rendering',
            message: `正在并行渲染分块（${tileDone}/${totalTiles}）`,
            done: tileDone,
            total: totalTiles,
            workerCount,
          })
        }
      }

      await Promise.all(contexts.map((_, workerId) => workerLoop(workerId)))
    } finally {
      for (const context of contexts) {
        try {
          context.restoreDisplay?.()
        } catch {
          // no-op
        }
        context.destroy()
      }
    }

    if (finalCanvas) {
      updateActualRouteProgress({
        phase: 'encoding',
        message: '正在编码 PNG 文件',
        done: totalTiles,
        total: totalTiles,
        workerCount,
      })
      const blob = await canvasToPngBlob(finalCanvas)
      if (!(await blobHasVisualContent(blob))) {
        throw new Error('高分辨率导出失败: 图像内容为空，请稍后重试')
      }
      updateActualRouteProgress({
        phase: 'done',
        message: 'PNG 编码完成，准备下载',
        done: totalTiles,
        total: totalTiles,
        workerCount,
      })
      return {
        blob,
        extension: 'png',
        width: plan.outputWidth,
        height: plan.outputHeight,
      }
    }

    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          kind: 'railmap-actual-route-tiles',
          width: plan.outputWidth,
          height: plan.outputHeight,
          tileSize: HIGH_RES_TILE_SIZE,
          columns: cols,
          rows,
          zoom: Number(plan.zoom.toFixed(4)),
          basemap,
          stationVisibilityMode,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    )

    updateActualRouteProgress({
      phase: 'packaging',
      message: '正在打包分块 ZIP',
      done: totalTiles,
      total: totalTiles,
      workerCount,
    })

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    updateActualRouteProgress({
      phase: 'done',
      message: 'ZIP 打包完成，准备下载',
      done: totalTiles,
      total: totalTiles,
      workerCount,
    })
    return {
      blob,
      extension: 'zip',
      width: plan.outputWidth,
      height: plan.outputHeight,
    }
  }

  async function captureMapFrameBlob(
    mapInstance,
    maxAttempts = 6,
    stageName = '主流程',
    {
      project = store.project,
      stationVisibilityMode = 'all',
    } = {},
  ) {
    const map = resolveMap(mapInstance)
    const markerStyle = store.interchangeMarkerStyle === 'pie' ? 'pie' : 'bar'
    const shouldRenderInterchangeMarkers = store.showInterchangeMarkers && stationVisibilityMode !== 'none'
    const lineById = project === store.project && store.lineById?.get
      ? store.lineById
      : new Map((project?.lines || []).map((line) => [line.id, line]))
    const interchangeMarkers = shouldRenderInterchangeMarkers
      ? buildInterchangeMarkerEntries({
        stations: project?.stations || [],
        lineById,
        zoom: map.getZoom(),
        visible: true,
      })
      : []

    traceActualExport('开始抓帧', { stageName, maxAttempts })
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      traceActualExport('抓帧尝试', { stageName, attempt: attempt + 1 })
      await waitForMapRenderFrame(map)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const sourceCanvas = map.getCanvas()
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = sourceCanvas.width
      exportCanvas.height = sourceCanvas.height
      const context = exportCanvas.getContext('2d', { alpha: false })
      if (!context) {
        throw new Error('导出失败: 无法创建画布上下文')
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
      context.drawImage(sourceCanvas, 0, 0)

      const canvasElement = map.getCanvas()
      const cssWidth = canvasElement.clientWidth || map.getContainer()?.clientWidth || exportCanvas.width
      const scale = cssWidth > 0 ? exportCanvas.width / cssWidth : 1
      drawInterchangeMarkersOnTile(
        context,
        map,
        interchangeMarkers,
        markerStyle,
        { drawWidth: exportCanvas.width, drawHeight: exportCanvas.height },
        scale,
      )

      const blob = await canvasToPngBlob(exportCanvas)
      if (await blobHasVisualContent(blob)) {
        traceActualExport('抓帧成功', { stageName, attempt: attempt + 1, size: blob.size })
        return blob
      }
      traceActualExport('抓帧结果无有效内容，准备重试', { stageName, attempt: attempt + 1 })
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    traceActualExport('抓帧失败', { stageName })
    return null
  }

  async function exportActualRoutePngFromMap({
    project,
    stationVisibilityMode = 'all',
    resolutionPreset = null,
    basemap = null,
    fitToProject = true,
    maxLongEdgePx = null,
    fileNameSuffix = '实际走向图',
    exportLabel = '实际走向图',
    adjustLabelOffsetForMarkers = true,
  } = {}) {
    const map = getMap()
    if (!map) {
      throw new Error('真实地图未初始化')
    }

    const exportModeLabel = String(exportLabel || '实际走向图').trim() || '实际走向图'
    const exportFileSuffix = String(fileNameSuffix || exportModeLabel).trim() || exportModeLabel
    const shouldFitToProject = fitToProject !== false
    const downsampleTargetEdge = Number.isFinite(Number(maxLongEdgePx))
      ? Math.max(320, Math.round(Number(maxLongEdgePx)))
      : null

    updateActualRouteProgress({
      active: true,
      phase: 'preparing',
      message: `正在准备导出${exportModeLabel}`,
      done: 0,
      total: 0,
      percent: 0,
      workerCount: 1,
      startedAt: Date.now(),
    })

    try {
      traceActualExport('开始导出')
      const normalizedStationVisibilityMode = ['all', 'interchange', 'none'].includes(stationVisibilityMode)
        ? stationVisibilityMode
        : 'all'
      traceActualExport('应用导出站点模式', normalizedStationVisibilityMode)

      const targetProject = project || store.project
      const longEdgePx = resolveLongEdgePx(resolutionPreset)
      const basemapType = normalizeBasemap(basemap)
      const baseName = sanitizeFileName(targetProject?.name || store.project?.name, 'metro-studio')

      if (longEdgePx && !isTrial.value) {
        const label = String(resolutionPreset || '').trim().toLowerCase() || `${longEdgePx}px`
        const result = await exportHighResolutionActualRoute({
          project: targetProject,
          stationVisibilityMode: normalizedStationVisibilityMode,
          basemap: basemapType,
          longEdgePx,
          resolutionLabel: label,
        })

        const fileName =
          result.extension === 'png'
            ? `${baseName}_${exportFileSuffix}_${label}.png`
            : `${baseName}_${exportFileSuffix}_${label}_分块.zip`

        const url = URL.createObjectURL(result.blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        setTimeout(() => URL.revokeObjectURL(url), 1000)

        traceActualExport('下载已触发', {
          fileName,
          size: result.blob.size,
          width: result.width,
          height: result.height,
        })
        clearActualRouteProgress({ message: `${exportModeLabel}导出完成` })
        return
      }

      const cameraState = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      }
      const labelLayerId = 'railmap-stations-label'
      const stationLayerId = LAYER_STATIONS
      const hasLabelLayer = Boolean(map.getLayer(labelLayerId))
      const hasStationLayer = Boolean(map.getLayer(stationLayerId))
      const previousLabelVisibility = hasLabelLayer ? map.getLayoutProperty(labelLayerId, 'visibility') || 'visible' : 'visible'
      const previousLabelTextOffset = hasLabelLayer ? map.getLayoutProperty(labelLayerId, 'text-offset') : null
      const previousStationVisibility = hasStationLayer ? map.getLayoutProperty(stationLayerId, 'visibility') || 'visible' : 'visible'
      const previousStationFilter = hasStationLayer ? map.getFilter(stationLayerId) : null

      let pngBlob = null
      try {
        traceActualExport('等待地图空闲')
        updateActualRouteProgress({ phase: 'preparing', message: '等待地图稳定渲染', done: 0, total: 0 })
        await waitForMapStable(map)
      if (hasStationLayer) {
        if (normalizedStationVisibilityMode === 'none') {
          map.setLayoutProperty(stationLayerId, 'visibility', 'none')
          traceActualExport('隐藏车站图层')
        } else if (normalizedStationVisibilityMode === 'interchange') {
          map.setLayoutProperty(stationLayerId, 'visibility', 'visible')
          map.setFilter(stationLayerId, ['==', ['get', 'isInterchange'], true])
          traceActualExport('车站图层仅保留换乘站')
        } else {
          map.setLayoutProperty(stationLayerId, 'visibility', 'visible')
          map.setFilter(stationLayerId, null)
          traceActualExport('显示全部车站')
        }
      }
        if (shouldFitToProject) {
          traceActualExport('定位全网范围')
          updateActualRouteProgress({ phase: 'rendering', message: '定位全网范围并抓取画面', done: 0, total: 1 })
          await fitMapToProjectForExport(targetProject, map)
        } else {
          traceActualExport('保持当前视口')
          updateActualRouteProgress({ phase: 'rendering', message: '保持当前视口并抓取画面', done: 0, total: 1 })
        }
        if (hasLabelLayer && adjustLabelOffsetForMarkers) {
          const liveLineById = targetProject === store.project && store.lineById?.get
            ? store.lineById
            : new Map((targetProject?.lines || []).map((line) => [line.id, line]))
          const labelOffset = buildExportStationsLabelOffsetExpression({
            project: targetProject,
            lineById: liveLineById,
            zoom: map.getZoom(),
            markerStyle: store.interchangeMarkerStyle === 'pie' ? 'pie' : 'bar',
            renderInterchangeMarkers: store.showInterchangeMarkers && normalizedStationVisibilityMode !== 'none',
          })
          map.setLayoutProperty(labelLayerId, 'text-offset', labelOffset)
        }
        pngBlob = await captureMapFrameBlob(map, 6, '主流程', {
          project: targetProject,
          stationVisibilityMode: normalizedStationVisibilityMode,
        })
        updateActualRouteProgress({ phase: 'encoding', message: '正在编码 PNG 文件', done: 1, total: 1 })
      if (!pngBlob && map.getLayer('osm-base')) {
        traceActualExport('主流程抓帧失败，尝试隐藏底图回退')
        const previousVisibility = map.getLayoutProperty('osm-base', 'visibility') || 'visible'
        try {
          map.setLayoutProperty('osm-base', 'visibility', 'none')
          pngBlob = await captureMapFrameBlob(map, 4, '隐藏底图回退', {
            project: targetProject,
            stationVisibilityMode: normalizedStationVisibilityMode,
          })
        } finally {
          map.setLayoutProperty('osm-base', 'visibility', previousVisibility)
          await waitForMapRenderFrame(map)
          traceActualExport('恢复底图可见性')
        }
      }
      } finally {
      try {
        if (hasLabelLayer && map.getLayer(labelLayerId)) {
          map.setLayoutProperty(labelLayerId, 'text-offset', previousLabelTextOffset)
          map.setLayoutProperty(labelLayerId, 'visibility', previousLabelVisibility)
        }
        if (hasStationLayer && map.getLayer(stationLayerId)) {
          map.setLayoutProperty(stationLayerId, 'visibility', previousStationVisibility)
          map.setFilter(stationLayerId, previousStationFilter || null)
        }
        map.jumpTo({
          center: cameraState.center,
          zoom: cameraState.zoom,
          bearing: cameraState.bearing,
          pitch: cameraState.pitch,
        })
        await waitForMapRenderFrame(map)
        traceActualExport('恢复原视角完成')
      } catch (restoreError) {
        traceActualExport('恢复阶段异常（不影响下载）', restoreError?.message || String(restoreError))
      }
      }

      if (!pngBlob) {
        traceActualExport('导出失败：未获取到有效图像')
        throw new Error('导出失败: 底图帧不可读，请稍后重试')
      }

      if (downsampleTargetEdge) {
        pngBlob = await downsampleBlobToMaxLongEdge(pngBlob, downsampleTargetEdge)
      }

      if (isTrial.value) {
        pngBlob = await downsampleBlobTo720p(pngBlob)
      }

      const fileName = `${baseName}_${exportFileSuffix}.png`
      const url = URL.createObjectURL(pngBlob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      traceActualExport('下载已触发', { fileName, size: pngBlob.size })
      clearActualRouteProgress({ message: `${exportModeLabel}导出完成` })
    } catch (error) {
      clearActualRouteProgress({ message: `导出失败: ${error?.message || 'unknown error'}`, failed: true })
      throw error
    }
  }

  async function downsampleBlobToMaxLongEdge(blob, maxLongEdge) {
    const targetLongEdge = Number(maxLongEdge)
    if (!Number.isFinite(targetLongEdge) || targetLongEdge <= 0) return blob
    const img = await loadBlobAsImage(blob)
    const sourceLongEdge = Math.max(img.width, img.height)
    if (sourceLongEdge <= targetLongEdge) return blob

    const ratio = targetLongEdge / sourceLongEdge
    const width = Math.max(1, Math.round(img.width * ratio))
    const height = Math.max(1, Math.round(img.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return blob
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(img, 0, 0, width, height)

    const nextBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    return nextBlob || blob
  }

  async function downsampleBlobTo720p(blob) {
    const img = await loadBlobAsImage(blob)
    if (img.height <= TRIAL_LIMITS.maxExportHeight) return blob
    const ratio = TRIAL_LIMITS.maxExportHeight / img.height
    const w = Math.round(img.width * ratio)
    const h = TRIAL_LIMITS.maxExportHeight
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
  }

  return {
    exportActualRoutePngFromMap,
    exportHighResolutionActualRoute,
  }
}

/**
 * Standalone high-res export that does NOT need a live map instance.
 * Can be called directly from the store without waiting for map registration.
 */
export function createStandaloneHighResExporter(store) {
  const { exportHighResolutionActualRoute } = useMapExport({ store, getMap: () => null })
  return exportHighResolutionActualRoute
}
