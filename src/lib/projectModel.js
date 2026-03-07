import { pickLineColor } from './colors'
import { createId } from './ids'
import { normalizeLayoutPreset } from './layout/presets'
import { normalizeLineStyle } from './lineStyles'
import { normalizeLineNamesForLoop } from './lineNaming'

export const PROJECT_SCHEMA_VERSION = '1.0.0'

/**
 * @typedef {Object} RailStation
 * @property {string} id
 * @property {string} nameZh
 * @property {string} nameEn
 * @property {boolean} nameEnFixed - 英文名是否已固定（不会被 AI 翻译覆盖）
 * @property {[number, number]} lngLat
 * @property {[number, number]} displayPos
 * @property {boolean} isInterchange
 * @property {boolean} underConstruction
 * @property {boolean} proposed
 * @property {string[]} lineIds
 * @property {string[]} transferLineIds
 */

/**
 * @typedef {Object} RailEdge
 * @property {string} id
 * @property {string} fromStationId
 * @property {string} toStationId
 * @property {[number, number][]} waypoints
 * @property {string[]} sharedByLineIds
 * @property {('metro'|'commuter'|'light-rail'|'tram') | null} lineStyleOverride
 * @property {number} lengthMeters
 * @property {boolean} isCurved
 * @property {number|null} openingYear
 * @property {string} phase
 */

/**
 * @typedef {Object} RailLine
 * @property {string} id
 * @property {string} key
 * @property {string} nameZh
 * @property {string} nameEn
 * @property {string} color
 * @property {('open'|'construction'|'proposed')} status
 * @property {('metro'|'commuter'|'light-rail'|'tram')} style
 * @property {boolean} isLoop
 * @property {string[]} edgeIds
 */

/**
 * @typedef {Object} RailProject
 * @property {string} id
 * @property {string} projectVersion
 * @property {string} name
 * @property {{id: string, name: string, relationId: number}} region
 * @property {RailStation[]} stations
 * @property {Array<{id: string, stationAId: string, stationBId: string}>} manualTransfers
 * @property {RailEdge[]} edges
 * @property {RailLine[]} lines
 * @property {Array<{createdAt: string, score: number, breakdown: Record<string, number>}>} snapshots
 * @property {{stationLabels: Record<string, {dx:number,dy:number,anchor:string}>, edgeDirections: Record<string, number>}} layoutMeta
 * @property {{geoSeedScale: number, displayConfig: object, paramReduction?: {enabled: boolean, deltas: number[]}, presets?: Array<object>, activePresetId?: string|null}} layoutConfig
 * @property {{createdAt: string, updatedAt: string}} meta
 * @property {Array<{id: string, year: number, description: string, position: ('before'|'after'|'year_end'), order: number}>} timelineEvents
 * @property {Array<{year: number, beforeMs: number, afterMs: number}>} timelineYearDelays
 */

export function createEmptyProject(name = '新建工程') {
  const now = new Date().toISOString()
  return {
    id: createId('project'),
    projectVersion: PROJECT_SCHEMA_VERSION,
    name,
    region: null,
    regionBoundary: null,
    stations: [],
    manualTransfers: [],
    edges: [],
    lines: [
      {
        id: createId('line'),
        key: 'manual-line-1',
        nameZh: '1号线',
        nameEn: 'Line 1',
        color: pickLineColor(0),
        status: 'open',
        style: normalizeLineStyle('solid'),
        isLoop: false,
        edgeIds: [],
      },
    ],
    snapshots: [],
    layoutMeta: {
      stationLabels: {},
      edgeDirections: {},
    },
    layoutConfig: {
      geoSeedScale: 6,
      displayConfig: {
        showStationNumbers: false,
        showInterchangeMarkers: true,
        stationIconSize: 1.0,
        stationIconStyle: 'circle',
        showLineBadges: true,
        edgeWidthScale: 1.0,
        edgeOpacity: 1.0,
        cornerRadius: 10,
      },
      paramReduction: {
        enabled: false,
        deltas: [],
      },
      presets: [],
      activePresetId: null,
    },
    annotations: [],
    timelineEvents: [],
    timelineYearDelays: [],
    meta: {
      createdAt: now,
      updatedAt: now,
      hasAutoLayoutTriggered: false,
    },
  }
}

export function normalizeProject(raw) {
  const base = createEmptyProject(raw?.name || '导入工程')
  const merged = {
    ...base,
    ...raw,
    region: raw?.region || base.region,
    regionBoundary: raw?.regionBoundary || base.regionBoundary,
    stations: Array.isArray(raw?.stations) ? raw.stations : [],
    manualTransfers: Array.isArray(raw?.manualTransfers) ? raw.manualTransfers : [],
    edges: Array.isArray(raw?.edges) ? raw.edges : [],
    lines: Array.isArray(raw?.lines) && raw.lines.length ? raw.lines : base.lines,
    snapshots: Array.isArray(raw?.snapshots) ? raw.snapshots : [],
    layoutMeta:
      raw?.layoutMeta && typeof raw.layoutMeta === 'object'
        ? {
            stationLabels:
              raw.layoutMeta.stationLabels && typeof raw.layoutMeta.stationLabels === 'object'
                ? raw.layoutMeta.stationLabels
                : {},
            edgeDirections:
              raw.layoutMeta.edgeDirections && typeof raw.layoutMeta.edgeDirections === 'object'
                ? raw.layoutMeta.edgeDirections
                : {},
          }
        : base.layoutMeta,
    layoutConfig:
      raw?.layoutConfig && typeof raw.layoutConfig === 'object'
        ? {
            geoSeedScale: Number.isFinite(Number(raw.layoutConfig.geoSeedScale))
              ? Math.max(0.1, Number(raw.layoutConfig.geoSeedScale))
              : base.layoutConfig.geoSeedScale,
            displayConfig:
              raw.layoutConfig.displayConfig && typeof raw.layoutConfig.displayConfig === 'object'
                ? {
                    showStationNumbers: Boolean(raw.layoutConfig.displayConfig.showStationNumbers),
                    showInterchangeMarkers: Boolean(raw.layoutConfig.displayConfig.showInterchangeMarkers),
                    stationIconSize: Number.isFinite(Number(raw.layoutConfig.displayConfig.stationIconSize))
                      ? Math.max(0.5, Math.min(2.0, Number(raw.layoutConfig.displayConfig.stationIconSize)))
                      : base.layoutConfig.displayConfig.stationIconSize,
                    stationIconStyle: ['circle', 'square'].includes(raw.layoutConfig.displayConfig.stationIconStyle)
                      ? raw.layoutConfig.displayConfig.stationIconStyle
                      : base.layoutConfig.displayConfig.stationIconStyle,
                    showLineBadges: Boolean(raw.layoutConfig.displayConfig.showLineBadges),
                    edgeWidthScale: Number.isFinite(Number(raw.layoutConfig.displayConfig.edgeWidthScale))
                      ? Math.max(0.5, Math.min(2.0, Number(raw.layoutConfig.displayConfig.edgeWidthScale)))
                      : base.layoutConfig.displayConfig.edgeWidthScale,
                    edgeOpacity: Number.isFinite(Number(raw.layoutConfig.displayConfig.edgeOpacity))
                      ? Math.max(0.3, Math.min(1.0, Number(raw.layoutConfig.displayConfig.edgeOpacity)))
                      : base.layoutConfig.displayConfig.edgeOpacity,
                    cornerRadius: Number.isFinite(Number(raw.layoutConfig.displayConfig.cornerRadius))
                      ? Math.max(0, Math.min(30, Number(raw.layoutConfig.displayConfig.cornerRadius)))
                      : base.layoutConfig.displayConfig.cornerRadius,
                  }
                : base.layoutConfig.displayConfig,
            paramReduction:
              raw.layoutConfig.paramReduction && typeof raw.layoutConfig.paramReduction === 'object'
                ? {
                    enabled: Boolean(raw.layoutConfig.paramReduction.enabled),
                    deltas: Array.isArray(raw.layoutConfig.paramReduction.deltas)
                      ? raw.layoutConfig.paramReduction.deltas
                          .map((n) => Number(n))
                          .filter((n) => Number.isFinite(n))
                          .map((n) => Math.max(-3, Math.min(3, n)))
                      : [],
                  }
                : base.layoutConfig.paramReduction,
            presets: Array.isArray(raw.layoutConfig.presets)
              ? raw.layoutConfig.presets
                  .map((preset, index) => normalizeLayoutPreset(preset, index))
                  .filter(Boolean)
              : base.layoutConfig.presets,
            activePresetId:
              typeof raw.layoutConfig.activePresetId === 'string' && raw.layoutConfig.activePresetId.trim()
                ? raw.layoutConfig.activePresetId
                : base.layoutConfig.activePresetId,
          }
        : base.layoutConfig,
    annotations: Array.isArray(raw?.annotations)
      ? raw.annotations
          .filter((a) => a && typeof a.id === 'string' && Array.isArray(a.lngLat) && a.lngLat.length >= 2)
          .map((a) => ({
            id: a.id,
            lngLat: [Number(a.lngLat[0]), Number(a.lngLat[1])],
            text: String(a.text || ''),
            createdAt: Number.isFinite(a.createdAt) ? a.createdAt : Date.now(),
          }))
      : [],
    timelineEvents: Array.isArray(raw?.timelineEvents)
      ? raw.timelineEvents
          .map((e, index) => {
            const year = Number(e?.year)
            const description = String(e?.description || '').trim()
            if (!Number.isFinite(year) || !description) return null
            return {
              id: String(e?.id || createId('timeline_evt')),
              year,
              description,
              position: e?.position === 'after' ? 'after' : e?.position === 'year_end' ? 'year_end' : 'before',
              order: Number.isFinite(Number(e?.order)) ? Number(e.order) : index,
            }
          })
          .filter(Boolean)
      : [],
    timelineYearDelays: Array.isArray(raw?.timelineYearDelays)
      ? raw.timelineYearDelays
          .map((d) => {
            const year = Number(d?.year)
            if (!Number.isFinite(year)) return null
            const beforeMs = Math.max(0, Number(d?.beforeMs || 0))
            const afterMs = Math.max(0, Number(d?.afterMs || 0))
            return { year, beforeMs, afterMs }
          })
          .filter(Boolean)
      : [],
    meta: {
      ...base.meta,
      ...(raw?.meta || {}),
      updatedAt: new Date().toISOString(),
      hasAutoLayoutTriggered: Boolean(raw?.meta?.hasAutoLayoutTriggered),
    },
  }

  merged.stations = merged.stations.map((station) => ({
    id: station.id || createId('station'),
    nameZh: station.nameZh || station.name || '未命名站',
    nameEn: station.nameEn || station.nameZh || station.name || '',
    lngLat: station.lngLat || [117.0, 36.65],
    displayPos: station.displayPos || station.lngLat || [117.0, 36.65],
    isInterchange: Boolean(station.isInterchange),
    underConstruction: Boolean(station.underConstruction),
    proposed: Boolean(station.proposed),
    lineIds: Array.isArray(station.lineIds) ? station.lineIds : [],
    transferLineIds: Array.isArray(station.transferLineIds) ? station.transferLineIds : [],
  }))

  const stationIdSet = new Set(merged.stations.map((station) => String(station.id)))
  const manualTransferSeen = new Set()
  merged.manualTransfers = merged.manualTransfers
    .map((transfer) => {
      const rawA = String(transfer?.stationAId || '')
      const rawB = String(transfer?.stationBId || '')
      if (!rawA || !rawB || rawA === rawB) return null
      if (!stationIdSet.has(rawA) || !stationIdSet.has(rawB)) return null
      const [stationAId, stationBId] = rawA < rawB ? [rawA, rawB] : [rawB, rawA]
      const key = `${stationAId}__${stationBId}`
      if (manualTransferSeen.has(key)) return null
      manualTransferSeen.add(key)
      return {
        id: transfer?.id ? String(transfer.id) : createId('transfer'),
        stationAId,
        stationBId,
      }
    })
    .filter(Boolean)

  merged.edges = merged.edges.map((edge) => ({
    id: edge.id || createId('edge'),
    fromStationId: edge.fromStationId,
    toStationId: edge.toStationId,
    waypoints: Array.isArray(edge.waypoints) ? edge.waypoints : [],
    sharedByLineIds: Array.isArray(edge.sharedByLineIds) ? edge.sharedByLineIds : [],
    lineStyleOverride: edge.lineStyleOverride != null ? normalizeLineStyle(edge.lineStyleOverride) : null,
    lengthMeters: Number(edge.lengthMeters || 0),
    isCurved: Boolean(edge.isCurved),
    openingYear: edge.openingYear ?? null,
    phase: edge.phase || '',
  }))

  merged.lines = merged.lines.map((line, index) => {
    const isLoop = Boolean(line.isLoop)
    const normalizedNames = normalizeLineNamesForLoop({
      nameZh: line.nameZh || line.name || `线路 ${index + 1}`,
      nameEn: line.nameEn || line.nameZh || line.name || '',
      isLoop,
    })
    return {
      id: line.id || createId('line'),
      key: line.key || line.ref || `line_${index + 1}`,
      nameZh: normalizedNames.nameZh || `线路 ${index + 1}`,
      nameEn: normalizedNames.nameEn,
      color: line.color || pickLineColor(index),
      status: line.status || 'open',
      style: normalizeLineStyle(line.style),
      isLoop,
      edgeIds: Array.isArray(line.edgeIds) ? line.edgeIds : [],
    }
  })

  return merged
}
