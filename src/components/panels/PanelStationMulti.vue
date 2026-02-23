<script setup>
import { computed, inject, reactive } from 'vue'
import { NCollapse, NCollapseItem } from 'naive-ui'
import { NTooltip } from 'naive-ui'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const isNewStation = (s) => s.nameZh?.startsWith('新站 ')

const selectedStationCount = computed(() => store.selectedStationIds.length)

const selectedStationsInOrder = computed(() => {
  if (!store.project) return []
  const stationMap = new Map(store.project.stations.map((s) => [s.id, s]))
  return (store.selectedStationIds || []).map((id) => stationMap.get(id)).filter(Boolean)
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

function copyStationNames() {
  const stations = [...selectedStationsInOrder.value]
  const n = stations.length
  if (n > 1) {
    const coords = stations.map((s) => [s.lngLat?.[0] ?? 0, s.lngLat?.[1] ?? 0])
    const mx = coords.reduce((s, c) => s + c[0], 0) / n
    const my = coords.reduce((s, c) => s + c[1], 0) / n
    const sxx = coords.reduce((s, c) => s + (c[0] - mx) ** 2, 0)
    const syy = coords.reduce((s, c) => s + (c[1] - my) ** 2, 0)
    const sxy = coords.reduce((s, c) => s + (c[0] - mx) * (c[1] - my), 0)
    const diff = sxx - syy
    const dx = 2 * sxy
    const dy = diff + Math.sqrt(diff ** 2 + dx ** 2)
    const len = Math.sqrt(dx ** 2 + dy ** 2) || 1
    const [ex, ey] = [dx / len, dy / len]
    const flip = ey < -Math.abs(ex)
    const proj = new Map(stations.map((s, i) => [s.id, (coords[i][0] - mx) * ex + (coords[i][1] - my) * ey]))
    stations.sort((a, b) => flip ? proj.get(b.id) - proj.get(a.id) : proj.get(a.id) - proj.get(b.id))
  }
  
  const names = stations.map((s) => s.nameZh)
  navigator.clipboard.writeText(names.join(' '))
}

function translateNonNewStations() {
  const ids = selectedStationsInOrder.value.filter((s) => !isNewStation(s)).map((s) => s.id)
  if (!ids.length) return
  store.retranslateStationEnglishNamesByIdsWithAi(ids)
}
</script>

<template>
  <div class="panel-station-multi">
    <NCollapse :default-expanded-names="['export', 'translate', 'rename']">
    <NCollapseItem title="导出" name="export">
      <NTooltip placement="bottom">
        <template #trigger>
          <button class="pp-btn" :disabled="!selectedStationCount" @click="copyStationNames">复制站名</button>
        </template>
        复制选中站中文名（空格分隔）
      </NTooltip>
    </NCollapseItem>

    <NCollapseItem title="英文翻译" name="translate">
      <NTooltip placement="bottom">
        <template #trigger>
          <button
            class="pp-btn"
            :disabled="!selectedStationCount || store.isStationEnglishRetranslating"
            @click="translateNonNewStations"
          >
            {{ store.isStationEnglishRetranslating ? '翻译中...' : 'AI 翻译选中站英文' }}
          </button>
        </template>
        AI 翻译选中站英文名
      </NTooltip>
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
    </NCollapseItem>

    <NCollapseItem title="批量重命名" name="rename">
      <p class="pp-hint">使用模板批量重命名（`{n}` 为序号）。</p>
      <input v-model="stationBatchForm.zhTemplate" class="pp-input" placeholder="中文模板，例如：站点 {n}" />
      <input v-model="stationBatchForm.enTemplate" class="pp-input" placeholder="English template, e.g. Station {n}" />
      <label class="pp-label">起始序号</label>
      <input v-model.number="stationBatchForm.startIndex" type="number" min="1" class="pp-input" />
      <div class="pp-row">
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--primary" @click="applyBatchStationRename">批量重命名</button>
          </template>
          按模板批量重命名
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--danger" @click="store.deleteSelectedStations()">删除选中站点</button>
          </template>
          删除选中站点
        </NTooltip>
      </div>
    </NCollapseItem>

    <NCollapseItem title="换乘工具" name="transfer">
      <p class="pp-hint">选择 2 个站点后，可将其视作换乘（不改原线路拓扑）。</p>
      <div class="pp-row">
        <NTooltip placement="bottom">
          <template #trigger>
            <button
              class="pp-btn"
              :disabled="!canEditSelectedManualTransfer || selectedManualTransferExists"
              @click="store.addManualTransferForSelectedStations()"
            >
              设为换乘
            </button>
          </template>
          将选中两站设为换乘
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button
              class="pp-btn"
              :disabled="!canEditSelectedManualTransfer || !selectedManualTransferExists"
              @click="store.removeManualTransferForSelectedStations()"
            >
              取消换乘
            </button>
          </template>
          取消选中两站的换乘
        </NTooltip>
      </div>
    </NCollapseItem>
    </NCollapse>
  </div>
</template>

<style scoped>
.panel-station-multi {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
