<script setup>
import { computed, reactive, watch } from 'vue'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS, normalizeLineStyle } from '../../lib/lineStyles'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const selectedEdge = computed(() => {
  if (!store.project || !store.selectedEdgeIds.length) return null
  const primaryEdgeId = store.selectedEdgeId || store.selectedEdgeIds[store.selectedEdgeIds.length - 1]
  return store.project.edges.find((edge) => edge.id === primaryEdgeId) || null
})

const selectedEdgeStations = computed(() => {
  if (!selectedEdge.value || !store.project) return { from: null, to: null }
  const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
  return {
    from: stationMap.get(selectedEdge.value.fromStationId) || null,
    to: stationMap.get(selectedEdge.value.toStationId) || null,
  }
})

const selectedEdgeLines = computed(() => {
  if (!selectedEdge.value || !store.project) return []
  const lineMap = new Map(store.project.lines.map((line) => [line.id, line]))
  return (selectedEdge.value.sharedByLineIds || []).map((lineId) => lineMap.get(lineId)).filter(Boolean)
})

const primaryLine = computed(() => selectedEdgeLines.value[0] || null)
const edgeReassignTargets = computed(() => store.project?.lines || [])

const edgeForm = reactive({
  targetLineId: '',
  lineStyle: '',
  curveMode: 'straight',
  openingYear: '',
  phase: '',
})

const currentLineStyle = computed(() => {
  if (!selectedEdge.value) return 'solid'
  return normalizeLineStyle(selectedEdge.value.lineStyleOverride || primaryLine.value?.style)
})

const hasUnsavedChanges = computed(() => {
  if (!selectedEdge.value) return false
  const nextYear = edgeForm.openingYear === '' ? null : Number(edgeForm.openingYear)
  const currentYear = selectedEdge.value.openingYear ?? null
  const nextPhase = edgeForm.phase.trim() || null
  const currentPhase = selectedEdge.value.phase ?? null
  return (
    edgeForm.targetLineId !== (selectedEdge.value.sharedByLineIds?.[0] || '') ||
    edgeForm.lineStyle !== currentLineStyle.value ||
    edgeForm.curveMode !== (selectedEdge.value.isCurved ? 'curved' : 'straight') ||
    nextYear !== currentYear ||
    nextPhase !== currentPhase
  )
})

watch(
  selectedEdge,
  (edge) => {
    if (!edge) return
    edgeForm.targetLineId = edge.sharedByLineIds?.[0] || ''
    edgeForm.lineStyle = normalizeLineStyle(edge.lineStyleOverride || primaryLine.value?.style)
    edgeForm.curveMode = edge.isCurved ? 'curved' : 'straight'
    edgeForm.openingYear = edge.openingYear != null ? String(edge.openingYear) : ''
    edgeForm.phase = edge.phase || ''
  },
  { immediate: true },
)

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function displayStationName(station) {
  if (!station) return ''
  return station.nameZh || ''
}

function resetEdgeForm() {
  if (!selectedEdge.value) return
  edgeForm.targetLineId = selectedEdge.value.sharedByLineIds?.[0] || ''
  edgeForm.lineStyle = currentLineStyle.value
  edgeForm.curveMode = selectedEdge.value.isCurved ? 'curved' : 'straight'
  edgeForm.openingYear = selectedEdge.value.openingYear != null ? String(selectedEdge.value.openingYear) : ''
  edgeForm.phase = selectedEdge.value.phase || ''
}

function applyEdgeChanges() {
  if (!selectedEdge.value) return

  const patch = {}
  const currentLineId = selectedEdge.value.sharedByLineIds?.[0] || ''
  const currentCurveMode = selectedEdge.value.isCurved ? 'curved' : 'straight'
  const currentYear = selectedEdge.value.openingYear ?? null
  const currentPhase = selectedEdge.value.phase ?? null

  if (edgeForm.targetLineId && edgeForm.targetLineId !== currentLineId) {
    patch.targetLineId = edgeForm.targetLineId
  }

  if (edgeForm.lineStyle !== currentLineStyle.value) {
    patch.lineStyle = edgeForm.lineStyle
  }

  if (edgeForm.curveMode !== currentCurveMode) {
    patch.isCurved = edgeForm.curveMode === 'curved'
  }

  const nextYear = edgeForm.openingYear === '' ? null : Number(edgeForm.openingYear)
  if (nextYear !== currentYear) {
    patch.openingYear = Number.isInteger(nextYear) ? nextYear : null
  }

  const nextPhase = edgeForm.phase.trim() || null
  if (nextPhase !== currentPhase) {
    patch.phase = nextPhase
  }

  if (!Object.keys(patch).length) return
  store.updateEdgesBatch([selectedEdge.value.id], patch)
  resetEdgeForm()
}
</script>

<template>
  <div v-if="selectedEdge" class="pp-inspector panel-edge-single">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Edge Inspector</span>
      <h2 class="pp-summary__title">
        {{ displayStationName(selectedEdgeStations.from) || selectedEdge.fromStationId }}
        ↔
        {{ displayStationName(selectedEdgeStations.to) || selectedEdge.toStationId }}
      </h2>
      <p class="pp-summary__subtitle">编辑当前线段。</p>

      <div class="pp-chip-row" v-if="selectedEdgeLines.length">
        <span
          v-for="line in selectedEdgeLines"
          :key="line.id"
          class="pp-chip"
        >
          <span class="pp-chip__swatch" :style="{ backgroundColor: line.color }" />
          {{ displayLineName(line) }}
        </span>
      </div>

      <div class="pp-chip-row">
        <span class="pp-chip" :class="selectedEdge.isCurved ? 'pp-chip--accent' : 'pp-chip--muted'">
          {{ selectedEdge.isCurved ? '曲线段' : '直线段' }}
        </span>
        <span class="pp-chip pp-chip--muted">{{ selectedEdge.openingYear || '未设年份' }}</span>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">几何与归属</h3>
          <p class="pp-card__subtitle">编辑线路、线型和曲线状态。</p>
        </div>
        <span class="pp-chip" :class="hasUnsavedChanges ? 'pp-chip--accent' : 'pp-chip--muted'">
          {{ hasUnsavedChanges ? '已修改' : '已同步' }}
        </span>
      </div>

      <div class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">所属线路</span>
          <select v-model="edgeForm.targetLineId" class="pp-select" :disabled="!edgeReassignTargets.length">
            <option v-for="line in edgeReassignTargets" :key="`edge-line-${line.id}`" :value="line.id">
              {{ displayLineName(line) }}
            </option>
          </select>
        </label>

        <div class="pp-split">
          <label class="pp-field">
            <span class="pp-field__label">线型</span>
            <select v-model="edgeForm.lineStyle" class="pp-select">
              <option v-for="style in LINE_STYLE_OPTIONS" :key="`edge-style-${style.id}`" :value="style.id">
                {{ style.label }}
              </option>
            </select>
          </label>

          <div class="pp-field">
            <span class="pp-field__label">曲线状态</span>
            <div class="pp-segment">
              <button
                class="pp-segment__item"
                :class="{ 'pp-segment__item--active': edgeForm.curveMode === 'straight' }"
                type="button"
                @click="edgeForm.curveMode = 'straight'"
              >
                直线
              </button>
              <button
                class="pp-segment__item"
                :class="{ 'pp-segment__item--active': edgeForm.curveMode === 'curved' }"
                type="button"
                @click="edgeForm.curveMode = 'curved'"
              >
                曲线
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="pp-card pp-card--muted">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">时间元数据</h3>
          <p class="pp-card__subtitle">编辑年份和分期。</p>
        </div>
      </div>

      <div class="pp-split">
        <label class="pp-field">
          <span class="pp-field__label">开通年份</span>
          <input
            v-model="edgeForm.openingYear"
            type="number"
            class="pp-input"
            min="1900"
            max="2100"
            step="1"
            placeholder="例如 1999"
          />
        </label>

        <label class="pp-field">
          <span class="pp-field__label">分期标签</span>
          <input
            v-model="edgeForm.phase"
            type="text"
            class="pp-input"
            placeholder="例如：一期"
          />
        </label>
      </div>

      <div class="pp-card__footer">
        <div class="pp-row">
          <button class="pp-btn pp-btn--primary" type="button" :disabled="!hasUnsavedChanges" @click="applyEdgeChanges">
            保存属性
          </button>
          <button class="pp-btn pp-btn--ghost" type="button" :disabled="!hasUnsavedChanges" @click="resetEdgeForm">
            放弃修改
          </button>
        </div>
      </div>
    </section>

    <section class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除当前线段。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" @click="store.deleteSelectedEdge()">
          删除线段
        </button>
      </div>
    </section>
  </div>
</template>
