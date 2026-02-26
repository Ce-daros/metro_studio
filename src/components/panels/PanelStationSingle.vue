<script setup>
import { computed, inject, nextTick, reactive, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { NTooltip } from 'naive-ui'
import { useQuickNaming, advanceQuickNaming, useEnglishReview, advanceEnglishReview } from '../../composables/useSequentialStationReview'

const store = useProjectStore()
const nameZhInputRef = ref(null)
const nameEnInputRef = ref(null)
const { quickNamingActive } = useQuickNaming()
const { englishReviewActive } = useEnglishReview()

const renameTrigger = inject('stationRenameTrigger', ref(0))

// 名称固定状态
const isNameEnFixed = computed(() => selectedStation.value?.nameEnFixed || false)

watch(renameTrigger, async (value) => {
  if (!selectedStation.value) return
  await nextTick()
  // 如果是 'english' 字符串，聚焦英文名输入框
  if (value === 'english') {
    nameEnInputRef.value?.focus()
    nameEnInputRef.value?.select()
  } else if (typeof value === 'number') {
    // 否则聚焦中文名输入框（快速命名模式）
    if (!nameZhInputRef.value) return
    nameZhInputRef.value.focus()
    nameZhInputRef.value.select()
  }
})

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((s) => s.id === store.selectedStationId) || null
})

const stationForm = reactive({
  nameZh: '',
  nameEn: '',
})

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

const connectedEdgesCount = computed(() => {
  if (!selectedStation.value || !store.project?.edges) return 0
  const sid = selectedStation.value.id
  return store.project.edges.filter(
    (e) => e.fromStationId === sid || e.toStationId === sid,
  ).length
})

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function applyStationRename() {
  if (!selectedStation.value) return
  store.updateStationName(selectedStation.value.id, {
    nameZh: stationForm.nameZh,
    nameEn: stationForm.nameEn,
  })
}

function onNameZhKeydown(e) {
  if (e.key === 'Enter' && quickNamingActive.value) {
    e.preventDefault()
    applyStationRename()
    advanceQuickNaming()
  }
}

function onNameEnKeydown(e) {
  if (e.key === 'Enter' && englishReviewActive.value) {
    e.preventDefault()
    // 保存英文名并自动固定
    if (selectedStation.value) {
      store.updateStationName(selectedStation.value.id, {
        nameZh: stationForm.nameZh,
        nameEn: stationForm.nameEn,
      })
      // 自动固定英文名
      store.setStationNameEnFixed(selectedStation.value.id, true)
    }
    advanceEnglishReview()
  }
}

function deleteStation() {
  store.deleteSelectedStations()
}

function toggleNameEnFixed() {
  if (!selectedStation.value) return
  store.toggleStationNameEnFixed(selectedStation.value.id)
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
      <input ref="nameZhInputRef" v-model="stationForm.nameZh" class="pp-input" placeholder="车站中文名" @keydown="onNameZhKeydown" />
      <input ref="nameEnInputRef" v-model="stationForm.nameEn" class="pp-input" placeholder="Station English Name" @keydown="onNameEnKeydown" />
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
      <div class="pp-row">
        <NTooltip placement="bottom">
          <template #trigger>
            <button
              class="pp-btn"
              :class="isNameEnFixed ? 'pp-btn--active' : ''"
              style="flex:1"
              @click="toggleNameEnFixed"
            >
              {{ isNameEnFixed ? '🔓 已固定' : '🔒 固定英文名' }}
            </button>
          </template>
          {{ isNameEnFixed ? '英文名已固定，AI 翻译不会覆盖' : '固定英文名，防止被 AI 翻译覆盖' }}
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

.pp-btn--active {
  background: rgba(255, 45, 120, 0.15) !important;
  border-color: var(--ark-pink) !important;
  color: var(--ark-pink) !important;
}
</style>
