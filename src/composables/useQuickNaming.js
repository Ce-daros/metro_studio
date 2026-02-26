import { nextTick, ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { getOrderedStationIds } from '../lib/lineGraph'

// Module-level singleton state
const quickNamingActive = ref(false)
const quickNamingStationIds = ref([])
const quickNamingIndex = ref(0)

let renameTriggerRef = null

export function setRenameTrigger(triggerRef) {
  renameTriggerRef = triggerRef
}

let getMapFn = null

export function setQuickNamingMapGetter(fn) {
  getMapFn = fn
}

async function goToStation(index) {
  const store = useProjectStore()
  const id = quickNamingStationIds.value[index]
  if (!id) return

  const station = store.project?.stations?.find((s) => s.id === id)
  if (!station) return

  store.setSelectedStations([id])

  // 聚焦到站点位置
  if (getMapFn) {
    const map = getMapFn()
    if (map && station.lngLat && Array.isArray(station.lngLat) && station.lngLat.length === 2) {
      try {
        map.easeTo({ center: station.lngLat, zoom: 15, duration: 800 })
      } catch (error) {
        console.error('[QuickNaming] Failed to focus on station:', error)
      }
    }
  }

  quickNamingIndex.value = index

  // 等 DOM 更新完（PanelStationSingle 重新渲染新站数据）再触发聚焦
  await nextTick()
  if (renameTriggerRef) {
    renameTriggerRef.value += 1
  }

  const total = quickNamingStationIds.value.length
  const name = station.nameZh || station.nameEn || '未命名'
  store.statusText = `快速命名 (${index + 1}/${total}): ${name}`
}

export function startQuickNaming(lineId, startStationId, endStationId) {
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
  quickNamingStationIds.value = allIds.slice(lo, hi + 1)
  quickNamingActive.value = true
  quickNamingIndex.value = 0

  goToStation(0)
}

export function advanceQuickNaming() {
  const next = quickNamingIndex.value + 1
  if (next >= quickNamingStationIds.value.length) {
    exitQuickNaming()
    return
  }
  goToStation(next)
}

export function exitQuickNaming() {
  const store = useProjectStore()
  quickNamingActive.value = false
  quickNamingStationIds.value = []
  quickNamingIndex.value = 0
  store.statusText = '已退出快速命名'
}

export function useQuickNaming() {
  return {
    quickNamingActive,
    quickNamingStationIds,
    quickNamingIndex,
  }
}
