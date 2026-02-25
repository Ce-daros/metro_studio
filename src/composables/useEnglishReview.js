import { nextTick, ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { getOrderedStationIds } from '../lib/lineGraph'

// Module-level singleton state
const englishReviewActive = ref(false)
const englishReviewStationIds = ref([])
const englishReviewIndex = ref(0)

let renameTriggerRef = null

export function setEnglishReviewTrigger(triggerRef) {
  renameTriggerRef = triggerRef
}

let getMapFn = null

export function setEnglishReviewMapGetter(fn) {
  getMapFn = fn
}

async function goToStation(index) {
  const store = useProjectStore()
  const id = englishReviewStationIds.value[index]
  if (!id) return

  const station = store.project?.stations?.find((s) => s.id === id)
  if (!station) return

  store.setSelectedStations([id])

  if (getMapFn) {
    const map = getMapFn()
    if (map && station.lngLat) {
      map.easeTo({ center: station.lngLat, zoom: 15, duration: 800 })
    }
  }

  englishReviewIndex.value = index

  // 等 DOM 更新完（PanelStationSingle 重新渲染新站数据）再触发聚焦
  await nextTick()
  if (renameTriggerRef) {
    renameTriggerRef.value = 'english' // Signal to focus on English name input
  }

  const total = englishReviewStationIds.value.length
  const name = station.nameZh || station.nameEn || '未命名'
  store.statusText = `审查英文站名 (${index + 1}/${total}): ${name}`
}

export function startEnglishReview(lineId, startStationId, endStationId) {
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

  // 过滤出需要审查的站点：
  // 1. 有英文名但未固定
  // 2. 或者英文名包含中文（需要修改）
  const stationMap = new Map(store.project.stations.map((s) => [s.id, s]))
  const reviewIds = allIds.slice(lo, hi + 1).filter((id) => {
    const station = stationMap.get(id)
    if (!station) return false
    // 已固定的跳过
    if (station.nameEnFixed) return false
    // 没有英文名的跳过
    const en = String(station.nameEn || '').trim()
    if (!en) return false
    return true
  })

  if (!reviewIds.length) {
    store.statusText = '该区间没有需要审查的英文站名（已固定或无英文名）'
    return
  }

  englishReviewStationIds.value = reviewIds
  englishReviewActive.value = true
  englishReviewIndex.value = 0

  goToStation(0)
}

export function advanceEnglishReview() {
  const next = englishReviewIndex.value + 1
  if (next >= englishReviewStationIds.value.length) {
    exitEnglishReview()
    return
  }
  goToStation(next)
}

export function exitEnglishReview() {
  const store = useProjectStore()
  englishReviewActive.value = false
  englishReviewStationIds.value = []
  englishReviewIndex.value = 0
  store.statusText = '已退出英文站名审查'
}

export function useEnglishReview() {
  return {
    englishReviewActive,
    englishReviewStationIds,
    englishReviewIndex,
  }
}
