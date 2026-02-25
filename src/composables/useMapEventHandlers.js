import { useMapInteractionState } from './useMapInteractionState'
import { useMapClickHandlers } from './useMapClickHandlers'
import { useMapDragHandlers } from './useMapDragHandlers'

export function useMapEventHandlers({
  store,
  getMap,
  closeContextMenu,
  closeLineSelectionMenu,
  openContextMenu,
  updateRouteDrawPreview,
  clearRouteDrawPreview,
  openLineSelectionMenu,
  refreshRouteDrawPreviewProjectedPoints,
  contextMenu,
}) {
  const interactionState = useMapInteractionState()

  const clickHandlers = useMapClickHandlers({
    store,
    getMap,
    closeContextMenu,
    openContextMenu,
    openLineSelectionMenu,
    interactionState,
  })

  const dragHandlers = useMapDragHandlers({
    store,
    getMap,
    closeContextMenu,
    interactionState,
    updateRouteDrawPreview,
    clearRouteDrawPreview,
  })

  function handleWindowResize(adjustContextMenuPosition) {
    const map = getMap()
    if (map) {
      map.resize()
    }
    if (contextMenu.visible) {
      adjustContextMenuPosition()
    }
  }

  return {
    selectionBox: interactionState.selectionBox,
    ...clickHandlers,
    ...dragHandlers,
    handleWindowResize,
  }
}
