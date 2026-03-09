import { createId } from '../ids'
import { isTrial, TRIAL_LIMITS } from '../../composables/useLicense'
import { cloneEdgeLineTimeline, syncEdgeTimelineSummary } from '../edgeTimeline'

const CLIPBOARD_VERSION = '1.0'

/**
 * Copy selected edges to system clipboard.
 * Supports both selected edges and selected stations (infers connected edges).
 * @param {Object} store - Pinia store instance
 * @returns {Promise<{edgeCount: number, stationCount: number, lineCount: number} | null>}
 */
export async function copySelectedEdges(store) {
  if (!store.project) return null

  const selectedEdgeIds = store.selectedEdgeIds || []
  const selectedStationIds = store.selectedStationIds || []

  let edges = []

  if (selectedEdgeIds.length > 0) {
    edges = store.project.edges.filter(edge => selectedEdgeIds.includes(edge.id))
  } else if (selectedStationIds.length > 0) {
    const stationIdSet = new Set(selectedStationIds)
    edges = store.project.edges.filter(edge =>
      stationIdSet.has(edge.fromStationId) || stationIdSet.has(edge.toStationId)
    )
  }

  if (edges.length === 0) {
    store.statusText = '请先选中要复制的线段或站点'
    return null
  }

  const stationIdSet = new Set()
  const lineIdSet = new Set()

  edges.forEach(edge => {
    if (edge.fromStationId) stationIdSet.add(edge.fromStationId)
    if (edge.toStationId) stationIdSet.add(edge.toStationId)
    if (edge.sharedByLineIds) {
      edge.sharedByLineIds.forEach(lineId => lineIdSet.add(lineId))
    }
  })

  const stations = store.project.stations.filter(station => stationIdSet.has(station.id))
  const lines = store.project.lines.filter(line => lineIdSet.has(line.id))

  const clipboardData = {
    version: CLIPBOARD_VERSION,
    type: 'metro-studio-lines',
    data: {
      lines: lines.map(line => ({
        id: line.id,
        key: line.key,
        nameZh: line.nameZh,
        nameEn: line.nameEn,
        color: line.color,
        status: line.status,
        style: line.style,
        isLoop: line.isLoop,
        edgeIds: [], 
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        fromStationId: edge.fromStationId,
        toStationId: edge.toStationId,
        waypoints: edge.waypoints || [],
        sharedByLineIds: edge.sharedByLineIds || [],
        lineStyleOverride: edge.lineStyleOverride,
        lengthMeters: edge.lengthMeters,
        isCurved: edge.isCurved,
        openingYear: edge.openingYear,
        phase: edge.phase,
        lineTimeline: cloneEdgeLineTimeline(edge),
      })),
      stations: stations.map(station => ({
        id: station.id,
        nameZh: station.nameZh,
        nameEn: station.nameEn,
        lngLat: station.lngLat,
        displayPos: station.displayPos,
        isInterchange: station.isInterchange,
        underConstruction: station.underConstruction,
        proposed: station.proposed,
        lineIds: station.lineIds || [],
        transferLineIds: station.transferLineIds || [],
      })),
    },
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(clipboardData))
    return {
      edgeCount: edges.length,
      stationCount: stations.length,
      lineCount: lines.length,
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    store.statusText = '复制失败: ' + (error.message || '未知错误')
    return null
  }
}

/**
 * Paste edges from system clipboard.
 * @param {Object} store - Pinia store instance
 * @returns {Promise<{edgeCount: number, stationCount: number, lineCount: number} | null>}
 */
export async function pasteEdges(store) {
  if (!store.project) return null

  let clipboardData = null

  try {
    const text = await navigator.clipboard.readText()
    clipboardData = JSON.parse(text)
  } catch (error) {
    console.error('Failed to read clipboard:', error)
    store.statusText = '读取剪贴板失败: ' + (error.message || '未知错误')
    return null
  }

  if (!clipboardData || clipboardData.type !== 'metro-studio-lines' || clipboardData.version !== CLIPBOARD_VERSION) {
    store.statusText = '剪贴板数据格式无效'
    return null
  }

  const { lines, edges, stations } = clipboardData.data
  if (!edges || !edges.length) {
    store.statusText = '剪贴板中没有线段数据'
    return null
  }

  if (isTrial.value && (store.project.stations.length + (stations?.length || 0)) > TRIAL_LIMITS.maxStations) {
    store._showUpgradeDialog?.(`试用版最多 ${TRIAL_LIMITS.maxStations} 个站点，粘贴后将超出限制。`)
    return null
  }

  const idMap = new Map()

  lines.forEach(line => {
    const newId = createId('line')
    idMap.set(line.id, newId)
  })

  stations.forEach(station => {
    const newId = createId('station')
    idMap.set(station.id, newId)
  })

  edges.forEach(edge => {
    const newId = createId('edge')
    idMap.set(edge.id, newId)
  })

  const newLines = lines.map(line => ({
    ...line,
    id: idMap.get(line.id),
    key: `${line.key}_${Date.now()}`,
    edgeIds: [],
  }))

  const newStations = stations.map(station => ({
    ...station,
    id: idMap.get(station.id),
    lngLat: station.lngLat,
    displayPos: station.displayPos,
    lineIds: station.lineIds.map(oldId => idMap.get(oldId)).filter(Boolean),
    transferLineIds: station.transferLineIds.map(oldId => idMap.get(oldId)).filter(Boolean),
  }))

  const newEdges = edges.map(edge => {
    const sharedByLineIds = edge.sharedByLineIds.map(oldId => idMap.get(oldId)).filter(Boolean)
    const lineTimeline = {}
    const rawTimeline = edge?.lineTimeline && typeof edge.lineTimeline === 'object' ? edge.lineTimeline : {}
    for (const oldLineId of edge.sharedByLineIds || []) {
      const nextLineId = idMap.get(oldLineId)
      if (!nextLineId || !rawTimeline[oldLineId]) continue
      lineTimeline[nextLineId] = {
        openingYear: rawTimeline[oldLineId].openingYear ?? null,
        phase: rawTimeline[oldLineId].phase || '',
      }
    }
    return syncEdgeTimelineSummary({
      ...edge,
      id: idMap.get(edge.id),
      fromStationId: idMap.get(edge.fromStationId),
      toStationId: idMap.get(edge.toStationId),
      sharedByLineIds,
      lineTimeline,
    })
  })

  newEdges.forEach(edge => {
    for (const lineId of edge.sharedByLineIds || []) {
      const line = newLines.find(l => l.id === lineId)
      if (line && !line.edgeIds.includes(edge.id)) {
        line.edgeIds.push(edge.id)
      }
    }
  })

  store.project.lines.push(...newLines)
  store.project.stations.push(...newStations)
  store.project.edges.push(...newEdges)

  store.recomputeStationLineMembership()

  const newEdgeIds = newEdges.map(e => e.id)
  const newStationIds = newStations.map(s => s.id)
  store.setSelectedEdges(newEdgeIds, { keepStations: false })
  store.setSelectedStations(newStationIds, { keepEdges: true })

  return {
    edgeCount: newEdges.length,
    stationCount: newStations.length,
    lineCount: newLines.length,
  }
}

/**
 * Check if clipboard has valid clipboard data.
 * @returns {Promise<boolean>}
 */
export async function hasClipboardData() {
  try {
    const text = await navigator.clipboard.readText()
    const data = JSON.parse(text)
    return data.type === 'metro-studio-lines' && data.version === CLIPBOARD_VERSION
  } catch {
    return false
  }
}
