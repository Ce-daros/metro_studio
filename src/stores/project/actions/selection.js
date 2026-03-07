import { dedupeStationIds } from '../helpers'
import {
  applyLayoutPresetToConfig,
  buildLayoutPresetFileName,
  createLayoutPresetFromConfig,
  parseLayoutPresetFile,
  serializeLayoutPreset,
} from '../../../lib/layout/presets'

function ensureLayoutConfig(project) {
  if (!project.layoutConfig || typeof project.layoutConfig !== 'object') {
    project.layoutConfig = {
      geoSeedScale: 6,
      displayConfig: {},
      paramReduction: { enabled: false, deltas: [] },
      presets: [],
      activePresetId: null,
    }
  }
  if (!Array.isArray(project.layoutConfig.presets)) {
    project.layoutConfig.presets = []
  }
  if (typeof project.layoutConfig.activePresetId !== 'string') {
    project.layoutConfig.activePresetId = null
  }
}

function downloadTextFile(text, fileName, mimeType = 'application/json') {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function dedupeEdgeIds(ids, edgeIdSet) {
  const result = []
  const seen = new Set()
  for (const id of ids || []) {
    if (!edgeIdSet.has(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

const selectionActions = {
  setMode(mode) {
    this.mode = mode
    if (mode !== 'add-edge' && mode !== 'route-draw' && mode !== 'route-draw-naming') {
      this.pendingEdgeStartStationId = null
    }
    // 样式刷模式特殊处理
    if (mode === 'style-brush' && !this.styleBrush.active) {
      // 如果有选中的对象，自动拾取样式
      if (this.selectedStationIds.length === 1) {
        this.activateStyleBrush(this.selectedStationIds[0], 'station')
      } else if (this.selectedEdgeIds.length === 1) {
        this.activateStyleBrush(this.selectedEdgeIds[0], 'edge')
      } else if (this.activeLineId) {
        this.activateStyleBrush(this.activeLineId, 'line')
      } else {
        this.statusText = '样式刷模式：请先选中一个对象作为样式源'
      }
    } else if (mode !== 'style-brush' && this.styleBrush.active) {
      // 退出样式刷模式时清空样式
      this.deactivateStyleBrush()
    }
  },

  setLayoutGeoSeedScale(value) {
    if (!this.project) return
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const normalized = Math.max(0.1, Math.min(16, parsed))
    ensureLayoutConfig(this.project)
    this.project.layoutConfig.geoSeedScale = normalized
    this.touchProject('')
  },

  setLayoutParamReductionEnabled(enabled) {
    if (!this.project) return
    ensureLayoutConfig(this.project)
    if (!this.project.layoutConfig.paramReduction || typeof this.project.layoutConfig.paramReduction !== 'object') {
      this.project.layoutConfig.paramReduction = { enabled: false, deltas: [] }
    }
    this.project.layoutConfig.paramReduction.enabled = Boolean(enabled)
    this.touchProject('')
  },

  setLayoutParamReductionAxisDelta(index, value) {
    if (!this.project?.layoutConfig) return
    ensureLayoutConfig(this.project)
    if (!this.project.layoutConfig.paramReduction || typeof this.project.layoutConfig.paramReduction !== 'object') {
      this.project.layoutConfig.paramReduction = { enabled: false, deltas: [] }
    }
    const idx = Math.max(0, Math.floor(Number(index) || 0))
    const next = Math.max(-3, Math.min(3, Number(value) || 0))
    const deltas = Array.isArray(this.project.layoutConfig.paramReduction.deltas)
      ? [...this.project.layoutConfig.paramReduction.deltas]
      : []
    while (deltas.length <= idx) deltas.push(0)
    deltas[idx] = next
    this.project.layoutConfig.paramReduction.deltas = deltas
    this.touchProject('')
  },

  resetLayoutParamReductionAxisDeltas() {
    if (!this.project?.layoutConfig) return
    ensureLayoutConfig(this.project)
    if (!this.project.layoutConfig.paramReduction || typeof this.project.layoutConfig.paramReduction !== 'object') {
      this.project.layoutConfig.paramReduction = { enabled: false, deltas: [] }
    }
    this.project.layoutConfig.paramReduction.deltas = []
    this.touchProject('')
  },

  applyLayoutPreset(presetId) {
    if (!this.project) return
    ensureLayoutConfig(this.project)
    const preset = this.project.layoutConfig.presets.find((item) => item.id === presetId)
    if (!preset) return
    this.project.layoutConfig = {
      ...applyLayoutPresetToConfig(this.project.layoutConfig, preset),
      presets: this.project.layoutConfig.presets,
      activePresetId: preset.id,
    }
    this.touchProject(`已应用预设：${preset.name}`)
  },

  saveCurrentLayoutPreset(name, options = {}) {
    if (!this.project) return null
    ensureLayoutConfig(this.project)
    const presetName = String(name || '').trim()
    if (!presetName) return null
    const overwriteId = options.overwriteId ? String(options.overwriteId) : null
    const preset = createLayoutPresetFromConfig(this.project.layoutConfig, presetName, overwriteId)
    const presets = Array.isArray(this.project.layoutConfig.presets) ? [...this.project.layoutConfig.presets] : []
    const existingIndex = overwriteId ? presets.findIndex((item) => item.id === overwriteId) : -1
    if (existingIndex >= 0) presets.splice(existingIndex, 1, preset)
    else presets.push(preset)
    this.project.layoutConfig.presets = presets
    this.project.layoutConfig.activePresetId = preset.id
    this.touchProject(existingIndex >= 0 ? `已更新预设：${preset.name}` : `已保存预设：${preset.name}`)
    return preset
  },

  deleteLayoutPreset(presetId) {
    if (!this.project) return
    ensureLayoutConfig(this.project)
    const presets = Array.isArray(this.project.layoutConfig.presets) ? [...this.project.layoutConfig.presets] : []
    const existingIndex = presets.findIndex((item) => item.id === presetId)
    if (existingIndex < 0) return
    const [removed] = presets.splice(existingIndex, 1)
    this.project.layoutConfig.presets = presets
    if (this.project.layoutConfig.activePresetId === presetId) {
      this.project.layoutConfig.activePresetId = null
    }
    this.touchProject(`已删除预设：${removed.name}`)
  },

  exportLayoutPreset(presetId) {
    if (!this.project) return
    ensureLayoutConfig(this.project)
    const targetPreset = presetId
      ? this.project.layoutConfig.presets.find((item) => item.id === presetId)
      : createLayoutPresetFromConfig(this.project.layoutConfig, '当前参数')
    if (!targetPreset) return
    const payload = serializeLayoutPreset(targetPreset)
    downloadTextFile(payload, buildLayoutPresetFileName(targetPreset.name))
    this.statusText = `预设已导出：${targetPreset.name}`
  },

  async importLayoutPresetFile(file) {
    if (!this.project || !file) return null
    ensureLayoutConfig(this.project)
    const importedPreset = await parseLayoutPresetFile(file)
    const presets = Array.isArray(this.project.layoutConfig.presets) ? [...this.project.layoutConfig.presets] : []
    const existingIndex = presets.findIndex((item) => item.id === importedPreset.id)
    if (existingIndex >= 0) {
      presets.splice(existingIndex, 1, importedPreset)
    } else {
      presets.push(importedPreset)
    }
    this.project.layoutConfig.presets = presets
    this.project.layoutConfig.activePresetId = importedPreset.id
    this.project.layoutConfig = {
      ...applyLayoutPresetToConfig(this.project.layoutConfig, importedPreset),
      presets,
      activePresetId: importedPreset.id,
    }
    this.touchProject(`已导入预设：${importedPreset.name}`)
    return importedPreset
  },

  cancelPendingEdgeStart() {
    if (!this.pendingEdgeStartStationId) return
    this.pendingEdgeStartStationId = null
    if (this.mode === 'add-edge' || this.mode === 'route-draw' || this.mode === 'route-draw-naming') {
      this.statusText = '已取消待连接起点'
    }
  },

  setActiveLine(lineId) {
    this.activeLineId = lineId
  },

  setSelectedStations(stationIds, options = {}) {
    if (!this.project) return
    const stationIdSet = new Set(this.project.stations.map((station) => station.id))
    const sanitized = dedupeStationIds(stationIds, stationIdSet)
    this.selectedStationIds = sanitized
    if (sanitized.length) {
      if (!options.keepEdges) {
        this.selectedEdgeId = null
        this.selectedEdgeIds = []
        this.selectedEdgeAnchor = null
      }
    }
    if (options.keepPrimary && this.selectedStationId && sanitized.includes(this.selectedStationId)) {
      return
    }
    this.selectedStationId = sanitized.length ? sanitized[sanitized.length - 1] : null
  },

  clearSelection() {
    this.selectedStationId = null
    this.selectedStationIds = []
    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
    this.selectedAnnotationId = null
  },

  selectStations(stationIds, options = {}) {
    const replace = options.replace !== false
    if (replace) {
      this.setSelectedStations(stationIds, { keepEdges: Boolean(options.keepEdges) })
      return
    }
    const merged = [...this.selectedStationIds, ...(stationIds || [])]
    this.setSelectedStations(merged, { keepPrimary: true, keepEdges: Boolean(options.keepEdges) })
  },

  setSelectedEdges(edgeIds, options = {}) {
    if (!this.project) return
    const edgeIdSet = new Set(this.project.edges.map((edge) => edge.id))
    const sanitized = dedupeEdgeIds(edgeIds, edgeIdSet)
    this.selectedEdgeIds = sanitized
    this.selectedEdgeId = sanitized.length ? sanitized[sanitized.length - 1] : null
    if (sanitized.length) {
      if (!options.keepStations) {
        this.selectedStationId = null
        this.selectedStationIds = []
      }
      if (
        this.selectedEdgeAnchor &&
        (this.selectedEdgeAnchor.edgeId !== this.selectedEdgeId || !sanitized.includes(this.selectedEdgeAnchor.edgeId))
      ) {
        this.selectedEdgeAnchor = null
      }
    } else {
      this.selectedEdgeAnchor = null
    }
  },

  selectEdges(edgeIds, options = {}) {
    const replace = options.replace !== false
    if (replace) {
      this.setSelectedEdges(edgeIds, { keepStations: Boolean(options.keepStations) })
      return
    }
    const merged = [...(this.selectedEdgeIds || []), ...(edgeIds || [])]
    this.setSelectedEdges(merged, { keepStations: Boolean(options.keepStations) })
  },

  clearEdgeSelection() {
    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
  },

  selectAllStations() {
    if (!this.project) return

    // 考虑时间轴过滤
    const filterYear = this.timelineFilterYear
    let visibleStations = this.project.stations

    if (filterYear != null) {
      // 只选择在当前年份已开通的线段相关的站点
      const visibleEdges = this.project.edges.filter(
        (edge) => edge.openingYear == null || edge.openingYear <= filterYear
      )
      const visibleStationIds = new Set()
      for (const edge of visibleEdges) {
        visibleStationIds.add(edge.fromStationId)
        visibleStationIds.add(edge.toStationId)
      }
      visibleStations = this.project.stations.filter((station) => visibleStationIds.has(station.id))
    }

    this.setSelectedStations(visibleStations.map((station) => station.id))
    this.statusText = `已全选 ${this.selectedStationIds.length} 个站点`
  },

  selectAllLines() {
    if (!this.project) return

    // 考虑时间轴过滤
    const filterYear = this.timelineFilterYear
    let visibleEdges = this.project.edges

    if (filterYear != null) {
      // 只选择在当前年份已开通的线段
      visibleEdges = this.project.edges.filter(
        (edge) => edge.openingYear == null || edge.openingYear <= filterYear
      )
    }

    const allEdgeIds = this.project.lines.flatMap((l) => l.edgeIds || [])
    const visibleEdgeIdSet = new Set(visibleEdges.map((e) => e.id))
    const filteredEdgeIds = allEdgeIds.filter((id) => visibleEdgeIdSet.has(id))

    const allStationIds = new Set()
    for (const edge of visibleEdges) {
      if (edge.fromStationId) allStationIds.add(edge.fromStationId)
      if (edge.toStationId) allStationIds.add(edge.toStationId)
    }

    this.setSelectedEdges([...new Set(filteredEdgeIds)], { keepStations: false })
    this.setSelectedStations([...allStationIds], { keepEdges: true })
    this.statusText = `已全选所有线路`
  },

  selectLineStationsOnly(lineId) {
    if (!this.project) return
    const line = this.project.lines.find((l) => l.id === lineId)
    if (!line) return
    const edgeIdSet = new Set(line.edgeIds || [])
    const stationIdSet = new Set()
    for (const edge of this.project.edges || []) {
      if (!edgeIdSet.has(edge.id)) continue
      if (edge.fromStationId) stationIdSet.add(edge.fromStationId)
      if (edge.toStationId) stationIdSet.add(edge.toStationId)
    }
    this.setSelectedStations([...stationIdSet], { keepEdges: false })
    this.statusText = `已选中 ${line.nameZh} 所有站点: ${stationIdSet.size} 个`
  },

  selectLine(lineId) {
    if (!this.project) return
    const line = this.project.lines.find((l) => l.id === lineId)
    if (!line) return
    if (!Array.isArray(line.edgeIds) || !line.edgeIds.length) {
      this.statusText = `线路 ${line.nameZh} 无线段`
      return
    }
    const edgeIdSet = new Set(line.edgeIds)
    const stationIdSet = new Set()
    for (const edge of this.project.edges || []) {
      if (!edgeIdSet.has(edge.id)) continue
      if (edge.fromStationId) stationIdSet.add(edge.fromStationId)
      if (edge.toStationId) stationIdSet.add(edge.toStationId)
    }
    this.setSelectedEdges([...line.edgeIds], { keepStations: false })
    this.setSelectedStations([...stationIdSet], { keepEdges: true, keepPrimary: true })
    this.statusText = `已选中 ${line.nameZh}: ${line.edgeIds.length} 条线段, ${stationIdSet.size} 个站点`
  },

  selectStation(stationId, options = {}) {
    const multi = Boolean(options.multi || options.toggle)
    const toggle = Boolean(options.toggle)
    if (multi) {
      const selected = new Set(this.selectedStationIds || [])
      if (toggle && selected.has(stationId)) {
        selected.delete(stationId)
      } else {
        selected.add(stationId)
      }
      this.setSelectedStations([...selected], { keepPrimary: !toggle, keepEdges: true })
    } else {
      this.setSelectedStations([stationId], { keepEdges: true })
    }
    if (this.mode === 'add-edge') {
      if (!this.pendingEdgeStartStationId) {
        this.pendingEdgeStartStationId = stationId
        this.statusText = '已选择起点站，请选择终点站'
        return
      }
      if (this.pendingEdgeStartStationId === stationId) {
        this.pendingEdgeStartStationId = null
        this.statusText = '已取消边创建'
        return
      }
      this.addEdgeBetweenStations(this.pendingEdgeStartStationId, stationId)
      this.pendingEdgeStartStationId = null
      return
    }
    if (this.mode === 'route-draw' || this.mode === 'route-draw-naming') {
      if (!this.pendingEdgeStartStationId) {
        this.pendingEdgeStartStationId = stationId
        this.statusText = '连续布线已开始：请继续点击下一个点'
        return
      }
      if (this.pendingEdgeStartStationId === stationId) {
        this.statusText = '已停留当前点，请点击其他点继续布线'
        return
      }
      const newEdge = this.addEdgeBetweenStations(this.pendingEdgeStartStationId, stationId)
      if (!newEdge) {
        this.statusText = '创建线段失败，请重试'
        this.pendingEdgeStartStationId = null
        return
      }
      this.pendingEdgeStartStationId = stationId
      this.statusText = '已连接并继续布线：请点击下一个点'
    }
  },


}

export { selectionActions }
