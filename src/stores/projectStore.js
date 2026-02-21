import { acceptHMRUpdate, defineStore } from 'pinia'
import { DEFAULT_EDIT_YEAR } from '../lib/constants'
import { exportPersistenceActions } from './project/actions/exportPersistence'
import { historyActions } from './project/actions/history'
import { importLayoutActions } from './project/actions/importLayout'
import { lifecycleActions } from './project/actions/lifecycle'
import { mapPreferencesActions } from './project/actions/mapPreferences'
import { networkEditingActions } from './project/actions/networkEditing'
import { selectionActions } from './project/actions/selection'
import { timelineActions } from './project/actions/timelineActions'
import { navigationActions } from './project/actions/navigationActions'
import { styleBrushActions } from './project/actions/styleBrushActions'
import { annotationActions } from './project/actions/annotationActions'
import { clipboardActions } from './project/actions/clipboard'
import { reachabilityActions } from './project/actions/reachabilityActions'

function getInitialProtomapsApiKey() {
  try {
    return window.localStorage.getItem('protomapsApiKey') || ''
  } catch {
    return ''
  }
}

/** @typedef {import('../lib/projectModel').RailProject} RailProject */

export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null,
    regionBoundary: null,
    mode: 'select',
    selectedStationId: null,
    selectedStationIds: [],
    selectedEdgeId: null,
    selectedEdgeIds: [],
    selectedEdgeAnchor: null,
    selectedAnnotationId: null,
    pendingEdgeStartStationId: null,
    quickLinkStartStationId: null,
    activeLineId: null,
    isImporting: false,
    isLayoutRunning: false,
    isInitialized: false,
    statusText: '',
    isStationEnglishRetranslating: false,
    stationEnglishRetranslateProgress: {
      done: 0,
      total: 0,
      percent: 0,
      message: '',
    },
    exportStationVisibilityMode: 'all',
    showLanduseOverlay: false,
    highlightStationLocations: false,
    showStationMarkers: true,
    showStationLabels: true,
    showLineLabels: true,
    showInterchangeMarkers: true,
    interchangeMarkerStyle: 'orbit', // 'orbit' | 'radar' | 'gear'
    showMapGrid: false,
    showMapCoordinates: false,
    protomapsApiKey: getInitialProtomapsApiKey(),
    mapTileType: 'dark',
    currentEditYear: DEFAULT_EDIT_YEAR,
    timelineFilterYear: null,
    timelinePlayback: {
      state: 'idle',
      speed: 1,
    },
    navigation: {
      active: false,
      originLngLat: null,
      destinationLngLat: null,
      result: null,
    },
    reachability: {
      active: false,
      stationId: null,
      thresholdMeters: 0,
      result: null,
    },
    styleBrush: {
      active: false,
      sourceType: null,
      sourceId: null,
      styleData: null,
    },
    fitToNetworkTrigger: 0,
    history: {
      past: [],
      future: [],
      lastSnapshot: null,
      lastSnapshotHash: '',
      maxEntries: 320,
      checkpointInterval: 20,
      checkpoints: [],
      isRestoring: false,
    },
  }),
  getters: {
    /** @returns {Map<string, import('../lib/projectModel').RailLine>} */
    lineById(state) {
      const map = new Map()
      for (const line of state.project?.lines || []) {
        map.set(line.id, line)
      }
      return map
    },
    /** @returns {Map<string, import('../lib/projectModel').RailStation>} */
    stationById(state) {
      const map = new Map()
      for (const station of state.project?.stations || []) {
        map.set(station.id, station)
      }
      return map
    },
    /** @returns {Map<string, import('../lib/projectModel').RailEdge>} */
    edgeById(state) {
      const map = new Map()
      for (const edge of state.project?.edges || []) {
        map.set(edge.id, edge)
      }
      return map
    },
    /** @returns {import('../lib/projectModel').RailStation[]} */
    selectedStations(state) {
      if (!state.project) return []
      const selectedSet = new Set(state.selectedStationIds || [])
      return state.project.stations.filter((station) => selectedSet.has(station.id))
    },
    /** @returns {import('../lib/projectModel').RailEdge[]} */
    selectedEdges(state) {
      if (!state.project) return []
      const selectedSet = new Set(state.selectedEdgeIds || [])
      return state.project.edges.filter((edge) => selectedSet.has(edge.id))
    },
    /** @returns {boolean} */
    canUndo(state) {
      return (state.history?.past?.length || 0) > 0
    },
    /** @returns {boolean} */
    canRedo(state) {
      return (state.history?.future?.length || 0) > 0
    },
    /** @returns {number[]} */
    timelineYears(state) {
      if (!state.project) return []
      const years = new Set()
      for (const edge of state.project.edges) {
        if (edge.openingYear != null) years.add(edge.openingYear)
      }
      return [...years].sort((a, b) => a - b)
    },
    /** @returns {{min: number, max: number}|null} */
    timelineYearRange(state) {
      const years = this.timelineYears
      if (!years.length) return null
      return { min: years[0], max: years[years.length - 1] }
    },
    /** @returns {boolean} */
    timelineHasData(state) {
      return this.timelineYears.length > 0
    },
    /** @returns {{lines: number, stations: number, km: number}|null} */
    timelineStatsAtYear(state) {
      const filterYear = state.timelineFilterYear
      if (filterYear == null || !state.project) return null
      const edges = state.project.edges
      const visibleEdgeIds = new Set()
      const visibleStationIds = new Set()
      const lineIds = new Set()
      let totalMeters = 0
      for (const edge of edges) {
        if (edge.openingYear != null && edge.openingYear > filterYear) continue
        visibleEdgeIds.add(edge.id)
        visibleStationIds.add(edge.fromStationId)
        visibleStationIds.add(edge.toStationId)
        for (const lid of edge.sharedByLineIds) lineIds.add(lid)
        totalMeters += edge.lengthMeters || 0
      }
      return {
        lines: lineIds.size,
        stations: visibleStationIds.size,
        km: totalMeters / 1000,
      }
    },
    networkStatistics() {
      return null
    },
  },
  actions: {
    ...historyActions,
    ...lifecycleActions,
    ...mapPreferencesActions,
    ...selectionActions,
    ...networkEditingActions,
    ...importLayoutActions,
    ...exportPersistenceActions,
    ...timelineActions,
    ...navigationActions,
    ...styleBrushActions,
    ...annotationActions,
    ...clipboardActions,
    ...reachabilityActions,
    fitToNetwork() {
      this.fitToNetworkTrigger++
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProjectStore, import.meta.hot))
}
