<script setup>
import { computed } from 'vue'
import { getDisplayLineName } from '../../lib/lineNaming'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const anchor = computed(() => store.selectedEdgeAnchor)

const selectedEdge = computed(() => {
  if (!anchor.value || !store.project) return null
  return store.project.edges.find((edge) => edge.id === anchor.value.edgeId) || null
})

const edgeStations = computed(() => {
  if (!selectedEdge.value || !store.project) return { from: null, to: null }
  const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
  return {
    from: stationMap.get(selectedEdge.value.fromStationId) || null,
    to: stationMap.get(selectedEdge.value.toStationId) || null,
  }
})

const edgeLines = computed(() => {
  if (!selectedEdge.value || !store.project) return []
  const lineMap = new Map(store.project.lines.map((line) => [line.id, line]))
  return (selectedEdge.value.sharedByLineIds || []).map((lineId) => lineMap.get(lineId)).filter(Boolean)
})

const totalAnchors = computed(() => {
  if (!selectedEdge.value) return 0
  const waypoints = store.resolveEditableEdgeWaypoints(selectedEdge.value)
  if (!waypoints || waypoints.length < 3) return 0
  return waypoints.length - 2
})

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function deleteAnchor() {
  if (!anchor.value) return
  store.removeSelectedEdgeAnchor()
}
</script>

<template>
  <div v-if="anchor && selectedEdge" class="pp-inspector panel-anchor">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Anchor Inspector</span>
      <h2 class="pp-summary__title">
        {{ edgeStations.from?.nameZh || selectedEdge.fromStationId }}
        ↔
        {{ edgeStations.to?.nameZh || selectedEdge.toStationId }}
      </h2>
      <p class="pp-summary__subtitle">编辑当前控制点。</p>

      <div class="pp-chip-row">
        <span class="pp-chip pp-chip--accent">第 {{ anchor.anchorIndex }} / {{ totalAnchors }} 个控制点</span>
      </div>

      <div class="pp-chip-row" v-if="edgeLines.length">
        <span
          v-for="line in edgeLines"
          :key="line.id"
          class="pp-chip"
        >
          <span class="pp-chip__swatch" :style="{ backgroundColor: line.color }" />
          {{ displayLineName(line) }}
        </span>
      </div>
    </section>

    <section class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除当前控制点。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" @click="deleteAnchor">
          删除控制点
        </button>
      </div>
    </section>
  </div>
</template>
