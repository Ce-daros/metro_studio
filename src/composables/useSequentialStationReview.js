import { nextTick, ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { getOrderedStationIds } from '../lib/lineGraph'

/**
 * 创建顺序站点审查 composable 的工厂函数
 * @param {object} options
 * @param {string} options.namePrefix - 状态变量前缀
 * @param {(renameTriggerRef: import('vue').Ref) => void} options.triggerValueUpdater - 触发重命名时如何更新 trigger ref
 * @param {(stationIds: string[], store: any) => string[]} [options.filterStations] - 可选的站点过滤函数
 * @param {string} options.statusTextPrefix - 状态栏文本前缀
 * @param {string} options.exitStatusText - 退出时的状态栏文本
 * @param {string} [options.emptyFilterMessage] - 过滤后无站点时的提示
 * @param {string} options.logTag - console 日志标签
 */
export function createSequentialStationReview(options) {
  const {
    namePrefix,
    triggerValueUpdater,
    filterStations,
    statusTextPrefix,
    exitStatusText,
    emptyFilterMessage,
    logTag,
  } = options

  // Module-level singleton state
  const active = ref(false)
  const stationIds = ref([])
  const index = ref(0)

  let renameTriggerRef = null
  let getMapFn = null

  function setTrigger(triggerRef) {
    renameTriggerRef = triggerRef
  }

  function setMapGetter(fn) {
    getMapFn = fn
  }

  async function goToStation(idx) {
    const store = useProjectStore()
    const id = stationIds.value[idx]
    if (!id) return

    const station = store.project?.stations?.find((s) => s.id === id)
    if (!station) return

    store.setSelectedStations([id])

    if (getMapFn) {
      const map = getMapFn()
      if (map && station.lngLat && Array.isArray(station.lngLat) && station.lngLat.length === 2) {
        try {
          map.easeTo({ center: station.lngLat, zoom: 15, duration: 800 })
        } catch (error) {
          console.error(`[${logTag}] Failed to focus on station:`, error)
        }
      }
    }

    index.value = idx

    await nextTick()
    if (renameTriggerRef) {
      triggerValueUpdater(renameTriggerRef)
    }

    const total = stationIds.value.length
    const name = station.nameZh || station.nameEn || '未命名'
    store.statusText = `${statusTextPrefix} (${idx + 1}/${total}): ${name}`
  }

  function start(lineId, startStationId, endStationId, runtimeOptions = {}) {
    const store = useProjectStore()
    const line = store.project?.lines?.find((l) => l.id === lineId)
    if (!line) return

    const edgeMap = new Map(store.project.edges.map((e) => [e.id, e]))
    const allIds = getOrderedStationIds(line, edgeMap)
    if (!allIds.length) return

    const startIdx = allIds.indexOf(startStationId)
    const endIdx = allIds.indexOf(endStationId)
    if (startIdx === -1 || endIdx === -1) return

    const lo = Math.min(startIdx, endIdx)
    const hi = Math.max(startIdx, endIdx)
    let ids = allIds.slice(lo, hi + 1)

    const effectiveFilter = typeof runtimeOptions?.filterStations === 'function'
      ? runtimeOptions.filterStations
      : filterStations
    const effectiveEmptyFilterMessage = String(runtimeOptions?.emptyFilterMessage || '').trim() || emptyFilterMessage

    if (effectiveFilter) {
      ids = effectiveFilter(ids, store)
      if (!ids.length) {
        if (effectiveEmptyFilterMessage) store.statusText = effectiveEmptyFilterMessage
        return
      }
    }

    stationIds.value = ids
    active.value = true
    index.value = 0

    goToStation(0)
  }

  function startWithStationIds(stationIdsInput = [], runtimeOptions = {}) {
    const store = useProjectStore()
    const stationIdSet = new Set(store.project?.stations?.map((station) => station.id) || [])
    let ids = (Array.isArray(stationIdsInput) ? stationIdsInput : [])
      .map((stationId) => String(stationId || '').trim())
      .filter((stationId, index, array) => stationId && array.indexOf(stationId) === index && stationIdSet.has(stationId))

    const effectiveFilter = typeof runtimeOptions?.filterStations === 'function'
      ? runtimeOptions.filterStations
      : filterStations
    const effectiveEmptyFilterMessage = String(runtimeOptions?.emptyFilterMessage || '').trim() || emptyFilterMessage

    if (effectiveFilter) {
      ids = effectiveFilter(ids, store)
      if (!ids.length) {
        if (effectiveEmptyFilterMessage) store.statusText = effectiveEmptyFilterMessage
        return
      }
    }

    if (!ids.length) {
      if (effectiveEmptyFilterMessage) store.statusText = effectiveEmptyFilterMessage
      return
    }

    stationIds.value = ids
    active.value = true
    index.value = 0

    goToStation(0)
  }

  function advance() {
    const next = index.value + 1
    if (next >= stationIds.value.length) {
      exit()
      return
    }
    goToStation(next)
  }

  function exit() {
    const store = useProjectStore()
    active.value = false
    stationIds.value = []
    index.value = 0
    store.statusText = exitStatusText
  }

  function useReview() {
    return {
      [`${namePrefix}Active`]: active,
      [`${namePrefix}StationIds`]: stationIds,
      [`${namePrefix}Index`]: index,
    }
  }

  return {
    active,
    stationIds,
    index,
    setTrigger,
    setMapGetter,
    start,
    startWithStationIds,
    advance,
    exit,
    useReview,
  }
}

// ── 快速命名 ──

const quickNaming = createSequentialStationReview({
  namePrefix: 'quickNaming',
  triggerValueUpdater: (triggerRef) => {
    triggerRef.value = (typeof triggerRef.value === 'number' ? triggerRef.value : 0) + 1
  },
  statusTextPrefix: '快速命名',
  exitStatusText: '已退出快速命名',
  logTag: 'QuickNaming',
})

export const setRenameTrigger = quickNaming.setTrigger
export const setQuickNamingMapGetter = quickNaming.setMapGetter
export const startQuickNaming = quickNaming.start
export const startQuickNamingWithStationIds = quickNaming.startWithStationIds
export const advanceQuickNaming = quickNaming.advance
export const exitQuickNaming = quickNaming.exit
export function useQuickNaming() {
  return {
    quickNamingActive: quickNaming.active,
    quickNamingStationIds: quickNaming.stationIds,
    quickNamingIndex: quickNaming.index,
  }
}

// ── 英文审查 ──

const englishReview = createSequentialStationReview({
  namePrefix: 'englishReview',
  triggerValueUpdater: (triggerRef) => {
    triggerRef.value = 'english'
  },
  filterStations: (ids, store) => {
    const stationMap = new Map(store.project.stations.map((s) => [s.id, s]))
    return ids.filter((id) => {
      const station = stationMap.get(id)
      if (!station) return false
      if (station.nameEnFixed) return false
      const en = String(station.nameEn || '').trim()
      if (!en) return false
      return true
    })
  },
  statusTextPrefix: '审查英文站名',
  exitStatusText: '已退出英文站名审查',
  emptyFilterMessage: '该区间没有需要审查的英文站名（已固定或无英文名）',
  logTag: 'EnglishReview',
})

export const setEnglishReviewTrigger = englishReview.setTrigger
export const setEnglishReviewMapGetter = englishReview.setMapGetter
export const startEnglishReview = englishReview.start
export const startEnglishReviewWithStationIds = englishReview.startWithStationIds
export const advanceEnglishReview = englishReview.advance
export const exitEnglishReview = englishReview.exit
export function useEnglishReview() {
  return {
    englishReviewActive: englishReview.active,
    englishReviewStationIds: englishReview.stationIds,
    englishReviewIndex: englishReview.index,
  }
}
