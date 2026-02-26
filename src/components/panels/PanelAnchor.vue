<script setup>
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { NTooltip } from 'naive-ui'

const store = useProjectStore()

const anchor = computed(() => store.selectedEdgeAnchor)

const selectedEdge = computed(() => {
  if (!anchor.value || !store.project) return null
  return store.project.edges.find((e) => e.id === anchor.value.edgeId) || null
})

const edgeStations = computed(() => {
  if (!selectedEdge.value || !store.project) return { from: null, to: null }
  const stationMap = new Map(store.project.stations.map((s) => [s.id, s]))
  return {
    from: stationMap.get(selectedEdge.value.fromStationId) || null,
    to: stationMap.get(selectedEdge.value.toStationId) || null,
  }
})

const edgeLines = computed(() => {
  if (!selectedEdge.value || !store.project) return []
  const lineMap = new Map(store.project.lines.map((l) => [l.id, l]))
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
  <div class="panel-anchor" v-if="anchor && selectedEdge">
    <div class="pp-context">
      <div class="pp-kv">
        <span class="pp-kv-label">连接</span>
        <span class="pp-kv-value">
          {{ edgeStations.from?.nameZh || selectedEdge.fromStationId }}
          ↔
          {{ edgeStations.to?.nameZh || selectedEdge.toStationId }}
        </span>
      </div>
      <div class="pp-kv" v-if="edgeLines.length">
        <span class="pp-kv-label">线路</span>
        <ul class="pp-kv-value edge-line-tags">
          <li v-for="line in edgeLines" :key="line.id" :title="line.nameZh">
            <span class="edge-line-swatch" :style="{ backgroundColor: line.color }" />
            <span>{{ displayLineName(line) }}</span>
          </li>
        </ul>
      </div>
      <div class="pp-kv">
        <span class="pp-kv-label">控制点</span>
        <span class="pp-kv-value">第 {{ anchor.anchorIndex }} / {{ totalAnchors }} 个</span>
      </div>
    </div>

    <div class="pp-actions">
      <NTooltip placement="bottom">
        <template #trigger>
          <button class="pp-btn pp-btn--danger" style="width:100%" @click="deleteAnchor">删除控制点</button>
        </template>
        删除控制点
      </NTooltip>
    </div>
  </div>
</template>

<style scoped>
.panel-anchor {
  display: flex;
  flex-direction: column;
}

.edge-line-tags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.edge-line-tags li {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 4px;
  background: var(--toolbar-input-bg);
  font-size: 11px;
  color: var(--toolbar-text);
}

.edge-line-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
</style>
