import { computed, nextTick, reactive } from 'vue'
import {
  LAYER_EDGE_ANCHORS_HIT,
  LAYER_EDGES_HIT,
  LAYER_STATIONS,
} from '../components/map-editor/constants'
import { useDialog } from './useDialog.js'

// 用于延迟引用 openLineSelectionMenu 函数
let openLineSelectionMenuRef = null
export function setLineSelectionMenuOpener(fn) {
  openLineSelectionMenuRef = fn
}

/**
 * Context menu state and operations for the map editor.
 *
 * @param {Object} deps
 * @param {import('pinia').Store} deps.store - The project store
 * @param {import('vue').Ref<HTMLElement|null>} deps.mapContainerRef - Ref to the map container element
 * @param {import('vue').Ref<HTMLElement|null>} deps.contextMenuRef - Ref to the context menu element
 * @param {() => maplibregl.Map|null} deps.getMap - Getter for the map instance
 */
export function useMapContextMenu({ store, mapContainerRef, contextMenuRef, getMap }) {
  const { confirm, prompt } = useDialog()

  const contextMenu = reactive({
    visible: false,
    x: 0,
    y: 0,
    targetType: 'map',
    lngLat: null,
    stationId: null,
    edgeId: null,
    anchorIndex: null,
  })

  const contextMenuStyle = computed(() => ({
    left: `${contextMenu.x}px`,
    top: `${contextMenu.y}px`,
  }))

  const hasSelection = computed(
    () => store.selectedStationIds.length > 0 || (store.selectedEdgeIds?.length || 0) > 0 || Boolean(store.selectedEdgeAnchor),
  )

  const contextStation = computed(() => {
    if (!store.project || !contextMenu.stationId) return null
    return store.project.stations.find((station) => station.id === contextMenu.stationId) || null
  })

  const contextTargetLabel = computed(() => {
    if (contextMenu.targetType === 'anchor') return '锚点'
    if (contextMenu.targetType === 'station') return '站点'
    if (contextMenu.targetType === 'edge') return '线段'
    return '地图空白'
  })

  const canMergeAtContextStation = computed(() => {
    if (!contextMenu.stationId) return false
    return store.canMergeEdgesAtStation(contextMenu.stationId)
  })

  function closeContextMenu() {
    contextMenu.visible = false
    contextMenu.targetType = 'map'
    contextMenu.stationId = null
    contextMenu.edgeId = null
    contextMenu.anchorIndex = null
    contextMenu.lngLat = null
  }

  async function adjustContextMenuPosition() {
    await nextTick()
    if (!mapContainerRef.value || !contextMenuRef.value || !contextMenu.visible) return
    const containerRect = mapContainerRef.value.getBoundingClientRect()
    const menuRect = contextMenuRef.value.getBoundingClientRect()
    const padding = 8
    const maxX = Math.max(padding, containerRect.width - menuRect.width - padding)
    const maxY = Math.max(padding, containerRect.height - menuRect.height - padding)
    contextMenu.x = Math.max(padding, Math.min(contextMenu.x, maxX))
    contextMenu.y = Math.max(padding, Math.min(contextMenu.y, maxY))
  }

  function openContextMenu(event) {
    const map = getMap()
    if (!mapContainerRef.value || !map) return
    const point = event.point || { x: 0, y: 0 }
    const anchors = map.queryRenderedFeatures(point, { layers: [LAYER_EDGE_ANCHORS_HIT] })
    const stations = map.queryRenderedFeatures(point, { layers: [LAYER_STATIONS] })
    const edges = map.queryRenderedFeatures(point, { layers: [LAYER_EDGES_HIT] })

    const anchorEdgeId = anchors[0]?.properties?.edgeId || null
    const anchorIndexRaw = anchors[0]?.properties?.anchorIndex
    const anchorIndex = Number.isInteger(Number(anchorIndexRaw)) ? Number(anchorIndexRaw) : null
    const stationId = stations[0]?.properties?.id || null
    const edgeId = anchorEdgeId || edges[0]?.properties?.id || null
    const targetType = anchorEdgeId && anchorIndex != null ? 'anchor' : stationId ? 'station' : edgeId ? 'edge' : 'map'

    if (anchorEdgeId && anchorIndex != null) {
      store.selectEdgeAnchor(anchorEdgeId, anchorIndex)
    } else if (stationId) {
      store.setSelectedStations([stationId])
    } else if (edgeId) {
      store.selectEdge(edgeId)
    }

    contextMenu.x = point.x
    contextMenu.y = point.y
    contextMenu.targetType = targetType
    contextMenu.stationId = stationId
    contextMenu.edgeId = edgeId
    contextMenu.anchorIndex = anchorIndex
    contextMenu.lngLat = [event.lngLat.lng, event.lngLat.lat]
    contextMenu.visible = true
    adjustContextMenuPosition()
  }

  function onContextOverlayMouseDown(event) {
    if (event.button !== 0 && event.button !== 2) return
    closeContextMenu()
  }

  function setModeFromContext(mode) {
    store.setMode(mode)
    closeContextMenu()
  }

  function addStationAtContext() {
    if (!contextMenu.lngLat) return
    store.addStationAt([...contextMenu.lngLat])
    closeContextMenu()
  }

  function clearSelectionFromContext() {
    store.clearSelection()
    closeContextMenu()
  }

  function addEdgeAnchorFromContext() {
    if (!contextMenu.edgeId || !contextMenu.lngLat) return
    store.addEdgeAnchor(contextMenu.edgeId, [...contextMenu.lngLat])
    closeContextMenu()
  }

  function removeEdgeAnchorFromContext() {
    if (!contextMenu.edgeId || contextMenu.anchorIndex == null) return
    store.removeEdgeAnchor(contextMenu.edgeId, contextMenu.anchorIndex)
    closeContextMenu()
  }

  async function clearContextEdgeAnchorsFromContext() {
    if (!contextMenu.edgeId) return
    const ok = await confirm({ title: '清空锚点', message: '确认清空该线段全部锚点吗？' })
    if (!ok) return
    store.clearEdgeAnchors(contextMenu.edgeId)
    closeContextMenu()
  }

  async function renameContextStationFromContext() {
    if (!contextStation.value) return
    const nameZh = await prompt({ title: '站点中文名', message: '输入站点中文名', defaultValue: contextStation.value.nameZh || '', placeholder: '中文名' })
    if (nameZh == null) return
    const nameEn = await prompt({ title: '站点英文名', message: '输入站点英文名', defaultValue: contextStation.value.nameEn || '', placeholder: '英文名' })
    if (nameEn == null) return
    store.updateStationName(contextStation.value.id, { nameZh, nameEn })
    closeContextMenu()
  }

  async function deleteContextStationFromContext() {
    if (!contextMenu.stationId) return
    const ok = await confirm({ title: '删除站点', message: '确认删除该站点吗？', confirmText: '删除', danger: true })
    if (!ok) return
    store.setSelectedStations([contextMenu.stationId])
    store.deleteSelectedStations()
    closeContextMenu()
  }

  async function deleteContextEdgeFromContext() {
    if (!contextMenu.edgeId) return
    const ok = await confirm({ title: '删除线段', message: '确认删除该线段吗？', confirmText: '删除', danger: true })
    if (!ok) return
    store.selectEdge(contextMenu.edgeId)
    store.deleteSelectedEdge()
    closeContextMenu()
  }

  function splitEdgeAtContext() {
    if (!contextMenu.edgeId || !contextMenu.lngLat) return
    store.splitEdgeAtPoint(contextMenu.edgeId, [...contextMenu.lngLat])
    closeContextMenu()
  }

  function mergeEdgesAtContextStation() {
    if (!contextMenu.stationId) return
    store.mergeEdgesAtStation(contextMenu.stationId)
    closeContextMenu()
  }

  async function aiTranslateContextStationEnglishFromContext() {
    // Use contextMenu.stationId directly instead of contextStation.value?.id
    // to avoid issues when the computed returns null
    if (!contextMenu.stationId) return
    const stationId = contextMenu.stationId
    closeContextMenu()
    try {
      await store.retranslateStationEnglishNamesByIdsWithAi([stationId])
    } catch (error) {
      const message = String(error?.message || '翻译失败')
      store.statusText = `站点英文翻译失败: ${message}`
    }
  }

  function selectContextEdgeLineStations() {
    if (!contextMenu.edgeId) return
    const edge = store.project?.edges?.find((e) => e.id === contextMenu.edgeId)
    if (!edge?.sharedByLineIds?.length) return

    const lineIds = edge.sharedByLineIds
    if (lineIds.length === 1) {
      store.selectLineStationsOnly(lineIds[0])
      closeContextMenu()
    } else {
      // Multiple lines, show line selection menu
      const lineMap = new Map((store.project?.lines || []).map((l) => [l.id, l]))
      const lineOptions = lineIds.map((lineId) => {
        const line = lineMap.get(lineId)
        return {
          lineId,
          nameZh: line?.nameZh || line?.name || lineId,
          color: line?.color || '#2563EB',
        }
      })
      if (typeof openLineSelectionMenuRef === 'function') {
        openLineSelectionMenuRef({
          x: contextMenu.x,
          y: contextMenu.y,
          lineOptions,
          stationsOnly: true,
        })
      }
    }
  }

  return {
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
    selectContextEdgeLineStations,
    setLineSelectionMenuOpener,
  }
}
