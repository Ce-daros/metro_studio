<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS } from '../../lib/lineStyles'
import { NTooltip } from 'naive-ui'
import { useTextTransform } from '../../composables/useTextTransform'

const store = useProjectStore()
const { convertText } = useTextTransform()
const isTraditional = computed(() => store.chineseScript === 'traditional')
const convertedLineNames = ref(new Map())
const convertedStationNames = ref(new Map())

const selectedEdge = computed(() => {
  if (!store.project || !store.selectedEdgeIds.length) return null
  const primaryEdgeId = store.selectedEdgeId || store.selectedEdgeIds[store.selectedEdgeIds.length - 1]
  return store.project.edges.find((e) => e.id === primaryEdgeId) || null
})

const selectedEdgeStations = computed(() => {
  if (!selectedEdge.value || !store.project) return { from: null, to: null }
  const stationMap = new Map(store.project.stations.map((s) => [s.id, s]))
  return {
    from: stationMap.get(selectedEdge.value.fromStationId) || null,
    to: stationMap.get(selectedEdge.value.toStationId) || null,
  }
})

const selectedEdgeLines = computed(() => {
  if (!selectedEdge.value || !store.project) return []
  const lineMap = new Map(store.project.lines.map((l) => [l.id, l]))
  return (selectedEdge.value.sharedByLineIds || []).map((lineId) => lineMap.get(lineId)).filter(Boolean)
})

const edgeReassignTargets = computed(() => store.project?.lines || [])

const edgeBatchForm = reactive({
  targetLineId: '',
  lineStyle: '',
  curveMode: 'keep',
  openingYear: '',
  phase: '',
})

watch(
  () => selectedEdge.value,
  (edge) => {
    if (!edge) return
    edgeBatchForm.openingYear = edge.openingYear != null ? String(edge.openingYear) : ''
    edgeBatchForm.phase = edge.phase || ''
  },
  { immediate: true },
)

const canApplyBatch = computed(
  () => Boolean(edgeBatchForm.targetLineId) || Boolean(edgeBatchForm.lineStyle) || edgeBatchForm.curveMode !== 'keep' || edgeBatchForm.openingYear !== '' || edgeBatchForm.phase !== '',
)

async function updateConvertedNames() {
  if (!isTraditional.value) {
    convertedLineNames.value.clear()
    convertedStationNames.value.clear()
    return
  }

  try {
    const lines = selectedEdgeLines.value
    const newLineMap = new Map()
    for (const line of lines) {
      const name = getDisplayLineName(line, 'zh')
      if (name) {
        newLineMap.set(line.id, await convertText(name, 'traditional'))
      }
    }
    convertedLineNames.value = newLineMap

    const stations = [selectedEdgeStations.value.from, selectedEdgeStations.value.to].filter(Boolean)
    const newStationMap = new Map()
    for (const station of stations) {
      if (station.nameZh) {
        newStationMap.set(station.id, await convertText(station.nameZh, 'traditional'))
      }
    }
    convertedStationNames.value = newStationMap
  } catch (e) {
    console.warn('[PanelEdgeSingle] convertText failed:', e)
  }
}

watch([selectedEdgeLines, selectedEdgeStations, isTraditional], () => {
  updateConvertedNames()
}, { immediate: true })

function displayLineName(line) {
  if (isTraditional.value && convertedLineNames.value.has(line.id)) {
    return convertedLineNames.value.get(line.id)
  }
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function displayStationName(station) {
  if (!station) return ''
  if (isTraditional.value && convertedStationNames.value.has(station.id)) {
    return convertedStationNames.value.get(station.id)
  }
  return station.nameZh || ''
}

function applyBatch() {
  const edgeIds = store.selectedEdgeIds || []
  if (!edgeIds.length) return

  const patch = {}
  if (edgeBatchForm.targetLineId) patch.targetLineId = edgeBatchForm.targetLineId
  if (edgeBatchForm.lineStyle) patch.lineStyle = edgeBatchForm.lineStyle
  if (edgeBatchForm.curveMode === 'curved') patch.isCurved = true
  else if (edgeBatchForm.curveMode === 'straight') patch.isCurved = false
  if (edgeBatchForm.openingYear !== '') {
    const parsed = Number(edgeBatchForm.openingYear)
    patch.openingYear = Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null
  }
  if (edgeBatchForm.phase !== '') patch.phase = edgeBatchForm.phase

  if (!Object.keys(patch).length) {
    store.statusText = '请先选择至少一个批量变更项'
    return
  }

  const { updatedCount } = store.updateEdgesBatch(edgeIds, patch)
  if (!updatedCount) {
    store.statusText = '所选线段未发生变化'
    return
  }
  store.statusText = `已批量更新 ${updatedCount} 条线段`
}

function resetBatchForm() {
  edgeBatchForm.targetLineId = ''
  edgeBatchForm.lineStyle = ''
  edgeBatchForm.curveMode = 'keep'
  edgeBatchForm.openingYear = ''
  edgeBatchForm.phase = ''
}

watch(
  [() => store.selectedEdgeIds, () => store.project?.lines],
  ([edgeIds]) => {
    const lines = store.project?.lines || []
    const edges = (edgeIds || []).map((id) => store.project?.edges?.find((e) => e.id === id)).filter(Boolean)
    if (!edges.length || !lines.length) {
      resetBatchForm()
      return
    }
    const currentLineIds = new Set(
      edges.flatMap((edge) => (edge.sharedByLineIds || []).map((lineId) => String(lineId))),
    )
    const targetStillAvailable = lines.some((line) => line.id === edgeBatchForm.targetLineId)
    if (targetStillAvailable) return
    const preferred = lines.find((line) => !currentLineIds.has(String(line.id)))
    if (preferred) {
      edgeBatchForm.targetLineId = preferred.id
      return
    }
    edgeBatchForm.targetLineId = lines[0].id
  },
  { immediate: true },
)
</script>

<template>
  <div class="panel-edge-single" v-if="selectedEdge">
    <div class="pp-context">
      <div class="pp-kv">
        <span class="pp-kv-label">连接</span>
        <span class="pp-kv-value">
          {{ displayStationName(selectedEdgeStations.from) || selectedEdge.fromStationId }}
          ↔
          {{ displayStationName(selectedEdgeStations.to) || selectedEdge.toStationId }}
        </span>
      </div>
      <div class="pp-kv" v-if="selectedEdgeLines.length">
        <span class="pp-kv-label">线路</span>
        <ul class="pp-kv-value edge-line-tags">
          <li v-for="line in selectedEdgeLines" :key="line.id" :title="line.nameZh">
            <span class="edge-line-swatch" :style="{ backgroundColor: line.color }" />
            <span>{{ displayLineName(line) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="pp-fields">
      <select v-model="edgeBatchForm.targetLineId" class="pp-select" :disabled="!edgeReassignTargets.length">
        <option value="">目标线路（保持不变）</option>
        <option v-for="line in edgeReassignTargets" :key="`eb_line_${line.id}`" :value="line.id">
          {{ displayLineName(line) }}
        </option>
      </select>
      <select v-model="edgeBatchForm.lineStyle" class="pp-select">
        <option value="">线型（保持不变）</option>
        <option v-for="s in LINE_STYLE_OPTIONS" :key="`eb_style_${s.id}`" :value="s.id">{{ s.label }}</option>
      </select>
      <select v-model="edgeBatchForm.curveMode" class="pp-select">
        <option value="keep">曲线状态（保持不变）</option>
        <option value="curved">设为曲线</option>
        <option value="straight">设为直线（清锚点）</option>
      </select>
      <input v-model="edgeBatchForm.openingYear" type="number" class="pp-input" placeholder="开通年份" min="1900" max="2100" step="1" />
      <input v-model="edgeBatchForm.phase" type="text" class="pp-input" placeholder="分期标签，如：一期" />
    </div>

    <div class="pp-actions">
      <div class="pp-row" style="margin-top:0">
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--primary" style="flex:1" :disabled="!canApplyBatch" @click="applyBatch">应用</button>
          </template>
          应用属性
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn" @click="resetBatchForm">重置</button>
          </template>
          重置
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--danger" @click="store.deleteSelectedEdge()">删除</button>
          </template>
          删除线段
        </NTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-edge-single {
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
