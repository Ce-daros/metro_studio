import { haversineDistanceMeters } from '../../../lib/geo'
import {
  applyEdgeTimelinePatchForLine,
  applyEdgeTimelinePatchToAllLines,
  cloneEdgeLineTimeline,
  getEdgeLineTimeline,
  haveSameEdgeTimelineForLineIds,
  syncEdgeTimelineSummary,
} from '../../../lib/edgeTimeline'
import { createId } from '../../../lib/ids'
import { normalizeLineStyle } from '../../../lib/lineStyles'
import {
  buildEditableEdgeWaypoints,
  cloneLngLat,
  estimateDisplayPositionFromLngLat,
  findClosestSegmentInsertionIndex,
} from '../helpers'

export const edgeActions = {
  selectEdge(edgeId, options = {}) {
    if (!this.project) return
    const target = this.edgeById.get(edgeId)
    if (!target) return
    const multi = Boolean(options.multi || options.toggle)
    const toggle = Boolean(options.toggle)
    if (multi) {
      const selectedEdges = new Set(this.selectedEdgeIds || [])
      const selectedStations = new Set(this.selectedStationIds || [])
      if (toggle && selectedEdges.has(target.id)) {
        selectedEdges.delete(target.id)
        // 移除不再被任何选中线段引用的站点
        const stillNeeded = new Set()
        for (const eid of selectedEdges) {
          const e = this.edgeById.get(eid)
          if (e) { stillNeeded.add(e.fromStationId); stillNeeded.add(e.toStationId) }
        }
        for (const sid of selectedStations) {
          if (!stillNeeded.has(sid)) selectedStations.delete(sid)
        }
      } else {
        selectedEdges.add(target.id)
        if (target.fromStationId) selectedStations.add(target.fromStationId)
        if (target.toStationId) selectedStations.add(target.toStationId)
      }
      this.setSelectedEdges([...selectedEdges], { keepStations: true })
      this.setSelectedStations([...selectedStations], { keepEdges: true })
    } else {
      this.setSelectedEdges([target.id], { keepStations: true })
      const stationIds = [target.fromStationId, target.toStationId].filter(Boolean)
      this.setSelectedStations(stationIds, { keepEdges: true })
    }
    this.selectedEdgeAnchor = null
    this.pendingEdgeStartStationId = null
  },

  selectEdgeAnchor(edgeId, anchorIndex) {
    if (!this.project) return
    const edge = this.edgeById.get(edgeId)
    if (!edge) return
    const waypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!waypoints || waypoints.length < 3) return
    const normalizedIndex = Number(anchorIndex)
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > waypoints.length - 2) return
    this.selectedEdgeId = edge.id
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = {
      edgeId: edge.id,
      anchorIndex: normalizedIndex,
    }
    this.selectedStationId = null
    this.selectedStationIds = []
    this.pendingEdgeStartStationId = null
  },

  resolveEditableEdgeWaypoints(edge) {
    if (!this.project || !edge) return null
    const fromStation = this.stationById.get(edge.fromStationId)
    const toStation = this.stationById.get(edge.toStationId)
    if (!fromStation || !toStation) return null
    return buildEditableEdgeWaypoints(edge, fromStation.lngLat, toStation.lngLat)
  },

  addEdgeAnchor(edgeId, lngLat, options = {}) {
    if (!this.project) return null
    const edge = this.edgeById.get(edgeId)
    if (!edge) return null
    const point = cloneLngLat(lngLat)
    if (!point) return null
    const resolvedWaypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!resolvedWaypoints || resolvedWaypoints.length < 2) return null
    const waypoints = edge.isCurved
      ? resolvedWaypoints
      : [resolvedWaypoints[0], resolvedWaypoints[resolvedWaypoints.length - 1]]

    const requestedIndex = Number(options.insertIndex)
    const insertIndex = Number.isInteger(requestedIndex) && requestedIndex >= 1 && requestedIndex <= waypoints.length - 1
      ? requestedIndex
      : findClosestSegmentInsertionIndex(waypoints, point)

    edge.waypoints = [...waypoints.slice(0, insertIndex), point, ...waypoints.slice(insertIndex)]
    edge.isCurved = true
    this.selectedEdgeId = edge.id
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = {
      edgeId: edge.id,
      anchorIndex: insertIndex,
    }
    this.touchProject('新增锚点')
    return this.selectedEdgeAnchor
  },

  updateEdgeAnchor(edgeId, anchorIndex, lngLat) {
    if (!this.project) return false
    const edge = this.edgeById.get(edgeId)
    if (!edge) return false
    const point = cloneLngLat(lngLat)
    if (!point) return false
    const waypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!waypoints || waypoints.length < 3) return false

    const normalizedIndex = Number(anchorIndex)
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > waypoints.length - 2) return false
    waypoints[normalizedIndex] = point
    edge.waypoints = waypoints
    edge.isCurved = true
    this.selectedEdgeId = edge.id
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = {
      edgeId: edge.id,
      anchorIndex: normalizedIndex,
    }
    this.touchProject('')
    return true
  },

  removeEdgeAnchor(edgeId, anchorIndex) {
    if (!this.project) return false
    const edge = this.edgeById.get(edgeId)
    if (!edge) return false
    const waypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!waypoints || waypoints.length < 3) return false

    const normalizedIndex = Number(anchorIndex)
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > waypoints.length - 2) return false
    const nextWaypoints = waypoints.filter((_, index) => index !== normalizedIndex)
    edge.waypoints = nextWaypoints
    edge.isCurved = nextWaypoints.length >= 3
    this.selectedEdgeId = edge.id
    this.selectedEdgeIds = [edge.id]
    if (nextWaypoints.length < 3) {
      this.selectedEdgeAnchor = null
    } else {
      const nextAnchorIndex = Math.max(1, Math.min(normalizedIndex, nextWaypoints.length - 2))
      this.selectedEdgeAnchor = {
        edgeId: edge.id,
        anchorIndex: nextAnchorIndex,
      }
    }
    this.touchProject('删除锚点')
    return true
  },

  clearEdgeAnchors(edgeId) {
    if (!this.project) return false
    const edge = this.edgeById.get(edgeId)
    if (!edge) return false
    const waypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!waypoints || waypoints.length < 2) return false
    edge.waypoints = [waypoints[0], waypoints[waypoints.length - 1]]
    edge.isCurved = false
    this.selectedEdgeId = edge.id
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = null
    this.touchProject('清空线段锚点')
    return true
  },

  removeSelectedEdgeAnchor() {
    if (!this.selectedEdgeAnchor?.edgeId) return false
    return this.removeEdgeAnchor(this.selectedEdgeAnchor.edgeId, this.selectedEdgeAnchor.anchorIndex)
  },

  addEdgeBetweenStations(fromStationId, toStationId) {
    if (!this.project || fromStationId === toStationId) return null

    const fromStation = this.stationById.get(fromStationId)
    const toStation = this.stationById.get(toStationId)
    if (!fromStation || !toStation) return null

    const line = this.findOrCreateActiveLine()
    if (!line) return null

    const pairKey =
      fromStationId < toStationId
        ? `${fromStationId}__${toStationId}`
        : `${toStationId}__${fromStationId}`

    let edge = this.edgeByPairKey.get(pairKey)

    if (!edge) {
      edge = {
        id: createId('edge'),
        fromStationId,
        toStationId,
        waypoints: [fromStation.lngLat, toStation.lngLat],
        sharedByLineIds: [line.id],
        lengthMeters: haversineDistanceMeters(fromStation.lngLat, toStation.lngLat),
        isCurved: false,
        openingYear: this.currentEditYear,
        phase: this.currentEditPhase || null,
        lineTimeline: {
          [line.id]: {
            openingYear: this.currentEditYear,
            phase: this.currentEditPhase || '',
          },
        },
      }
      this.project.edges.push(syncEdgeTimelineSummary(edge))
    } else if (!edge.sharedByLineIds.includes(line.id)) {
      edge.sharedByLineIds.push(line.id)
      const reference = getEdgeLineTimeline(edge, edge.sharedByLineIds[0])
      edge.lineTimeline = {
        ...cloneEdgeLineTimeline(edge),
        [line.id]: {
          openingYear: this.currentEditYear ?? reference.openingYear ?? null,
          phase: this.currentEditPhase || reference.phase || '',
        },
      }
      syncEdgeTimelineSummary(edge)
    } else {
      syncEdgeTimelineSummary(edge)
    }

    if (!line.edgeIds.includes(edge.id)) {
      line.edgeIds.push(edge.id)
    }

    this.recomputeStationLineMembership()
    this.selectedEdgeId = edge.id
    this.selectedEdgeIds = [edge.id]
    this.selectedEdgeAnchor = null
    this.touchProject('新增线段')
    return edge
  },

  deleteSelectedEdge() {
    if (!this.project) return
    const selectedEdgeIds =
      Array.isArray(this.selectedEdgeIds) && this.selectedEdgeIds.length
        ? this.selectedEdgeIds
        : this.selectedEdgeId
          ? [this.selectedEdgeId]
          : []
    if (!selectedEdgeIds.length) return
    const deletingEdgeIdSet = new Set(selectedEdgeIds)
    const deletingEdges = this.project.edges.filter((edge) => deletingEdgeIdSet.has(edge.id))
    if (!deletingEdges.length) {
      this.selectedEdgeId = null
      this.selectedEdgeIds = []
      this.selectedEdgeAnchor = null
      return
    }

    this.project.edges = this.project.edges.filter((edge) => !deletingEdgeIdSet.has(edge.id))
    for (const line of this.project.lines) {
      line.edgeIds = (line.edgeIds || []).filter((eid) => !deletingEdgeIdSet.has(eid))
    }
    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }

    this.recomputeStationLineMembership()

    const edgeStationIdSet = new Set()
    for (const edge of this.project.edges) {
      edgeStationIdSet.add(edge.fromStationId)
      edgeStationIdSet.add(edge.toStationId)
    }

    const removingStationIdSet = new Set()
    for (const station of this.project.stations) {
      if (edgeStationIdSet.has(station.id)) continue
      if (!removingStationIdSet.has(station.id)) {
        removingStationIdSet.add(station.id)
      }
    }

    if (removingStationIdSet.size) {
      this.project.stations = this.project.stations.filter((s) => !removingStationIdSet.has(s.id))
      this.project.manualTransfers = (this.project.manualTransfers || []).filter(
        (t) => !removingStationIdSet.has(t?.stationAId) && !removingStationIdSet.has(t?.stationBId),
      )
      this.selectedStationIds = this.selectedStationIds.filter((id) => !removingStationIdSet.has(id))
      if (this.selectedStationId && removingStationIdSet.has(this.selectedStationId)) {
        this.selectedStationId = null
      }
      if (this.pendingEdgeStartStationId && removingStationIdSet.has(this.pendingEdgeStartStationId)) {
        this.pendingEdgeStartStationId = null
      }
    }

    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
    this.touchProject(`删除线段: ${deletingEdges.length} 条`)
  },

  deleteEdge(edgeId) {
    if (!this.project || !edgeId) return
    const deletingEdgeIdSet = new Set([edgeId])
    this.project.edges = this.project.edges.filter((edge) => !deletingEdgeIdSet.has(edge.id))
    for (const line of this.project.lines) {
      line.edgeIds = (line.edgeIds || []).filter((eid) => !deletingEdgeIdSet.has(eid))
    }
    this.project.lines = this.project.lines.filter((line) => line.edgeIds.length > 0)
    if (!this.project.lines.length) {
      this.addLine({})
    }
    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }
    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
    this.recomputeStationLineMembership()
    this.touchProject('已删除线段')
  },

  updateEdgesBatch(edgeIds, patch = {}) {
    if (!this.project) return { updatedCount: 0 }
    const targetIds = [...new Set((Array.isArray(edgeIds) ? edgeIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
    if (!targetIds.length) return { updatedCount: 0 }

    const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    const targetLine = patch.targetLineId ? lineById.get(patch.targetLineId) : null
    const hasTargetLinePatch = Boolean(targetLine)
    const hasStylePatch = patch.lineStyle != null
    const nextStyle = hasStylePatch ? normalizeLineStyle(patch.lineStyle) : null
    const hasCurvePatch = patch.isCurved != null
    const nextIsCurved = hasCurvePatch ? Boolean(patch.isCurved) : false

    let updatedCount = 0
    for (const edgeId of targetIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      let changed = false

      if (hasTargetLinePatch) {
        const previous = Array.isArray(edge.sharedByLineIds) ? edge.sharedByLineIds : []
        const sameLine = previous.length === 1 && previous[0] === targetLine.id
        if (!sameLine) {
          const referenceTimeline = getEdgeLineTimeline(edge, previous[0] || targetLine.id)
          edge.sharedByLineIds = [targetLine.id]
          edge.lineTimeline = {
            [targetLine.id]: {
              openingYear: referenceTimeline.openingYear ?? null,
              phase: referenceTimeline.phase || '',
            },
          }
          syncEdgeTimelineSummary(edge)
          changed = true
        }
      }

      if (hasStylePatch) {
        const currentLine = lineById.get(edge.sharedByLineIds?.[0])
        const baseLineStyle = normalizeLineStyle(currentLine?.style)
        const previousStyle = normalizeLineStyle(edge.lineStyleOverride || baseLineStyle)
        if (nextStyle === baseLineStyle) {
          if (edge.lineStyleOverride != null) {
            delete edge.lineStyleOverride
            changed = true
          }
        } else if (previousStyle !== nextStyle || edge.lineStyleOverride !== nextStyle) {
          edge.lineStyleOverride = nextStyle
          changed = true
        }
      }

      if (hasCurvePatch) {
        if (nextIsCurved) {
          if (!edge.isCurved) {
            edge.isCurved = true
            changed = true
          }
        } else {
          const resolved = this.resolveEditableEdgeWaypoints(edge)
          if (resolved && resolved.length >= 2) {
            const collapsed = [resolved[0], resolved[resolved.length - 1]]
            if ((edge.waypoints || []).length !== collapsed.length || edge.isCurved) {
              edge.waypoints = collapsed
              edge.isCurved = false
              changed = true
            }
          }
        }
      }

      if (patch.openingYear !== undefined) {
        changed = applyEdgeTimelinePatchToAllLines(edge, { openingYear: patch.openingYear }) || changed
      }

      if (patch.phase !== undefined) {
        changed = applyEdgeTimelinePatchToAllLines(edge, { phase: patch.phase || '' }) || changed
      }

      if (patch.lineTimelineByLineId && typeof patch.lineTimelineByLineId === 'object') {
        for (const [lineId, timelinePatch] of Object.entries(patch.lineTimelineByLineId)) {
          changed = applyEdgeTimelinePatchForLine(edge, lineId, timelinePatch || {}) || changed
        }
      }

      if (changed) {
        updatedCount += 1
      }
    }

    if (!updatedCount) return { updatedCount: 0 }

    if (hasTargetLinePatch) {
      for (const line of this.project.lines) {
        line.edgeIds = []
      }
      for (const edge of this.project.edges) {
        for (const lineId of edge.sharedByLineIds || []) {
          const line = lineById.get(lineId)
          if (!line) continue
          if (!line.edgeIds.includes(edge.id)) {
            line.edgeIds.push(edge.id)
          }
        }
      }
    }

    this.recomputeStationLineMembership()
    this.touchProject(`批量更新线段: ${updatedCount} 条`)
    return { updatedCount }
  },

  reassignSelectedEdgesToLine(toLineId, options = {}) {
    if (!this.project) return false
    const targetLine = this.lineById.get(toLineId)
    if (!targetLine) return false

    const selectedEdgeIds = Array.isArray(options.edgeIds)
      ? options.edgeIds
      : this.selectedEdgeIds?.length
        ? this.selectedEdgeIds
        : this.selectedEdgeId
          ? [this.selectedEdgeId]
        : []
    const edgeIds = [...new Set(selectedEdgeIds.map((id) => String(id || '').trim()).filter(Boolean))]
    if (!edgeIds.length) {
      this.statusText = '请先选中线段'
      return false
    }

    const edgeById = new Map(this.project.edges.map((edge) => [edge.id, edge]))
    let movedCount = 0
    for (const edgeId of edgeIds) {
      const edge = edgeById.get(edgeId)
      if (!edge) continue
      const previous = Array.isArray(edge.sharedByLineIds) ? edge.sharedByLineIds : []
      const unchanged = previous.length === 1 && previous[0] === targetLine.id
      if (unchanged) continue
      const referenceTimeline = getEdgeLineTimeline(edge, previous[0] || targetLine.id)
      edge.sharedByLineIds = [targetLine.id]
      edge.lineTimeline = {
        [targetLine.id]: {
          openingYear: referenceTimeline.openingYear ?? null,
          phase: referenceTimeline.phase || '',
        },
      }
      syncEdgeTimelineSummary(edge)
      movedCount += 1
    }

    if (!movedCount) {
      this.statusText = '未找到可迁移线段'
      return false
    }

    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    for (const line of this.project.lines) {
      line.edgeIds = []
    }
    for (const edge of this.project.edges) {
      for (const lineId of edge.sharedByLineIds || []) {
        const line = lineById.get(lineId)
        if (!line) continue
        if (!line.edgeIds.includes(edge.id)) {
          line.edgeIds.push(edge.id)
        }
      }
    }

    this.recomputeStationLineMembership()
    const targetName = targetLine.nameZh || targetLine.id
    this.touchProject(`迁移选中线段所属线: -> ${targetName}（${movedCount}段）`)
    this.statusText = `已将 ${movedCount} 条选中线段迁移到 ${targetName}`
    return true
  },

  splitEdgeAtPoint(edgeId, lngLat) {
    if (!this.project || !Array.isArray(lngLat) || lngLat.length !== 2) return null
    const edge = this.edgeById.get(edgeId)
    if (!edge) return null

    const fromStation = this.stationById.get(edge.fromStationId)
    const toStation = this.stationById.get(edge.toStationId)
    if (!fromStation || !toStation) return null

    const point = cloneLngLat(lngLat)
    if (!point) return null

    const resolvedWaypoints = this.resolveEditableEdgeWaypoints(edge)
    if (!resolvedWaypoints || resolvedWaypoints.length < 2) return null

    const insertIndex = findClosestSegmentInsertionIndex(resolvedWaypoints, point)
    if (insertIndex < 1 || insertIndex >= resolvedWaypoints.length) return null

    const nextIndex = this.project.stations.length + 1
    const newStation = {
      id: createId('station'),
      nameZh: `新站 ${nextIndex}`,
      nameEn: `Station ${nextIndex}`,
      lngLat: [...point],
      displayPos: estimateDisplayPositionFromLngLat(this.project.stations, point),
      isInterchange: false,
      underConstruction: false,
      proposed: false,
      lineIds: [...(edge.sharedByLineIds || [])],
      transferLineIds: [],
    }
    this.project.stations.push(newStation)

    const firstEdgeWaypoints = resolvedWaypoints.slice(0, insertIndex + 1)
    const secondEdgeWaypoints = resolvedWaypoints.slice(insertIndex)

    const firstEdge = syncEdgeTimelineSummary({
      id: createId('edge'),
      fromStationId: edge.fromStationId,
      toStationId: newStation.id,
      waypoints: [...firstEdgeWaypoints],
      sharedByLineIds: [...(edge.sharedByLineIds || [])],
      lengthMeters: haversineDistanceMeters(fromStation.lngLat, newStation.lngLat),
      isCurved: firstEdgeWaypoints.length > 2,
      openingYear: edge.openingYear,
      phase: edge.phase || '',
      lineTimeline: cloneEdgeLineTimeline(edge),
    })

    const secondEdge = syncEdgeTimelineSummary({
      id: createId('edge'),
      fromStationId: newStation.id,
      toStationId: edge.toStationId,
      waypoints: [...secondEdgeWaypoints],
      sharedByLineIds: [...(edge.sharedByLineIds || [])],
      lengthMeters: haversineDistanceMeters(newStation.lngLat, toStation.lngLat),
      isCurved: secondEdgeWaypoints.length > 2,
      openingYear: edge.openingYear,
      phase: edge.phase || '',
      lineTimeline: cloneEdgeLineTimeline(edge),
    })

    this.project.edges = this.project.edges.filter((e) => e.id !== edge.id)
    this.project.edges.push(firstEdge, secondEdge)

    for (const line of this.project.lines) {
      const lineEdgeIds = line.edgeIds || []
      const edgeIndex = lineEdgeIds.indexOf(edge.id)
      if (edgeIndex !== -1) {
        const newEdgeIds = [...lineEdgeIds]
        newEdgeIds.splice(edgeIndex, 1, firstEdge.id, secondEdge.id)
        line.edgeIds = newEdgeIds
      }
    }

    if (Array.isArray(this.selectedEdgeIds)) {
      const selectedIndex = this.selectedEdgeIds.indexOf(edge.id)
      if (selectedIndex !== -1) {
        const newSelected = [...this.selectedEdgeIds]
        newSelected.splice(selectedIndex, 1, firstEdge.id)
        this.selectedEdgeIds = newSelected
      }
    }
    if (this.selectedEdgeId === edge.id) {
      this.selectedEdgeId = firstEdge.id
    }
    this.selectedEdgeAnchor = null

    this.recomputeStationLineMembership()
    this.touchProject('分割线段: 插入新站')
    return { station: newStation, edges: [firstEdge, secondEdge] }
  },

  canMergeEdgesAtStation(stationId) {
    if (!this.project) return false
    const station = this.stationById.get(stationId)
    if (!station) return false

    const connectedEdges = (this.project.edges || []).filter(
      (edge) => edge.fromStationId === stationId || edge.toStationId === stationId
    )

    if (connectedEdges.length !== 2) return false

    const [edgeA, edgeB] = connectedEdges
    const lineIdsA = [...new Set(edgeA.sharedByLineIds || [])]
    const lineIdsB = [...new Set(edgeB.sharedByLineIds || [])]
    if (lineIdsA.length !== lineIdsB.length) return false

    const setB = new Set(lineIdsB)
    for (const lineId of lineIdsA) {
      if (!setB.has(lineId)) return false
    }

    return haveSameEdgeTimelineForLineIds(edgeA, edgeB, lineIdsA)
  },

  mergeEdgesAtStation(stationId) {
    if (!this.project) return false
    const station = this.stationById.get(stationId)
    if (!station) return false

    const connectedEdges = (this.project.edges || []).filter(
      (edge) => edge.fromStationId === stationId || edge.toStationId === stationId
    )

    if (connectedEdges.length !== 2) {
      this.statusText = '该站点不恰好连接 2 条线段，无法合并'
      return false
    }

    const [edgeA, edgeB] = connectedEdges
    const lineIdsA = [...new Set(edgeA.sharedByLineIds || [])]
    const lineIdsB = [...new Set(edgeB.sharedByLineIds || [])]
    const sameLineSet = lineIdsA.length === lineIdsB.length && lineIdsA.every((lineId) => lineIdsB.includes(lineId))

    if (!sameLineSet) {
      this.statusText = '共线归属不一致，无法合并线段'
      return false
    }

    if (!haveSameEdgeTimelineForLineIds(edgeA, edgeB, lineIdsA)) {
      this.statusText = '共线段的开通年份或分期不同，无法合并'
      return false
    }

    let firstEdge, secondEdge, firstStationId, secondStationId
    if (edgeA.toStationId === stationId) {
      firstEdge = edgeA
      firstStationId = edgeA.fromStationId
    } else {
      firstEdge = edgeB
      firstStationId = edgeB.fromStationId
    }

    if (edgeB.fromStationId === stationId) {
      secondEdge = edgeB
      secondStationId = edgeB.toStationId
    } else {
      secondEdge = edgeA
      secondStationId = edgeA.toStationId
    }

    const firstStation = this.stationById.get(firstStationId)
    const secondStation = this.stationById.get(secondStationId)
    if (!firstStation || !secondStation) return false

    const firstWaypoints = this.resolveEditableEdgeWaypoints(firstEdge)
    const secondWaypoints = this.resolveEditableEdgeWaypoints(secondEdge)
    if (!firstWaypoints || !secondWaypoints) return false

    const mergedWaypoints = [...firstWaypoints.slice(0, -1), ...secondWaypoints.slice(1)]

    const mergedLineIds = [...new Set(firstEdge.sharedByLineIds || [])]

    const mergedEdge = syncEdgeTimelineSummary({
      id: createId('edge'),
      fromStationId: firstStationId,
      toStationId: secondStationId,
      waypoints: mergedWaypoints,
      sharedByLineIds: mergedLineIds,
      lengthMeters: haversineDistanceMeters(firstStation.lngLat, secondStation.lngLat),
      isCurved: mergedWaypoints.length > 2,
      lineTimeline: cloneEdgeLineTimeline(firstEdge, mergedLineIds),
    })

    this.project.edges = this.project.edges.filter((e) => e.id !== firstEdge.id && e.id !== secondEdge.id)
    this.project.edges.push(mergedEdge)

    this.project.stations = this.project.stations.filter((s) => s.id !== stationId)
    this.project.manualTransfers = (this.project.manualTransfers || []).filter(
      (t) => t.stationAId !== stationId && t.stationBId !== stationId
    )

    const lineById = new Map(this.project.lines.map((line) => [line.id, line]))
    for (const line of this.project.lines) {
      const lineEdgeIds = line.edgeIds || []
      const firstIndex = lineEdgeIds.indexOf(firstEdge.id)
      const secondIndex = lineEdgeIds.indexOf(secondEdge.id)
      const hasLine = mergedLineIds.includes(line.id)

      if (hasLine && (firstIndex !== -1 || secondIndex !== -1)) {
        const newEdgeIds = lineEdgeIds.filter((id) => id !== firstEdge.id && id !== secondEdge.id)
        if (!newEdgeIds.includes(mergedEdge.id)) {
          const insertPos = Math.max(firstIndex, secondIndex)
          if (insertPos !== -1) {
            newEdgeIds.splice(insertPos, 0, mergedEdge.id)
          } else {
            newEdgeIds.push(mergedEdge.id)
          }
        }
        line.edgeIds = newEdgeIds
       } else {
         line.edgeIds = lineEdgeIds.filter((id) => id !== firstEdge.id && id !== secondEdge.id)
       }
     }

    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }

    if (this.selectedStationId === stationId) {
      this.selectedStationId = null
    }
    this.selectedStationIds = (this.selectedStationIds || []).filter((id) => id !== stationId)

    const selectedEdges = new Set(this.selectedEdgeIds || [])
    if (selectedEdges.has(firstEdge.id) || selectedEdges.has(secondEdge.id)) {
        this.selectedEdgeIds = this.selectedEdgeIds.filter((edgeId) => !selectedEdges.has(edgeId))
        if (!this.selectedEdgeIds.length) {
          this.selectedEdgeId = null
          this.selectedEdgeAnchor = null
        }
      }

    this.touchProject('合并边')
    return true
  },

}
