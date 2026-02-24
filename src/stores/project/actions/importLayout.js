import { optimizeLayoutInWorker } from '../../../lib/layout/workerClient'
import { importJinanMetroFromOsm } from '../../../lib/osm/importJinanMetro'
import { importCityMetroNetwork } from '../../../lib/osm/genericImporter'
import { findCityPresetById, findCityPresetByRelationId } from '../../../lib/osm/cityPresets'
import { createId } from '../../../lib/ids'
import { normalizeProject } from '../../../lib/projectModel'

const importLayoutActions = {
  /**
   * Legacy shortcut: import Jinan metro network using the original Jinan-specific importer.
   */
  async importJinanNetwork() {
    if (!this.project || this.isImporting) return
    const { isTrial } = await import('../../../composables/useLicense')
    if (isTrial.value) { this.statusText = '试用版不支持导入线网'; return }
    this.isImporting = true
    this.importProgress = 0
    this.statusText = '正在保存当前工程...'
    try {
      await this.persistNow()
      this.statusText = '正在导入 OSM 济南地铁线网...'
      const imported = await importJinanMetroFromOsm({
        includeConstruction: false,
        includeProposed: false,
      })
      this.importProgress = 100
      this._applyImportedNetwork(imported)
    } catch (error) {
      this.statusText = `导入失败: ${error.message || 'unknown error'}`
    } finally {
      this.isImporting = false
      this.importProgress = -1
    }
  },

  /**
   * Generic city metro network import.
   * @param {string|number|object} cityPresetOrRelationId
   *   - A city preset object (from cityPresets.js)
   *   - A city preset id string (e.g. 'beijing')
   *   - A raw OSM relation ID number
   * @param {object} [importOptions]
   * @param {boolean} [importOptions.includeConstruction]  Override store toggle
   * @param {boolean} [importOptions.includeProposed]      Override store toggle
   */
  async importCityNetwork(cityPresetOrRelationId, importOptions = {}) {
    if (!this.project || this.isImporting) return

    let preset = null
    let relationId = null

    if (typeof cityPresetOrRelationId === 'object' && cityPresetOrRelationId !== null) {
      preset = cityPresetOrRelationId
      relationId = preset.relationId
    } else if (typeof cityPresetOrRelationId === 'string') {
      preset = findCityPresetById(cityPresetOrRelationId)
      if (!preset) {
        this.statusText = `未找到城市预设: ${cityPresetOrRelationId}`
        return
      }
      relationId = preset.relationId
    } else if (typeof cityPresetOrRelationId === 'number') {
      relationId = cityPresetOrRelationId
      preset = findCityPresetByRelationId(relationId)
    }

    if (!relationId || !Number.isFinite(relationId)) {
      this.statusText = '无效的 OSM 关系 ID'
      return
    }

    const displayName = preset ? preset.name : `OSM #${relationId}`

    this.isImporting = true
    this.importProgress = 0
    this.statusText = '正在保存当前工程...'
    try {
      await this.persistNow()
      this.statusText = `正在导入 ${displayName} 地铁线网...`

      const imported = await importCityMetroNetwork(relationId, {
        includeConstruction: importOptions.includeConstruction ?? false,
        includeProposed: importOptions.includeProposed ?? false,
      }, undefined, (percent, msg) => {
        this.importProgress = percent
        if (msg) this.statusText = msg
      })

      this.importProgress = 100
      this._applyImportedNetwork(imported)
    } catch (error) {
      this.statusText = `导入失败: ${error.message || 'unknown error'}`
    } finally {
      this.isImporting = false
      this.importProgress = -1
    }
  },

  /**
   * Shared logic: apply an imported network result to current project.
   * @param {object} imported  Return value from importJinanMetroFromOsm or importCityMetroNetwork
   */
  _applyImportedNetwork(imported) {
    const now = new Date().toISOString()
    const currentProjectName = String(this.project.name || '').trim() || '新建工程'
    const cityLabel = imported.region?.name || 'OSM'
    
    const isEmptyProject = !this.project.stations?.length && !this.project.lines?.length

    if (isEmptyProject) {
      this.project.region = imported.region
      this.project.regionBoundary = imported.boundary
      this.project.stations = imported.stations
      this.project.manualTransfers = []
      this.project.edges = imported.edges
      this.project.lines = imported.lines
      this.project.layoutMeta = {
        stationLabels: {},
        edgeDirections: {},
      }
      this.project.meta.updatedAt = now
    } else {
      this.project = normalizeProject({
        id: createId('project'),
        name: `${currentProjectName} (${cityLabel} OSM 导入)`,
        region: imported.region,
        regionBoundary: imported.boundary,
        stations: imported.stations,
        manualTransfers: [],
        edges: imported.edges,
        lines: imported.lines,
        snapshots: [],
        layoutMeta: {
          stationLabels: {},
          edgeDirections: {},
        },
        layoutConfig: this.project.layoutConfig,
        meta: {
          createdAt: now,
          updatedAt: now,
        },
      })
    }

    this.regionBoundary = imported.boundary

    this.activeLineId = this.project.lines[0]?.id || null
    this.selectedStationId = null
    this.selectedStationIds = []
    this.selectedEdgeId = null
    this.selectedEdgeIds = []
    this.selectedEdgeAnchor = null
    this.pendingEdgeStartStationId = null
    this.isStationEnglishRetranslating = false
    this.stationEnglishRetranslateProgress = {
      done: 0,
      total: 0,
      percent: 0,
      message: '',
    }
    this.recomputeStationLineMembership()

    this.statusText = isEmptyProject 
      ? `导入完成: ${this.project.lines.length} 条线 / ${this.project.stations.length} 站`
      : `导入完成（已新建工程）: ${this.project.lines.length} 条线 / ${this.project.stations.length} 站`
    this.resetHistoryBaseline()

    this.fitToNetwork()
    this.persistNow().catch(() => {})
  },

  async runAutoLayout() {
    if (!this.project || this.isLayoutRunning || this.project.stations.length < 2) return
    this.isLayoutRunning = true
    this.statusText = '正在执行自动排版...'
    try {
      const geoSeedScale = Number(this.project.layoutConfig?.geoSeedScale)
      const result = await optimizeLayoutInWorker({
        stations: this.project.stations,
        edges: this.project.edges,
        lines: this.project.lines,
        config: {
          geoSeedScale: Number.isFinite(geoSeedScale) ? geoSeedScale : 6,
        },
      })
      this.project.stations = result.stations
      this.project.layoutMeta = {
        stationLabels: result.layoutMeta?.stationLabels || {},
        edgeDirections: result.layoutMeta?.edgeDirections || {},
      }
      const safeScore = Number.isFinite(result.score) ? result.score : 0
      this.project.snapshots.push({
        createdAt: new Date().toISOString(),
        score: safeScore,
        breakdown: result.breakdown,
      })
      this.statusText = `自动排版完成，评分 ${safeScore.toFixed(2)}`
      this.touchProject('')
    } catch (error) {
      const stackTrace = error.stack || '无调用栈信息'
      this.statusText = `自动排版失败: ${error.message || 'unknown error'}\n\n调用栈:\n${stackTrace}`
    } finally {
      this.isLayoutRunning = false
    }
  },

}

export { importLayoutActions }
