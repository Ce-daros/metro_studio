import {
  downloadAllLineHudZip,
  downloadOfficialSchematicPng,
} from '../../../lib/export/exportSchematic'
import { downloadProjectText, copyProjectTextToClipboard } from '../../../lib/export/exportText'
import { TILE_SOURCES } from '../../../components/map-editor/mapStyle'
import { createStandaloneHighResExporter } from '../../../composables/useMapExport'
import { saveProjectToDb, setLatestProject } from '../../../lib/storage/db'
import { downloadProjectFile, parseProjectFile } from '../../../lib/storage/projectFile'
import { validateProject } from '../../../lib/validation'

let persistTimer = null
let actualRoutePngExporter = null
const GLOBAL_EXPORTER_KEY = '__railmapActualRoutePngExporter__'

function getGlobalExporter() {
  const value = globalThis[GLOBAL_EXPORTER_KEY]
  return typeof value === 'function' ? value : null
}

function setGlobalExporter(exporter) {
  if (typeof exporter === 'function') {
    globalThis[GLOBAL_EXPORTER_KEY] = exporter
    return
  }
  delete globalThis[GLOBAL_EXPORTER_KEY]
}

function getRegisteredExporter() {
  if (typeof actualRoutePngExporter === 'function') return actualRoutePngExporter
  const globalExporter = getGlobalExporter()
  if (globalExporter) {
    actualRoutePngExporter = globalExporter
    return globalExporter
  }
  return null
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

async function waitForActualRoutePngExporter({ timeoutMs = 2200, intervalMs = 120 } = {}) {
  const immediate = getRegisteredExporter()
  if (immediate) return immediate
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(intervalMs)
    const exporter = getRegisteredExporter()
    if (exporter) return exporter
  }
  return null
}

const exportPersistenceActions = {
  async exportProjectFile() {
    if (!this.project) return
    downloadProjectFile(this.project)
    this.statusText = '工程文件已导出'
  },

  async importProjectFile(file) {
    if (!file) return
    const { isTrial } = await import('../../../composables/useLicense')
    if (isTrial.value) { this.statusText = '试用版不支持导入文件'; return }
    const parsed = await parseProjectFile(file)
    this.project = parsed
    this.regionBoundary = parsed.regionBoundary || null
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
    const importLabel = `已加载工程文件: ${parsed.name}`
    this.statusText = importLabel
    this.resetHistoryBaseline()
    await this.persistNow()

    // Validate imported project and report issues
    const { issues, isValid } = validateProject(this.project)
    if (!isValid || issues.length > 0) {
      const errors = issues.filter((i) => i.severity === 'error')
      const warnings = issues.filter((i) => i.severity === 'warning')
      for (const issue of issues) {
        const logFn = issue.severity === 'error' ? console.error : console.warn
        logFn(`[validation] ${issue.type}: ${issue.message}`)
      }
      const parts = []
      if (errors.length > 0) parts.push(`${errors.length} 个错误`)
      if (warnings.length > 0) parts.push(`${warnings.length} 个警告`)
      this.statusText = `${importLabel} (数据校验: ${parts.join(', ')})`
    }
  },

  async exportActualRouteHighResPng() {
    if (!this.project) return
    this.isActualRouteExporting = true
    this.actualRouteExportProgress = {
      ...this.actualRouteExportProgress,
      active: true,
      phase: 'preparing',
      message: '正在准备导出大图',
      done: 0,
      total: 0,
      percent: 0,
      etaSeconds: null,
      startedAt: Date.now(),
    }
    try {
      const resolutionPreset = this.actualRouteExportResolutionPreset
      const basemap = this.actualRouteExportBasemap || this.mapTileType
      const stationVisibilityMode = this.exportStationVisibilityMode

      // 高分辨率路径：直接用离屏 map，不需要主地图导出器
      const numericResolution = Number(resolutionPreset)
      if (Number.isFinite(numericResolution) && numericResolution >= 1024) {
        const highResExporter = createStandaloneHighResExporter(this)
        const { sanitizeFileName } = await import('../../../components/map-editor/dataBuilders')
        const { isTrial } = await import('../../../composables/useLicense')
        const label = `${numericResolution}px`
        const result = await highResExporter({
          project: this.project,
          stationVisibilityMode,
          basemap,
          longEdgePx: numericResolution,
          resolutionLabel: label,
        })
        const baseName = sanitizeFileName(this.project?.name, 'metro-studio')
        const fileName = result.extension === 'png'
          ? `${baseName}_实际走向高清图_${label}.png`
          : `${baseName}_实际走向高清图_${label}_分块.zip`
        const url = URL.createObjectURL(result.blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        this.statusText = '实际走向高清图已导出'
      } else {
        // 低分辨率回退：需要主地图导出器
        let exporter = getRegisteredExporter()
        if (typeof exporter !== 'function') {
          this.statusText = '正在等待地图初始化...'
          exporter = await waitForActualRoutePngExporter({ timeoutMs: 12000, intervalMs: 150 })
        }
        if (typeof exporter !== 'function') {
          throw new Error('真实地图未就绪，无法导出大图')
        }
        await exporter({
          project: this.project,
          stationVisibilityMode,
          resolutionPreset,
          basemap,
          fileNameSuffix: '实际走向高清图',
          exportLabel: '实际走向高清图',
        })
        this.statusText = '实际走向高清图已导出'
      }
    } catch (error) {
      this.actualRouteExportProgress = {
        ...this.actualRouteExportProgress,
        active: false,
        phase: 'error',
        message: `导出失败: ${error.message || 'unknown error'}`,
      }
      this.statusText = `实际走向高清图导出失败: ${error.message || 'unknown error'}`
      throw error
    } finally {
      this.isActualRouteExporting = false
    }
  },

  async exportActualRoutePng() {
    return this.exportActualRouteHighResPng()
  },

  async exportShareSmallPng() {
    if (!this.project) return
    this.isActualRouteExporting = true
    this.actualRouteExportProgress = {
      ...this.actualRouteExportProgress,
      active: true,
      phase: 'preparing',
      message: '正在准备导出小图',
      done: 0,
      total: 0,
      percent: 0,
      etaSeconds: null,
      startedAt: Date.now(),
    }

    try {
      let exporter = getRegisteredExporter()
      if (typeof exporter !== 'function') {
        this.statusText = '正在等待地图初始化...'
        exporter = await waitForActualRoutePngExporter({ timeoutMs: 12000, intervalMs: 150 })
      }
      if (typeof exporter !== 'function') {
        throw new Error('真实地图未就绪，无法导出分享小图（全网）')
      }

      await exporter({
        project: this.project,
        stationVisibilityMode: this.exportStationVisibilityMode,
        fitToProject: true,
        resolutionPreset: null,
        maxLongEdgePx: 1920,
        fileNameSuffix: '分享小图',
        exportLabel: '分享用小图（全网）',
        adjustLabelOffsetForMarkers: true,
      })
      this.statusText = '分享用小图（全网）已导出'
    } catch (error) {
      this.actualRouteExportProgress = {
        ...this.actualRouteExportProgress,
        active: false,
        phase: 'error',
        message: `导出失败: ${error.message || 'unknown error'}`,
      }
      this.statusText = `分享用小图（全网）导出失败: ${error.message || 'unknown error'}`
      throw error
    } finally {
      this.isActualRouteExporting = false
    }
  },

  async exportOfficialSchematicPng() {
    if (!this.project) return
    await downloadOfficialSchematicPng(this.project)
    this.statusText = '官方风格图 PNG 已导出'
  },

  async exportAllLineHudZip(lineId) {
    if (!this.project) return
    const result = await downloadAllLineHudZip(this.project, lineId ? { lineId } : {})
    this.statusText = `车辆 HUD 图已打包导出（${result.exportedCount} 张）`
  },

  async exportProjectText() {
    if (!this.project) return
    downloadProjectText(this.project)
    this.statusText = '线网文本已导出'
  },

  async copyProjectText() {
    if (!this.project) return
    try {
      await copyProjectTextToClipboard(this.project)
      this.statusText = '线网文本已复制到剪贴板'
    } catch {
      this.statusText = '复制失败，请重试'
    }
  },

  async persistNow() {
    if (!this.project) return
    this.project.meta.updatedAt = new Date().toISOString()
    try {
      const saved = await saveProjectToDb(this.project)
      await setLatestProject(saved.id)
    } catch (error) {
      this.statusText = `本地保存失败: ${error.message || 'unknown error'}`
      throw error
    }
  },

  schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    this._persistDirty = true
    persistTimer = setTimeout(() => {
      this.persistNow().then(() => {
        this._persistDirty = false
      }).catch(() => {})
    }, 800)
  },

  flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    if (this._persistDirty && this.project) {
      this._persistDirty = false
      this.persistNow().catch(() => {})
    }
  },

  touchProject(statusText) {
    if (!this.project) return
    this.project.meta.updatedAt = new Date().toISOString()
    this.recordHistory(statusText)
    if (statusText) {
      this.statusText = statusText
    }
    this.schedulePersist()
  },

  registerActualRoutePngExporter(exporter) {
    actualRoutePngExporter = typeof exporter === 'function' ? exporter : null
    setGlobalExporter(actualRoutePngExporter)
  },

  unregisterActualRoutePngExporter(exporter) {
    if (typeof exporter === 'function') {
      if (actualRoutePngExporter === exporter) {
        actualRoutePngExporter = null
        setGlobalExporter(null)
        return
      }
      const globalExporter = getGlobalExporter()
      if (globalExporter === exporter) {
        setGlobalExporter(null)
      }
      return
    }
    actualRoutePngExporter = null
    setGlobalExporter(null)
  },

  setExportStationVisibilityMode(mode) {
    const normalized = String(mode || '').trim()
    if (!['all', 'interchange', 'none'].includes(normalized)) return
    this.exportStationVisibilityMode = normalized
  },

  openActualRouteExportDialog() {
    if (!this.project) return
    this.actualRouteExportDialogVisible = true
    const numericPreset = Number(this.actualRouteExportResolutionPreset)
    if (!Number.isFinite(numericPreset) || numericPreset < 1024) {
      this.actualRouteExportResolutionPreset = 4096
    }
    if (!this.actualRouteExportBasemap || !TILE_SOURCES[this.actualRouteExportBasemap]) {
      this.actualRouteExportBasemap = this.mapTileType || 'osm'
    }
  },

  closeActualRouteExportDialog() {
    this.actualRouteExportDialogVisible = false
  },

  setActualRouteExportResolutionPreset(preset) {
    const normalized = Math.round(Number(preset))
    if (!Number.isFinite(normalized) || normalized < 1024) return
    this.actualRouteExportResolutionPreset = normalized
  },

  setActualRouteExportBasemap(tileType) {
    const normalized = String(tileType || '').trim()
    if (!TILE_SOURCES[normalized]) return
    this.actualRouteExportBasemap = normalized
  },

}

export { exportPersistenceActions }
