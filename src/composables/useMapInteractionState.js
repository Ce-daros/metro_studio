import { reactive } from 'vue'

export function useMapInteractionState() {
  const dragState = reactive({
    stationIds: null,
    lastLngLat: null,
  })

  const anchorDragState = reactive({
    edgeId: null,
    anchorIndex: null,
  })

  const selectionBox = reactive({
    active: false,
    append: false,
    modifierType: 'none',
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  })

  let suppressNextMapClick = false

  function startStationDrag(stationIds, startLngLat) {
    dragState.stationIds = stationIds
    dragState.lastLngLat = startLngLat
  }

  function updateStationDragPosition(lngLat) {
    if (!dragState.stationIds) return
    dragState.lastLngLat = lngLat
  }

  function stopStationDrag() {
    dragState.stationIds = null
    dragState.lastLngLat = null
  }

  function isStationDragging() {
    return dragState.stationIds !== null
  }

  function startEdgeAnchorDrag(edgeId, anchorIndex) {
    anchorDragState.edgeId = edgeId
    anchorDragState.anchorIndex = anchorIndex
  }

  function stopEdgeAnchorDrag() {
    anchorDragState.edgeId = null
    anchorDragState.anchorIndex = null
  }

  function isAnchorDragging() {
    return anchorDragState.edgeId !== null
  }

  function startBoxSelection(startX, startY, append, modifierType) {
    selectionBox.active = true
    selectionBox.append = append
    selectionBox.modifierType = modifierType
    selectionBox.startX = startX
    selectionBox.startY = startY
    selectionBox.endX = startX
    selectionBox.endY = startY
  }

  function updateBoxSelection(endX, endY) {
    selectionBox.endX = endX
    selectionBox.endY = endY
  }

  function stopBoxSelection() {
    selectionBox.active = false
    selectionBox.append = false
    selectionBox.modifierType = 'none'
  }

  function isBoxSelecting() {
    return selectionBox.active
  }

  function setSuppressNextMapClick(value) {
    suppressNextMapClick = value
  }

  function shouldSuppressNextMapClick() {
    return suppressNextMapClick
  }

  function consumeSuppressFlag() {
    const value = suppressNextMapClick
    suppressNextMapClick = false
    return value
  }

  function isAnyDragging() {
    return isStationDragging() || isAnchorDragging() || isBoxSelecting()
  }

  return {
    dragState,
    anchorDragState,
    selectionBox,
    startStationDrag,
    updateStationDragPosition,
    stopStationDrag,
    isStationDragging,
    startEdgeAnchorDrag,
    stopEdgeAnchorDrag,
    isAnchorDragging,
    startBoxSelection,
    updateBoxSelection,
    stopBoxSelection,
    isBoxSelecting,
    setSuppressNextMapClick,
    shouldSuppressNextMapClick,
    consumeSuppressFlag,
    isAnyDragging,
  }
}
