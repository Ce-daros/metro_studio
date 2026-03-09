<script setup>
import { computed, inject, nextTick, reactive, ref, watch } from 'vue'
import { NTooltip } from 'naive-ui'
import { getDisplayLineName } from '../../lib/lineNaming'
import { useQuickNaming, advanceQuickNaming, useEnglishReview, advanceEnglishReview } from '../../composables/useSequentialStationReview'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()
const nameZhInputRef = ref(null)
const nameEnInputRef = ref(null)
const { quickNamingActive } = useQuickNaming()
const { englishReviewActive } = useEnglishReview()

const renameTrigger = inject('stationRenameTrigger', ref(0))

const selectedStation = computed(() => {
  if (!store.project || !store.selectedStationId) return null
  return store.project.stations.find((station) => station.id === store.selectedStationId) || null
})

const stationForm = reactive({
  nameZh: '',
  nameEn: '',
})

const isNameEnFixed = computed(() => Boolean(selectedStation.value?.nameEnFixed))

const coordinatesText = computed(() => {
  if (!selectedStation.value?.lngLat) return '未定位'
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
  const stationId = selectedStation.value.id
  return store.project.edges.filter(
    (edge) => edge.fromStationId === stationId || edge.toStationId === stationId,
  ).length
})

const transferSummary = computed(() => {
  if (!selectedStation.value?.isInterchange) return '非换乘站'
  const lineCount = selectedStation.value.transferLineIds?.length || belongingLines.value.length
  return `换乘站 · ${lineCount} 线`
})

const hasUnsavedNameChanges = computed(() => {
  if (!selectedStation.value) return false
  const currentZh = selectedStation.value.nameZh || ''
  const currentEn = selectedStation.value.nameEn || ''
  return stationForm.nameZh !== currentZh || stationForm.nameEn !== currentEn
})

watch(renameTrigger, async (value) => {
  if (!selectedStation.value) return
  await nextTick()
  if (value === 'english') {
    nameEnInputRef.value?.focus()
    nameEnInputRef.value?.select()
    return
  }
  if (typeof value === 'number') {
    nameZhInputRef.value?.focus()
    nameZhInputRef.value?.select()
  }
})

watch(
  selectedStation,
  (station) => {
    stationForm.nameZh = station?.nameZh || ''
    stationForm.nameEn = station?.nameEn || ''
  },
  { immediate: true },
)

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

function resetNameForm() {
  stationForm.nameZh = selectedStation.value?.nameZh || ''
  stationForm.nameEn = selectedStation.value?.nameEn || ''
}

function onNameZhKeydown(event) {
  if (event.key === 'Enter' && quickNamingActive.value) {
    event.preventDefault()
    applyStationRename()
    advanceQuickNaming()
  }
}

function onNameEnKeydown(event) {
  if (event.key === 'Enter' && englishReviewActive.value) {
    event.preventDefault()
    if (selectedStation.value) {
      store.updateStationName(selectedStation.value.id, {
        nameZh: stationForm.nameZh,
        nameEn: stationForm.nameEn,
      })
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
</script>

<template>
  <div v-if="selectedStation" class="pp-inspector panel-station-single">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Station Inspector</span>
      <h2 class="pp-summary__title">{{ selectedStation.nameZh || '未命名站点' }}</h2>
      <p class="pp-summary__subtitle">{{ selectedStation.nameEn || '暂无英文名' }}</p>

      <div class="pp-chip-row">
        <span class="pp-chip" :class="{ 'pp-chip--accent': selectedStation.isInterchange }">
          {{ transferSummary }}
        </span>
        <span class="pp-chip pp-chip--muted">{{ connectedEdgesCount }} 条连接线段</span>
      </div>

      <div class="pp-chip-row" v-if="belongingLines.length">
        <span
          v-for="line in belongingLines"
          :key="line.id"
          class="pp-chip"
        >
          <span class="pp-chip__swatch" :style="{ backgroundColor: line.color }" />
          {{ displayLineName(line) }}
        </span>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">站点命名</h3>
          <p class="pp-card__subtitle">编辑站点名称。</p>
        </div>
        <span class="pp-chip" :class="hasUnsavedNameChanges ? 'pp-chip--accent' : 'pp-chip--muted'">
          {{ hasUnsavedNameChanges ? '已修改' : '已同步' }}
        </span>
      </div>

      <div class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">中文名</span>
          <input
            ref="nameZhInputRef"
            v-model="stationForm.nameZh"
            class="pp-input"
            placeholder="输入站点中文名"
            @keydown="onNameZhKeydown"
          />
        </label>

        <div class="pp-field">
          <div class="pp-field__head">
            <span class="pp-field__label">英文名</span>
            <NTooltip placement="left">
              <template #trigger>
                <button
                  class="pp-icon-btn"
                  :class="{ 'pp-icon-btn--active': isNameEnFixed }"
                  type="button"
                  @click="toggleNameEnFixed"
                >
                  {{ isNameEnFixed ? 'LOCK' : 'AUTO' }}
                </button>
              </template>
              {{ isNameEnFixed ? '英文名已锁定' : '英文名未锁定' }}
            </NTooltip>
          </div>

          <input
            ref="nameEnInputRef"
            v-model="stationForm.nameEn"
            class="pp-input"
            placeholder="Input station English name"
            @keydown="onNameEnKeydown"
          />
          <p class="pp-field__help">
            {{ isNameEnFixed ? '已锁定英文名。' : '可锁定英文名。' }}
          </p>
        </div>
      </div>

      <div class="pp-card__footer">
        <div class="pp-row">
          <button class="pp-btn pp-btn--primary" type="button" :disabled="!hasUnsavedNameChanges" @click="applyStationRename">
            保存名称
          </button>
          <button class="pp-btn pp-btn--ghost" type="button" :disabled="!hasUnsavedNameChanges" @click="resetNameForm">
            放弃修改
          </button>
        </div>
      </div>
    </section>

    <section class="pp-card pp-card--muted">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">位置与拓扑</h3>
          <p class="pp-card__subtitle">查看位置和连接信息。</p>
        </div>
      </div>

      <div class="pp-stat-grid">
        <div class="pp-stat">
          <span class="pp-stat__label">坐标</span>
          <span class="pp-stat__value panel-station-single__mono">{{ coordinatesText }}</span>
        </div>
        <div class="pp-stat">
          <span class="pp-stat__label">所属线路</span>
          <span class="pp-stat__value">{{ belongingLines.length }}</span>
        </div>
        <div class="pp-stat">
          <span class="pp-stat__label">连接线段</span>
          <span class="pp-stat__value">{{ connectedEdgesCount }}</span>
        </div>
        <div class="pp-stat">
          <span class="pp-stat__label">对象 ID</span>
          <span class="pp-stat__value panel-station-single__mono">{{ selectedStation.id }}</span>
        </div>
      </div>
    </section>

    <section class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除当前站点。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" @click="deleteStation">
          删除站点
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel-station-single__mono {
  font-family: var(--app-font-mono);
  font-size: 12px;
  line-height: 1.35;
  word-break: break-all;
}
</style>
