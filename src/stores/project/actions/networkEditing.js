import { createId } from '../../../lib/ids'
import {
  buildTransferEffectiveLineIds,
  normalizeManualTransfers,
} from '../../../lib/transfer'
import { cloneLngLat } from '../helpers'

import { stationActions } from './stationActions'
import { stationAiActions } from './stationAiActions'
import { transferActions } from './transferActions'
import { lineActions } from './lineActions'
import { edgeActions } from './edgeActions'

const networkEditingActions = {
  ...stationActions,
  ...stationAiActions,
  ...transferActions,
  ...lineActions,
  ...edgeActions,

  syncConnectedEdgeEndpoints(stationId, lngLat) {
    if (!this.project) return
    const safePoint = cloneLngLat(lngLat)
    if (!safePoint) return
    for (const edge of this.project.edges || []) {
      if (!Array.isArray(edge.waypoints) || edge.waypoints.length < 2) continue
      if (edge.fromStationId === stationId) {
        edge.waypoints[0] = [...safePoint]
      }
      if (edge.toStationId === stationId) {
        edge.waypoints[edge.waypoints.length - 1] = [...safePoint]
      }
    }
  },

  recomputeStationLineMembership() {
    if (!this.project) return
    const stationIds = (this.project.stations || []).map((station) => station.id)
    const stationIdSet = new Set(stationIds)
    this.project.manualTransfers = normalizeManualTransfers(this.project.manualTransfers, stationIdSet).map((transfer) => ({
      ...transfer,
      id: transfer.id || createId('transfer'),
    }))
    const stationLineSet = new Map(this.project.stations.map((station) => [station.id, new Set()]))
    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
    this.selectedEdgeIds = (this.selectedEdgeIds || []).filter((edgeId) => edgeById.has(edgeId))
    if (!this.selectedEdgeId && this.selectedEdgeIds.length) {
      this.selectedEdgeId = this.selectedEdgeIds[this.selectedEdgeIds.length - 1]
    }
    if (this.selectedEdgeId && !edgeById.has(this.selectedEdgeId)) {
      this.selectedEdgeId = this.selectedEdgeIds.length ? this.selectedEdgeIds[this.selectedEdgeIds.length - 1] : null
      if (!this.selectedEdgeId) {
        this.selectedEdgeAnchor = null
      }
    }
    if (this.selectedEdgeAnchor) {
      const selectedAnchorEdge = edgeById.get(this.selectedEdgeAnchor.edgeId)
      const waypoints = this.resolveEditableEdgeWaypoints(selectedAnchorEdge)
      const maxAnchorIndex = waypoints ? waypoints.length - 2 : 0
      if (!waypoints || maxAnchorIndex < 1 || this.selectedEdgeAnchor.anchorIndex > maxAnchorIndex) {
        this.selectedEdgeAnchor = null
      }
    }

    for (const line of this.project.lines) {
      for (const edgeId of line.edgeIds) {
        const edge = edgeById.get(edgeId)
        if (!edge) continue
        stationLineSet.get(edge.fromStationId)?.add(line.id)
        stationLineSet.get(edge.toStationId)?.add(line.id)
      }
    }

    const { effectiveLineIdsByStationId } = buildTransferEffectiveLineIds(
      stationIds,
      this.project.manualTransfers,
      stationLineSet,
    )

    for (const station of this.project.stations) {
      const hadLineMembership = Array.isArray(station.lineIds) && station.lineIds.length > 0
      const previousUnderConstruction = Boolean(station.underConstruction)
      const previousProposed = Boolean(station.proposed)
      const lineIds = [...(stationLineSet.get(station.id) || [])]
      const transferLineIds = [...(effectiveLineIdsByStationId.get(station.id) || lineIds)]
      station.lineIds = lineIds
      station.transferLineIds = transferLineIds
      station.isInterchange = transferLineIds.length > 1
      if (lineIds.length > 0) {
        station.underConstruction = lineIds.some((lineId) => lineById.get(lineId)?.status === 'construction')
        station.proposed = lineIds.some((lineId) => lineById.get(lineId)?.status === 'proposed')
        continue
      }

      // Preserve explicit status flags for standalone imported stations.
      // If a station previously had line membership and now has none, clear derived flags.
      if (hadLineMembership) {
        station.underConstruction = false
        station.proposed = false
      } else {
        station.underConstruction = previousUnderConstruction
        station.proposed = previousProposed
      }
    }
  },

  setCurrentEditYear(year) {
    const normalizedYear = Number.isFinite(year) ? Math.floor(Number(year)) : 2010
    this.currentEditYear = normalizedYear
  },

  setCurrentEditPhase(phase) {
    this.currentEditPhase = String(phase || '').trim()
  },
}

export { networkEditingActions }
