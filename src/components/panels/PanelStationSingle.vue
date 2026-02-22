<script setup>
import { computed, inject, nextTick, reactive, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { NTooltip } from 'naive-ui'
import { useTextTransform } from '../../composables/useTextTransform'

const store = useProjectStore()
const nameZhInputRef = ref(null)
const { convertText } = useTextTransform()

const isTraditional = computed(() => store.chineseScript === 'traditional')

const renameTrigger = inject('stationRenameTrigger', ref(0))

watch(renameTrigger, async () => {
  if (!selectedStation.value || !nameZhInputRef.value) return
  await nextTick()
  nameZhInputRef.value.focus()
  nameZhInputRef.value.select()
})

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((s) => s.id === store.selectedStationId) || null
})

const stationForm = reactive({
  nameZh: '',
  nameEn: '',
})

const convertedLineNames = ref(new Map())

async function updateConvertedLineNames() {
  if (!isTraditional.value) {
    convertedLineNames.value.clear()
    return
  }
  try {
    const lines = belongingLines.value
    const newMap = new Map()
    for (const line of lines) {
      const name = getDisplayLineName(line, 'zh')
      if (name) {
        newMap.set(line.id, await convertText(name, 'traditional'))
      }
    }
    convertedLineNames.value = newMap
  } catch (e) {
    console.warn('[PanelStationSingle] convertText failed:', e)
  }
}

const coordinatesText = computed(() => {
  if (!selectedStation.value?.lngLat) return null
  const [lng, lat] = selectedStation.value.lngLat
  return `${lng.toFixed(6)}, ${lat.toFixed(6)}`
})

const belongingLines = computed(() => {
  if (!selectedStation.value?.lineIds?.length) return []
  const lineMap = store.lineById
  return selectedStation.value.lineIds
    .map((id) => lineMap.get(id))
    .filter(Boolean)
})

watch([belongingLines, isTraditional], () => {
  updateConvertedLineNames()
}, { immediate: true })

const connectedEdgesCount = computed(() => {
  if (!selectedStation.value || !store.project?.edges) return 0
  const sid = selectedStation.value.id
  return store.project.edges.filter(
    (e) => e.fromStationId === sid || e.toStationId === sid,
  ).length
})

function displayLineName(line) {
  if (isTraditional.value && convertedLineNames.value.has(line.id)) {
    return convertedLineNames.value.get(line.id)
  }
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function applyStationRename() {
  if (!selectedStation.value) return
  store.updateStationName(selectedStation.value.id, {
    nameZh: stationForm.nameZh,
    nameEn: stationForm.nameEn,
  })
}

function deleteStation() {
  store.deleteSelectedStations()
}

watch(
  selectedStation,
  (station) => {
    stationForm.nameZh = station?.nameZh || ''
    stationForm.nameEn = station?.nameEn || ''
  },
  { immediate: true },
)
</script>

<template>
  <div class="panel-station-single" v-if="selectedStation">
    <div class="pp-context">
      <div class="pp-kv" v-if="coordinatesText">
        <span class="pp-kv-label">坐标</span>
        <span class="pp-kv-value">{{ coordinatesText }}</span>
      </div>
      <div class="pp-kv" v-if="belongingLines.length">
        <span class="pp-kv-label">线路</span>
        <ul class="pp-kv-value station-line-tags">
          <li v-for="line in belongingLines" :key="line.id" :title="line.nameZh">
            <span class="station-line-swatch" :style="{ backgroundColor: line.color }" />
            <span>{{ displayLineName(line) }}</span>
          </li>
        </ul>
      </div>
      <div class="pp-kv">
        <span class="pp-kv-label">换乘</span>
        <span class="pp-kv-value">
          <span v-if="selectedStation.isInterchange" class="station-badge station-badge--interchange">换乘站 · {{ selectedStation.transferLineIds?.length || belongingLines.length }} 线</span>
          <span v-else>非换乘站</span>
          · {{ connectedEdgesCount }} 条线段
        </span>
      </div>
    </div>

    <div class="pp-fields">
      <input ref="nameZhInputRef" v-model="stationForm.nameZh" class="pp-input" placeholder="车站中文名" />
      <input v-model="stationForm.nameEn" class="pp-input" placeholder="Station English Name" />
    </div>

    <div class="pp-actions">
      <div class="pp-row" style="margin-top:0">
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--primary" style="flex:1" @click="applyStationRename">保存站名</button>
          </template>
          保存站名
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--danger" @click="deleteStation">删除</button>
          </template>
          删除站点
        </NTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-station-single {
  display: flex;
  flex-direction: column;
}

.station-line-tags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.station-line-tags li {
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

.station-line-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.station-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.station-badge--interchange {
  background: rgba(255, 45, 120, 0.1);
  border: 1px solid rgba(255, 45, 120, 0.3);
  color: var(--ark-pink);
}
</style>
