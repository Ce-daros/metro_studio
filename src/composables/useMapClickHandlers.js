import {
  LAYER_EDGE_ANCHORS_HIT,
  LAYER_EDGES_HIT,
  LAYER_STATIONS,
} from '../components/map-editor/constants'
import { findEdgePathBetweenStations } from '../components/map-editor/bfsPathFinder'

const ANNOTATION_HIT_RADIUS = 24

function hitTestAnnotation(map, screenPoint, store) {
  const annotations = store.project?.annotations
  if (!annotations || !annotations.length || !map) return null
  for (const anno of annotations) {
    const projected = map.project(anno.lngLat)
    const dx = projected.x - screenPoint.x
    const dy = (projected.y - 16) - screenPoint.y
    if (dx * dx + dy * dy < ANNOTATION_HIT_RADIUS * ANNOTATION_HIT_RADIUS) {
      return anno
    }
  }
  return null
}

function isLineDrawMode(store) {
  return store.mode === 'add-edge' || store.mode === 'route-draw'
}

export function useMapClickHandlers({ store, getMap, closeContextMenu, openContextMenu, openLineSelectionMenu, interactionState }) {
  function handleStationClick(event) {
    if (store.navigation?.active) return
    closeContextMenu()
    interactionState.setSuppressNextMapClick(true)
    const stationId = event.features?.[0]?.properties?.id
    if (!stationId) return

    if (store.mode === 'delete-mode') {
      const mouseEvent = event.originalEvent
      const isShift = Boolean(mouseEvent?.shiftKey)
      const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
      const hasModifier = isShift || isCtrl
      if (hasModifier) {
        // Shift: 加选, Ctrl: 切换选择
        store.selectStation(stationId, { multi: true, toggle: isCtrl })
      } else {
        store.deleteStation(stationId)
        store.statusText = `已删除站点: ${stationId}`
      }
      return
    }

    if (store.mode === 'style-brush') {
      if (store.styleBrush.active) {
        if (store.styleBrush.sourceType === 'station') {
          store.applyStyleToStation(stationId)
        } else {
          store.statusText = '只能应用站点样式到站点'
        }
      } else {
        const mouseEvent = event.originalEvent
        const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
        // Ctrl+点击已选中的站点：从该站点拾取样式
        if (isCtrl && store.selectedStationIds.includes(stationId)) {
          store.activateStyleBrush(store.selectedStationIds[store.selectedStationIds.length - 1], 'station')
        } else {
          store.activateStyleBrush(stationId, 'station')
        }
      }
      return
    }

    if (store.mode === 'route-draw') {
      store.selectStation(stationId)
      return
    }

    if (store.mode === 'quick-link') {
      if (!store.quickLinkStartStationId) {
        store.quickLinkStartStationId = stationId
        const station = store.project?.stations?.find((s) => s.id === stationId)
        store.statusText = `快速连线起点: ${station?.nameZh || stationId}，请点击终点`
      } else {
        if (store.quickLinkStartStationId === stationId) {
          const station = store.project?.stations?.find((s) => s.id === stationId)
          store.statusText = `已重新选择起点: ${station?.nameZh || stationId}`
          return
        }
        store.addEdgeBetweenStations(store.quickLinkStartStationId, stationId)
        store.quickLinkStartStationId = stationId
        const station = store.project?.stations?.find((s) => s.id === stationId)
        store.statusText = `已连线，新起点: ${station?.nameZh || stationId}`
      }
      return
    }

    const mouseEvent = event.originalEvent
    const isShift = Boolean(mouseEvent?.shiftKey)
    const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
    const hasModifier = isShift || isCtrl

    // Shift: 范围选择（当选中一个站点时）
    if (isShift && store.mode === 'select' && store.selectedStationIds.length === 1 && store.selectedStationIds[0] !== stationId) {
      const fromId = store.selectedStationIds[0]
      const edges = store.project?.edges
      const pathEdgeIds = findEdgePathBetweenStations(edges, fromId, stationId)
      if (pathEdgeIds.length) {
        store.setSelectedEdges(pathEdgeIds, { keepStations: false })
        store.setSelectedStations([fromId, stationId], { keepEdges: true })
        store.statusText = `已选中路径上 ${pathEdgeIds.length} 条线段`
        return
      }
    }

    // Ctrl/Meta: 切换选择，Shift: 加选
    store.selectStation(stationId, {
      multi: hasModifier && store.mode === 'select',
      toggle: isCtrl && store.mode === 'select',
    })
  }

  function handleEdgeClick(event) {
    if (store.navigation?.active) return
    const map = getMap()
    closeContextMenu()
    interactionState.setSuppressNextMapClick(true)
    if (!map) return
    if (isLineDrawMode(store)) return
    const overlappingStations = map.queryRenderedFeatures(event.point, { layers: [LAYER_STATIONS] })
    if (overlappingStations.length) return
    const edgeId = event.features?.[0]?.properties?.id
    if (!edgeId) return
    const mouseEvent = event.originalEvent

    if (store.mode === 'delete-mode') {
      const isShift = Boolean(mouseEvent?.shiftKey)
      const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
      const hasModifier = isShift || isCtrl
      if (hasModifier) {
        // Shift: 加选, Ctrl: 切换选择
        store.selectEdge(edgeId, { multi: true, toggle: isCtrl })
      } else {
        store.deleteEdge(edgeId)
        store.statusText = `已删除线段: ${edgeId}`
      }
      return
    }

    if (store.mode === 'style-brush') {
      if (store.styleBrush.active) {
        if (store.styleBrush.sourceType === 'edge') {
          store.applyStyleToEdge(edgeId)
        } else {
          store.statusText = '只能应用线段样式到线段'
        }
      } else {
        const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
        // Ctrl+点击已选中的线段：从该线段拾取样式
        if (isCtrl && store.selectedEdgeIds.includes(edgeId)) {
          store.activateStyleBrush(store.selectedEdgeIds[store.selectedEdgeIds.length - 1], 'edge')
        } else {
          store.activateStyleBrush(edgeId, 'edge')
        }
      }
      return
    }

    if (mouseEvent?.altKey) {
      const edge = store.project?.edges?.find((e) => e.id === edgeId)
      if (!edge?.sharedByLineIds?.length) return
      const stationsOnly = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
      if (edge.sharedByLineIds.length === 1) {
        if (stationsOnly) {
          store.selectLineStationsOnly(edge.sharedByLineIds[0])
        } else {
          store.selectLine(edge.sharedByLineIds[0])
        }
      } else {
        const lineOptions = edge.sharedByLineIds
          .map((lineId) => {
            const line = store.project.lines.find((l) => l.id === lineId)
            if (!line) return null
            return {
              id: line.id,
              nameZh: line.nameZh,
              nameEn: line.nameEn,
              color: line.color,
            }
          })
          .filter(Boolean)
        if (lineOptions.length) {
          openLineSelectionMenu({ x: event.point.x, y: event.point.y, lineOptions, stationsOnly })
        }
      }
      return
    }
    if (store.mode !== 'select') {
      store.setMode('select')
    }
    const isShift = Boolean(mouseEvent?.shiftKey)
    const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
    const hasModifier = isShift || isCtrl
    // Ctrl: 切换选择，Shift: 加选
    store.selectEdge(edgeId, {
      multi: hasModifier,
      toggle: isCtrl,
    })
    const selectedCount = store.selectedEdgeIds?.length || 0
    store.statusText = selectedCount > 1 ? `已选中线段 ${selectedCount} 条` : `已选中线段: ${edgeId}`
  }

  function handleEdgeAnchorClick(event) {
    if (store.navigation?.active) return
    closeContextMenu()
    interactionState.setSuppressNextMapClick(true)
    if (isLineDrawMode(store)) return
    const edgeId = event.features?.[0]?.properties?.edgeId
    const anchorIndexRaw = event.features?.[0]?.properties?.anchorIndex
    const anchorIndex = Number(anchorIndexRaw)
    if (!edgeId || !Number.isInteger(anchorIndex)) return
    if (store.mode !== 'select') {
      store.setMode('select')
    }
    store.selectEdgeAnchor(edgeId, anchorIndex)
    store.statusText = `已选中锚点: ${edgeId} #${anchorIndex}`
  }

  function handleMapClick(event) {
    if (store.navigation?.active) return
    const map = getMap()
    closeContextMenu()
    if (!map) return
    if (interactionState.consumeSuppressFlag()) {
      return
    }
    const hitAnchors = map.getLayer(LAYER_EDGE_ANCHORS_HIT)
      ? map.queryRenderedFeatures(event.point, { layers: [LAYER_EDGE_ANCHORS_HIT] })
      : []
    const hitStations = map.getLayer(LAYER_STATIONS)
      ? map.queryRenderedFeatures(event.point, { layers: [LAYER_STATIONS] })
      : []
    const hitEdges = map.getLayer(LAYER_EDGES_HIT)
      ? map.queryRenderedFeatures(event.point, { layers: [LAYER_EDGES_HIT] })
      : []
    if (hitAnchors.length) return
    if (hitStations.length) return
    if (hitEdges.length) return
    if (store.mode === 'add-station') {
      store.addStationAt([event.lngLat.lng, event.lngLat.lat])
      return
    }
    if (store.mode === 'route-draw') {
      const station = store.addStationAt([event.lngLat.lng, event.lngLat.lat])
      if (station?.id) {
        store.selectStation(station.id)
      }
      return
    }
    if (store.mode === 'style-brush') {
      store.deactivateStyleBrush()
      return
    }
    if (store.mode === 'quick-link') {
      store.quickLinkStartStationId = null
      store.statusText = '快速连线已取消'
      return
    }
    if (store.mode === 'annotation') {
      const hitAnno = hitTestAnnotation(map, event.point, store)
      if (hitAnno) {
        store.clearSelection()
        store.selectedAnnotationId = hitAnno.id
        return
      }
      store.addAnnotation([event.lngLat.lng, event.lngLat.lat], '新注释')
      store.statusText = '已添加注释，可在属性面板编辑内容'
      return
    }
    {
      const hitAnno = hitTestAnnotation(map, event.point, store)
      if (hitAnno) {
        store.selectedStationId = null
        store.selectedStationIds = []
        store.selectedEdgeId = null
        store.selectedEdgeIds = []
        store.selectedEdgeAnchor = null
        store.selectedAnnotationId = hitAnno.id
        return
      }
    }
    if (store.mode === 'select') {
      const mouseEvent = event.originalEvent
      const keepSelection = Boolean(mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey)
      if (!keepSelection) {
        store.clearSelection()
      }
    }
  }

  function handleMapContextMenu(event) {
    const map = getMap()
    if (!map) return
    event.originalEvent?.preventDefault()
    openContextMenu(event)
  }

  return {
    handleStationClick,
    handleEdgeClick,
    handleEdgeAnchorClick,
    handleMapClick,
    handleMapContextMenu,
  }
}
