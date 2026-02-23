export const styleBrushActions = {
  activateStyleBrush(objectId, objectType) {
    if (!this.project) return false

    let sourceObject = null
    let extractedStyle = null

    if (objectType === 'station') {
      sourceObject = this.project.stations.find((s) => s.id === objectId)
      if (!sourceObject) return false
      extractedStyle = {
        underConstruction: sourceObject.underConstruction,
        proposed: sourceObject.proposed,
      }
    } else if (objectType === 'edge') {
      sourceObject = this.project.edges.find((e) => e.id === objectId)
      if (!sourceObject) return false
      extractedStyle = {
        lineStyleOverride: sourceObject.lineStyleOverride,
        isCurved: sourceObject.isCurved,
        openingYear: sourceObject.openingYear,
      }
    } else if (objectType === 'line') {
      sourceObject = this.project.lines.find((l) => l.id === objectId)
      if (!sourceObject) return false
      extractedStyle = {
        color: sourceObject.color,
        status: sourceObject.status,
        style: sourceObject.style,
      }
    } else {
      return false
    }

    this.styleBrush = {
      active: true,
      sourceType: objectType,
      sourceId: objectId,
      styleData: extractedStyle,
    }

    this.mode = 'style-brush'
    this.statusText = `已拾取${this.getObjectTypeLabel(objectType)}样式，点击对象应用`
    return true
  },

  deactivateStyleBrush() {
    this.styleBrush = {
      active: false,
      sourceType: null,
      sourceId: null,
      styleData: null,
    }
    this.mode = 'select'
    this.statusText = ''
  },

  applyStyleToStation(targetStationId) {
    if (!this.project || !this.styleBrush.active || this.styleBrush.sourceType !== 'station') {
      this.statusText = '只能应用站点样式到站点'
      return false
    }

    const targetStation = this.project.stations.find((s) => s.id === targetStationId)
    if (!targetStation) return false

    const sourceStyle = this.styleBrush.styleData

    let changed = false
    if (targetStation.underConstruction !== sourceStyle.underConstruction) {
      targetStation.underConstruction = sourceStyle.underConstruction
      changed = true
    }
    if (targetStation.proposed !== sourceStyle.proposed) {
      targetStation.proposed = sourceStyle.proposed
      changed = true
    }

    if (changed) {
      this.touchProject('样式刷应用站点')
      this.statusText = `已应用样式到站点: ${targetStation.nameZh || targetStation.id}`
    }

    return changed
  },

  applyStyleToEdge(targetEdgeId) {
    if (!this.project || !this.styleBrush.active || this.styleBrush.sourceType !== 'edge') {
      this.statusText = '只能应用线段样式到线段'
      return false
    }

    const targetEdge = this.project.edges.find((e) => e.id === targetEdgeId)
    if (!targetEdge) return false

    const sourceStyle = this.styleBrush.styleData

    let changed = false

    if (targetEdge.lineStyleOverride !== sourceStyle.lineStyleOverride) {
      targetEdge.lineStyleOverride = sourceStyle.lineStyleOverride
      changed = true
    }

    if (targetEdge.isCurved !== sourceStyle.isCurved) {
      targetEdge.isCurved = sourceStyle.isCurved
      changed = true
    }

    if (targetEdge.openingYear !== sourceStyle.openingYear) {
      targetEdge.openingYear = sourceStyle.openingYear
      changed = true
    }

    if (changed) {
      this.recomputeStationLineMembership()
      this.touchProject('样式刷应用线段')
      this.statusText = `已应用样式到线段`
    }

    return changed
  },

  applyStyleToLine(targetLineId) {
    if (!this.project || !this.styleBrush.active || this.styleBrush.sourceType !== 'line') {
      this.statusText = '只能应用线路样式到线路'
      return false
    }

    const targetLine = this.project.lines.find((l) => l.id === targetLineId)
    if (!targetLine) return false

    const sourceStyle = this.styleBrush.styleData

    let changed = false

    if (targetLine.color !== sourceStyle.color) {
      targetLine.color = sourceStyle.color
      changed = true
    }

    if (targetLine.status !== sourceStyle.status) {
      targetLine.status = sourceStyle.status
      changed = true
    }

    if (targetLine.style !== sourceStyle.style) {
      targetLine.style = sourceStyle.style
      changed = true
    }

    if (changed) {
      this.recomputeStationLineMembership()
      this.touchProject('样式刷应用线路')
      this.statusText = `已应用样式到线路: ${targetLine.nameZh || targetLine.id}`
    }

    return changed
  },

  applyStyleToStations(stationIds) {
    if (!this.project || !this.styleBrush.active || this.styleBrush.sourceType !== 'station') {
      this.statusText = '只能应用站点样式到站点'
      return { applied: 0, total: 0 }
    }

    if (!Array.isArray(stationIds) || stationIds.length === 0) {
      return { applied: 0, total: 0 }
    }

    const sourceStyle = this.styleBrush.styleData
    let appliedCount = 0

    for (const stationId of stationIds) {
      const station = this.project.stations.find((s) => s.id === stationId)
      if (!station) continue

      let changed = false
      if (station.underConstruction !== sourceStyle.underConstruction) {
        station.underConstruction = sourceStyle.underConstruction
        changed = true
      }
      if (station.proposed !== sourceStyle.proposed) {
        station.proposed = sourceStyle.proposed
        changed = true
      }

      if (changed) appliedCount++
    }

    if (appliedCount > 0) {
      this.touchProject('样式刷批量应用站点')
      this.statusText = `已应用样式到 ${appliedCount} 个站点`
    }

    return { applied: appliedCount, total: stationIds.length }
  },

  applyStyleToEdges(edgeIds) {
    if (!this.project || !this.styleBrush.active || this.styleBrush.sourceType !== 'edge') {
      this.statusText = '只能应用线段样式到线段'
      return { applied: 0, total: 0 }
    }

    if (!Array.isArray(edgeIds) || edgeIds.length === 0) {
      return { applied: 0, total: 0 }
    }

    const sourceStyle = this.styleBrush.styleData
    let appliedCount = 0

    for (const edgeId of edgeIds) {
      const edge = this.project.edges.find((e) => e.id === edgeId)
      if (!edge) continue

      let changed = false

      if (edge.lineStyleOverride !== sourceStyle.lineStyleOverride) {
        edge.lineStyleOverride = sourceStyle.lineStyleOverride
        changed = true
      }

      if (edge.isCurved !== sourceStyle.isCurved) {
        edge.isCurved = sourceStyle.isCurved
        changed = true
      }

      if (edge.openingYear !== sourceStyle.openingYear) {
        edge.openingYear = sourceStyle.openingYear
        changed = true
      }

      if (changed) appliedCount++
    }

    if (appliedCount > 0) {
      this.recomputeStationLineMembership()
      this.touchProject('样式刷批量应用线段')
      this.statusText = `已应用样式到 ${appliedCount} 条线段`
    }

    return { applied: appliedCount, total: edgeIds.length }
  },

  applyStyleToLines(lineIds) {
    if (!this.project || !this.styleBrush.active || this.styleBrush.sourceType !== 'line') {
      this.statusText = '只能应用线路样式到线路'
      return { applied: 0, total: 0 }
    }

    if (!Array.isArray(lineIds) || lineIds.length === 0) {
      return { applied: 0, total: 0 }
    }

    const sourceStyle = this.styleBrush.styleData
    let appliedCount = 0

    for (const lineId of lineIds) {
      const line = this.project.lines.find((l) => l.id === lineId)
      if (!line) continue

      let changed = false

      if (line.color !== sourceStyle.color) {
        line.color = sourceStyle.color
        changed = true
      }

      if (line.status !== sourceStyle.status) {
        line.status = sourceStyle.status
        changed = true
      }

      if (line.style !== sourceStyle.style) {
        line.style = sourceStyle.style
        changed = true
      }

      if (changed) appliedCount++
    }

    if (appliedCount > 0) {
      this.recomputeStationLineMembership()
      this.touchProject('样式刷批量应用线路')
      this.statusText = `已应用样式到 ${appliedCount} 条线路`
    }

    return { applied: appliedCount, total: lineIds.length }
  },

  getObjectTypeLabel(type) {
    const labels = {
      station: '站点',
      edge: '线段',
      line: '线路',
    }
    return labels[type] || '对象'
  },
}
