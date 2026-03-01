import {
  LAYER_EDGE_ANCHORS_HIT,
  LAYER_EDGES_HIT,
  LAYER_STATIONS,
} from '../components/map-editor/constants'

export function useMapDragHandlers({
  store,
  getMap,
  closeContextMenu,
  interactionState,
  updateRouteDrawPreview,
  clearRouteDrawPreview,
}) {
  function isRouteDrawMode() {
    return store.mode === 'route-draw' || store.mode === 'route-draw-naming'
  }

  function startStationDrag(event) {
    if (store.navigation?.active) return
    const map = getMap()
    closeContextMenu()

    if (store.mode !== 'select') return
    const stationId = event.features?.[0]?.properties?.id
    if (!stationId) return
    const mouseEvent = event.originalEvent
    if (mouseEvent?.shiftKey || mouseEvent?.ctrlKey || mouseEvent?.metaKey) {
      return
    }

    if (!store.selectedStationIds.includes(stationId)) {
      store.selectStation(stationId)
    }
    const stationIds = store.selectedStationIds.includes(stationId) ? [...store.selectedStationIds] : [stationId]
    interactionState.startStationDrag(stationIds, [event.lngLat.lng, event.lngLat.lat])
    map.getCanvas().style.cursor = 'grabbing'
    map.dragPan.disable()
  }

  function startEdgeAnchorDrag(event) {
    const map = getMap()
    closeContextMenu()

    if (store.mode !== 'select') return
    const edgeId = event.features?.[0]?.properties?.edgeId
    const anchorIndexRaw = event.features?.[0]?.properties?.anchorIndex
    const anchorIndex = Number(anchorIndexRaw)
    if (!edgeId || !Number.isInteger(anchorIndex)) return

    store.selectEdgeAnchor(edgeId, anchorIndex)
    interactionState.startEdgeAnchorDrag(edgeId, anchorIndex)
    map.getCanvas().style.cursor = 'grabbing'
    map.dragPan.disable()
    interactionState.setSuppressNextMapClick(true)
  }

  function onMouseMove(event) {
    if (isRouteDrawMode() && !interactionState.isBoxSelecting() && !interactionState.isStationDragging() && !interactionState.isAnchorDragging()) {
      updateRouteDrawPreview(event)
    } else {
      clearRouteDrawPreview()
    }

    if (interactionState.isBoxSelecting()) {
      interactionState.updateBoxSelection(event.point.x, event.point.y)
    }

    if (interactionState.isAnchorDragging()) {
      const { edgeId, anchorIndex } = interactionState.anchorDragState
      store.updateEdgeAnchor(edgeId, anchorIndex, [event.lngLat.lng, event.lngLat.lat])
      return
    }

    if (!interactionState.isStationDragging()) return
    const { stationIds, lastLngLat } = interactionState.dragState
    const delta = [event.lngLat.lng - lastLngLat[0], event.lngLat.lat - lastLngLat[1]]
    interactionState.updateStationDragPosition([event.lngLat.lng, event.lngLat.lat])
    store.moveStationsByDelta(stationIds, delta)
  }

  function stopStationDrag() {
    const map = getMap()

    if (interactionState.isBoxSelecting()) {
      const { startX, startY, endX, endY, append, modifierType } = interactionState.selectionBox
      const minX = Math.min(startX, endX)
      const maxX = Math.max(startX, endX)
      const minY = Math.min(startY, endY)
      const maxY = Math.max(startY, endY)

      const selectionBounds = [
        [minX, minY],
        [maxX, maxY],
      ]
      const pickedStationIds = [
        ...new Set(
          map
            .queryRenderedFeatures(selectionBounds, { layers: [LAYER_STATIONS] })
            .map((feature) => String(feature?.properties?.id || '').trim())
            .filter(Boolean),
        ),
      ]
      const pickedEdgeIds = [
        ...new Set(
          map
            .queryRenderedFeatures(selectionBounds, { layers: [LAYER_EDGES_HIT] })
            .map((feature) => String(feature?.properties?.id || '').trim())
            .filter(Boolean),
        ),
      ]

      if (store.styleBrush.active) {
        if (store.styleBrush.sourceType === 'station' && pickedStationIds.length) {
          store.applyStyleToStations(pickedStationIds)
        } else if (store.styleBrush.sourceType === 'edge' && pickedEdgeIds.length) {
          store.applyStyleToEdges(pickedEdgeIds)
        }
      } else {
        const hasSelection = pickedStationIds.length > 0 || pickedEdgeIds.length > 0

        if (hasSelection) {
          if (modifierType === 'ctrl') {
            // Ctrl: 减选 - 从当前选择中移除框内的对象
            if (pickedStationIds.length > 0) {
              const currentStations = new Set(store.selectedStationIds || [])
              pickedStationIds.forEach(id => currentStations.delete(id))
              store.setSelectedStations([...currentStations], { keepEdges: true })
            }
            if (pickedEdgeIds.length > 0) {
              const currentEdges = new Set(store.selectedEdgeIds || [])
              pickedEdgeIds.forEach(id => currentEdges.delete(id))
              store.setSelectedEdges([...currentEdges], { keepStations: true })
            }
          } else if (append) {
            // Shift: 加选 - 添加框内的对象到当前选择
            if (pickedStationIds.length > 0) {
              store.selectStations(pickedStationIds, { replace: false, keepEdges: true })
            }
            if (pickedEdgeIds.length > 0) {
              store.selectEdges(pickedEdgeIds, { replace: false, keepStations: true })
            }
          } else {
            // 无修饰键: 清空之前的选择，选中框内所有
            store.setSelectedStations(pickedStationIds, { keepEdges: true })
            store.setSelectedEdges(pickedEdgeIds, { keepStations: true })
          }
        } else if (!append) {
          store.clearSelection()
        }
      }
      interactionState.setSuppressNextMapClick(true)
    }

    if (interactionState.isAnchorDragging()) {
      interactionState.stopEdgeAnchorDrag()
    }

    if (interactionState.isStationDragging()) {
      interactionState.stopStationDrag()
    }

    if (interactionState.isBoxSelecting()) {
      interactionState.stopBoxSelection()
    }

    map.getCanvas().style.cursor = ''
    map.dragPan.enable()
  }

  function startBoxSelection(event) {
    const map = getMap()
    closeContextMenu()

    if (store.mode !== 'select' && store.mode !== 'box-select') return
    if (interactionState.isBoxSelecting()) return
    const mouseEvent = event.originalEvent
    if (mouseEvent?.button !== 0) return
    const isShift = Boolean(mouseEvent?.shiftKey)
    const isCtrl = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey)
    const modifier = isShift || isCtrl

    // 在专门的框选模式下，不需要按修饰键
    if (!modifier && store.mode !== 'box-select') return

    const hitAnchors = map.queryRenderedFeatures(event.point, { layers: [LAYER_EDGE_ANCHORS_HIT] })
    const hitStations = map.queryRenderedFeatures(event.point, { layers: [LAYER_STATIONS] })
    const hitEdges = map.queryRenderedFeatures(event.point, { layers: [LAYER_EDGES_HIT] })
    if (hitAnchors.length) return
    if (hitStations.length) return
    if (hitEdges.length) return

    // 确定修饰键类型: shift=加选, ctrl=减选, none=替换
    let effectiveModifierType = 'none'
    if (isShift) effectiveModifierType = 'shift'
    else if (isCtrl) effectiveModifierType = 'ctrl'

    interactionState.startBoxSelection(event.point.x, event.point.y, modifier, effectiveModifierType)
    map.getCanvas().style.cursor = 'crosshair'
    map.dragPan.disable()
  }

  function onInteractiveFeatureEnter() {
    const map = getMap()
    if (!map || interactionState.isAnyDragging()) return
    map.getCanvas().style.cursor = 'pointer'
  }

  function onInteractiveFeatureLeave() {
    const map = getMap()
    if (!map || interactionState.isAnyDragging()) return
    map.getCanvas().style.cursor = ''
  }

  return {
    startStationDrag,
    startEdgeAnchorDrag,
    onMouseMove,
    stopStationDrag,
    startBoxSelection,
    onInteractiveFeatureEnter,
    onInteractiveFeatureLeave,
  }
}
