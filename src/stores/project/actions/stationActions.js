import { createId } from '../../../lib/ids'
import {
  applyRenameTemplate,
  cloneLngLat,
  dedupeStationIds,
  estimateDisplayPositionFromLngLat,
} from '../helpers'
import { isTrial, TRIAL_LIMITS } from '../../../composables/useLicense'

export const stationActions = {
  addStationAt(lngLat) {
    if (!this.project || !Array.isArray(lngLat) || lngLat.length !== 2) return null
    if (isTrial.value && this.project.stations.length >= TRIAL_LIMITS.maxStations) {
      this._showUpgradeDialog?.(`试用版最多创建 ${TRIAL_LIMITS.maxStations} 个站点，请激活正式版以解除限制。`)
      return null
    }
    const nextIndex = this.project.stations.length + 1
    const station = {
      id: createId('station'),
      nameZh: `新站 ${nextIndex}`,
      nameEn: `Station ${nextIndex}`,
      nameEnFixed: false,
      lngLat: [...lngLat],
      displayPos: estimateDisplayPositionFromLngLat(this.project.stations, lngLat),
      isInterchange: false,
      underConstruction: false,
      proposed: false,
      lineIds: [],
      transferLineIds: [],
    }
    this.project.stations.push(station)
    this.setSelectedStations([station.id])
    this.touchProject(`新增站点: ${station.nameZh}`)
    return station
  },

  updateStationPosition(stationId, lngLat) {
    if (!this.project) return
    const station = this.project.stations.find((item) => item.id === stationId)
    if (!station) return
    station.lngLat = [...lngLat]
    station.displayPos = estimateDisplayPositionFromLngLat(this.project.stations, lngLat)
    this.syncConnectedEdgeEndpoints(station.id, station.lngLat)
    this.touchProject('')
  },

  moveStationsByDelta(stationIds, deltaLngLat) {
    if (!this.project || !Array.isArray(deltaLngLat) || deltaLngLat.length !== 2) return
    const stationIdSet = new Set(this.project.stations.map((station) => station.id))
    const movingIds = dedupeStationIds(stationIds, stationIdSet)
    if (!movingIds.length) return
    const [dx, dy] = deltaLngLat
    const movingSet = new Set(movingIds)
    for (const station of this.project.stations) {
      if (!movingSet.has(station.id)) continue
      const nextLngLat = [station.lngLat[0] + dx, station.lngLat[1] + dy]
      station.lngLat = nextLngLat
      station.displayPos = estimateDisplayPositionFromLngLat(this.project.stations, nextLngLat)
      this.syncConnectedEdgeEndpoints(station.id, station.lngLat)
    }
    this.touchProject('')
  },

  updateStationName(stationId, { nameZh, nameEn }) {
    if (!this.project) return
    const station = this.project.stations.find((item) => item.id === stationId)
    if (!station) return
    station.nameZh = String(nameZh || '').trim() || station.nameZh
    station.nameEn = String(nameEn || '').trim()
    this.touchProject(`更新站名: ${station.nameZh}`)
  },

  updateStationNamesBatch(updates = [], options = {}) {
    if (!this.project) return { updatedCount: 0, total: 0 }
    const items = Array.isArray(updates) ? updates : []
    if (!items.length) return { updatedCount: 0, total: 0 }

    const stationById = new Map((this.project.stations || []).map((station) => [station.id, station]))
    let updatedCount = 0

    for (const update of items) {
      const stationId = String(update?.stationId || '').trim()
      if (!stationId) continue
      const station = stationById.get(stationId)
      if (!station) continue

      const nextZh = String(update?.nameZh || '').trim()
      const nextEn = String(update?.nameEn || '').trim()

      let changed = false
      if (nextZh && nextZh !== station.nameZh) {
        station.nameZh = nextZh
        changed = true
      }
      if (nextEn && nextEn !== station.nameEn) {
        station.nameEn = nextEn
        changed = true
      }
      if (changed) updatedCount += 1
    }

    if (updatedCount > 0) {
      const reason = String(options?.reason || '').trim()
      this.touchProject(reason || `批量更新站名: ${updatedCount} 站`)
    }

    return {
      updatedCount,
      total: items.length,
    }
  },

  renameSelectedStationsByTemplate({ zhTemplate, enTemplate, startIndex = 1 } = {}) {
    if (!this.project || !this.selectedStationIds.length) return
    const selectedSet = new Set(this.selectedStationIds)
    const selectedStations = this.project.stations.filter((station) => selectedSet.has(station.id))
    if (!selectedStations.length) return

    const normalizedStart = Number(startIndex)
    const sequenceStart = Number.isFinite(normalizedStart) ? Math.max(1, Math.floor(normalizedStart)) : 1
    const hasZhTemplate = Boolean(String(zhTemplate || '').trim())
    const hasEnTemplate = Boolean(String(enTemplate || '').trim())
    if (!hasZhTemplate && !hasEnTemplate) return

    selectedStations.forEach((station, index) => {
      const n = sequenceStart + index
      if (hasZhTemplate) {
        const nextZh = applyRenameTemplate(zhTemplate, n)
        if (nextZh) {
          station.nameZh = nextZh
        }
      }
      if (hasEnTemplate) {
        station.nameEn = applyRenameTemplate(enTemplate, n)
      }
    })

    this.touchProject(`批量重命名 ${selectedStations.length} 个站点`)
  },

  deleteSelectedStations() {
    if (!this.project || !this.selectedStationIds.length) return
    const removing = new Set(this.selectedStationIds)
    this.project.stations = this.project.stations.filter((station) => !removing.has(station.id))
    this.project.manualTransfers = (this.project.manualTransfers || []).filter(
      (transfer) => !removing.has(transfer?.stationAId) && !removing.has(transfer?.stationBId),
    )
    this.project.edges = this.project.edges.filter(
      (edge) => !removing.has(edge.fromStationId) && !removing.has(edge.toStationId),
    )
    const edgeIdSet = new Set(this.project.edges.map((edge) => edge.id))
    for (const line of this.project.lines) {
      line.edgeIds = (line.edgeIds || []).filter((edgeId) => edgeIdSet.has(edgeId))
    }
    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }
    this.recomputeStationLineMembership()
    this.clearSelection()
    this.touchProject('已删除选中站点')
  },

  deleteNewStations() {
    if (!this.project) return
    const removing = new Set(
      this.project.stations.filter((s) => s.nameZh?.startsWith('新站 ')).map((s) => s.id)
    )
    if (!removing.size) return
    this.project.stations = this.project.stations.filter((s) => !removing.has(s.id))
    this.project.manualTransfers = (this.project.manualTransfers || []).filter(
      (t) => !removing.has(t?.stationAId) && !removing.has(t?.stationBId),
    )
    this.project.edges = this.project.edges.filter(
      (e) => !removing.has(e.fromStationId) && !removing.has(e.toStationId),
    )
    const edgeIdSet = new Set(this.project.edges.map((e) => e.id))
    for (const line of this.project.lines) {
      line.edgeIds = (line.edgeIds || []).filter((id) => edgeIdSet.has(id))
    }
    this.recomputeStationLineMembership()
    this.clearSelection()
    this.touchProject(`已删除 ${removing.size} 个未命名新站`)
  },

  toggleStationNameEnFixed(stationId) {
    if (!this.project) return
    const station = this.project.stations.find((s) => s.id === stationId)
    if (!station) return
    station.nameEnFixed = !station.nameEnFixed
    this.touchProject(station.nameEnFixed ? `已固定英文名: ${station.nameZh}` : `已取消固定英文名: ${station.nameZh}`)
  },

  setStationNameEnFixed(stationId, fixed) {
    if (!this.project) return
    const station = this.project.stations.find((s) => s.id === stationId)
    if (!station) return
    const wasFixed = Boolean(station.nameEnFixed)
    station.nameEnFixed = Boolean(fixed)
    if (wasFixed !== station.nameEnFixed) {
      this.touchProject(station.nameEnFixed ? `已固定英文名: ${station.nameZh}` : `已取消固定英文名: ${station.nameZh}`)
    }
  },

  deleteStation(stationId) {
    if (!this.project || !stationId) return
    const removing = new Set([stationId])
    this.project.stations = this.project.stations.filter((station) => !removing.has(station.id))
    this.project.manualTransfers = (this.project.manualTransfers || []).filter(
      (transfer) => !removing.has(transfer?.stationAId) && !removing.has(transfer?.stationBId),
    )
    this.project.edges = this.project.edges.filter(
      (edge) => !removing.has(edge.fromStationId) && !removing.has(edge.toStationId),
    )
    const edgeIdSet = new Set(this.project.edges.map((edge) => edge.id))
    for (const line of this.project.lines) {
      line.edgeIds = (line.edgeIds || []).filter((edgeId) => edgeIdSet.has(edgeId))
    }
    if (!this.project.lines.some((line) => line.id === this.activeLineId)) {
      this.activeLineId = this.project.lines[0]?.id || null
    }
    this.recomputeStationLineMembership()
    this.clearSelection()
    this.touchProject('已删除站点')
  },
}
