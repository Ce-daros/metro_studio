<script setup>
import { computed, reactive } from 'vue'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const isNewStation = (station) => station.nameZh?.startsWith('新站 ')

const selectedStationCount = computed(() => store.selectedStationIds.length)

const selectedStationsInOrder = computed(() => {
  if (!store.project) return []
  const stationMap = new Map(store.project.stations.map((station) => [station.id, station]))
  return (store.selectedStationIds || []).map((id) => stationMap.get(id)).filter(Boolean)
})

const selectedStationNamePreview = computed(() => {
  const stations = selectedStationsInOrder.value
  if (!stations.length) return '未选中站点'
  if (stations.length === 1) return stations[0].nameZh || stations[0].id
  return `${stations[0].nameZh || stations[0].id} 等 ${stations.length} 站`
})

const stationBatchForm = reactive({
  zhTemplate: '',
  enTemplate: '',
  startIndex: 1,
})

const stationEnglishRetranslateProgress = computed(() => store.stationEnglishRetranslateProgress || {
  done: 0,
  total: 0,
  percent: 0,
  message: '',
})

const canRenameBatch = computed(() => {
  return Boolean(stationBatchForm.zhTemplate.trim() || stationBatchForm.enTemplate.trim())
})

const canEditSelectedManualTransfer = computed(() => selectedStationCount.value === 2)

const selectedManualTransferExists = computed(() => {
  if (!canEditSelectedManualTransfer.value) return false
  const [stationAId, stationBId] = store.selectedStationIds
  return store.hasManualTransferBetweenStations(stationAId, stationBId)
})

function applyBatchStationRename() {
  store.renameSelectedStationsByTemplate({
    zhTemplate: stationBatchForm.zhTemplate,
    enTemplate: stationBatchForm.enTemplate,
    startIndex: stationBatchForm.startIndex,
  })
}

function resetBatchRename() {
  stationBatchForm.zhTemplate = ''
  stationBatchForm.enTemplate = ''
  stationBatchForm.startIndex = 1
}

function copyStationNames() {
  const stations = [...selectedStationsInOrder.value]
  const count = stations.length
  if (count > 1) {
    const coords = stations.map((station) => [station.lngLat?.[0] ?? 0, station.lngLat?.[1] ?? 0])
    const meanX = coords.reduce((sum, coord) => sum + coord[0], 0) / count
    const meanY = coords.reduce((sum, coord) => sum + coord[1], 0) / count
    const sxx = coords.reduce((sum, coord) => sum + (coord[0] - meanX) ** 2, 0)
    const syy = coords.reduce((sum, coord) => sum + (coord[1] - meanY) ** 2, 0)
    const sxy = coords.reduce((sum, coord) => sum + (coord[0] - meanX) * (coord[1] - meanY), 0)
    const diff = sxx - syy
    const dx = 2 * sxy
    const dy = diff + Math.sqrt(diff ** 2 + dx ** 2)
    const length = Math.sqrt(dx ** 2 + dy ** 2) || 1
    const axisX = dx / length
    const axisY = dy / length
    const flip = axisY < -Math.abs(axisX)
    const projectionById = new Map(
      stations.map((station, index) => [
        station.id,
        (coords[index][0] - meanX) * axisX + (coords[index][1] - meanY) * axisY,
      ]),
    )
    stations.sort((left, right) => (flip ? projectionById.get(right.id) - projectionById.get(left.id) : projectionById.get(left.id) - projectionById.get(right.id)))
  }

  const names = stations.map((station) => station.nameZh)
  navigator.clipboard.writeText(names.join(' '))
}

function translateNonNewStations() {
  const ids = selectedStationsInOrder.value.filter((station) => !isNewStation(station)).map((station) => station.id)
  if (!ids.length) return
  store.retranslateStationEnglishNamesByIdsWithAi(ids)
}
</script>

<template>
  <div class="pp-inspector panel-station-multi">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Batch Station Inspector</span>
      <h2 class="pp-summary__title">{{ selectedStationCount }} 个站点</h2>
      <p class="pp-summary__subtitle">{{ selectedStationNamePreview }}</p>

      <div class="pp-chip-row">
        <span class="pp-chip pp-chip--accent">批量命名</span>
        <span class="pp-chip pp-chip--muted">英文处理与换乘工具</span>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">批量重命名</h3>
          <p class="pp-card__subtitle">使用模板批量命名。`{n}` 为序号。</p>
        </div>
      </div>

      <div class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">中文模板</span>
          <input v-model="stationBatchForm.zhTemplate" class="pp-input" placeholder="例如：站点 {n}" />
        </label>

        <label class="pp-field">
          <span class="pp-field__label">英文模板</span>
          <input v-model="stationBatchForm.enTemplate" class="pp-input" placeholder="For example: Station {n}" />
        </label>

        <label class="pp-field">
          <span class="pp-field__label">起始序号</span>
          <input v-model.number="stationBatchForm.startIndex" type="number" min="1" class="pp-input" />
        </label>
      </div>

      <div class="pp-card__footer">
        <div class="pp-row">
          <button class="pp-btn pp-btn--primary" type="button" :disabled="!canRenameBatch" @click="applyBatchStationRename">
            应用模板
          </button>
          <button class="pp-btn pp-btn--ghost" type="button" :disabled="!canRenameBatch" @click="resetBatchRename">
            清空模板
          </button>
        </div>
      </div>
    </section>

    <section class="pp-card pp-card--muted">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">英文处理与导出</h3>
          <p class="pp-card__subtitle">翻译英文名或复制站名。</p>
        </div>
      </div>

      <div class="pp-toolbar">
        <button
          class="pp-btn"
          type="button"
          :disabled="!selectedStationCount || store.isStationEnglishRetranslating"
          @click="translateNonNewStations"
        >
          {{ store.isStationEnglishRetranslating ? '翻译中...' : 'AI 翻译英文名' }}
        </button>
        <button class="pp-btn pp-btn--ghost" type="button" :disabled="!selectedStationCount" @click="copyStationNames">
          复制站名
        </button>
      </div>

      <div v-if="stationEnglishRetranslateProgress.total > 0" class="pp-progress">
        <div class="pp-progress-head">
          <span>{{ stationEnglishRetranslateProgress.message || '处理中...' }}</span>
          <strong>{{ Math.round(stationEnglishRetranslateProgress.percent || 0) }}%</strong>
        </div>
        <div class="pp-progress-track">
          <div
            class="pp-progress-fill"
            :style="{ width: `${Math.max(0, Math.min(100, stationEnglishRetranslateProgress.percent || 0))}%` }"
          />
        </div>
        <p class="pp-hint">{{ stationEnglishRetranslateProgress.done || 0 }} / {{ stationEnglishRetranslateProgress.total || 0 }}</p>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">换乘工具</h3>
          <p class="pp-card__subtitle">选中 2 个站点时可用。</p>
        </div>
      </div>

      <div class="pp-row">
        <button
          class="pp-btn"
          type="button"
          :disabled="!canEditSelectedManualTransfer || selectedManualTransferExists"
          @click="store.addManualTransferForSelectedStations()"
        >
          设为换乘
        </button>
        <button
          class="pp-btn pp-btn--ghost"
          type="button"
          :disabled="!canEditSelectedManualTransfer || !selectedManualTransferExists"
          @click="store.removeManualTransferForSelectedStations()"
        >
          取消换乘
        </button>
      </div>
    </section>

    <section class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除已选站点。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" @click="store.deleteSelectedStations()">
          删除已选站点
        </button>
      </div>
    </section>
  </div>
</template>
