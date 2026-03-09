<script setup>
import { ref, computed, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { getOrderedStationIds } from '../lib/lineGraph'
import { getDisplayLineName } from '../lib/lineNaming'
import { startEnglishReview } from '../composables/useSequentialStationReview'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useProjectStore()

const selectedLineId = ref('')
const selectedStartId = ref('')
const selectedEndId = ref('')

const DEFAULT_EN_NAME_PATTERN = /^Station\s+\d+$/i

const lines = computed(() => store.project?.lines || [])

const orderedStationIds = computed(() => {
  const line = lines.value.find((l) => l.id === selectedLineId.value)
  if (!line) return []
  const edgeMap = new Map(store.project.edges.map((e) => [e.id, e]))
  return getOrderedStationIds(line, edgeMap)
})

// 计算需要审查的站点数量
const reviewCount = computed(() => {
  const stationMap = new Map(store.project?.stations?.map((s) => [s.id, s]) || [])
  return selectedRangeStationIds.value.filter((id) => {
    const station = stationMap.get(id)
    if (!station) return false
    if (station.nameEnFixed) return false
    const en = String(station.nameEn || '').trim()
    return !!en
  }).length
})

const stationOptions = computed(() => {
  const stationMap = new Map(store.project?.stations?.map((s) => [s.id, s]) || [])
  return orderedStationIds.value.map((id) => {
    const s = stationMap.get(id)
    const hasEn = s?.nameEn && !s.nameEnFixed
    return { id, name: s?.nameZh || s?.nameEn || '未命名', hasEn }
  })
})

const defaultEnglishStationIds = computed(() => {
  const stationMap = new Map(store.project?.stations?.map((station) => [station.id, station]) || [])
  return selectedRangeStationIds.value.filter((stationId) => {
    const station = stationMap.get(stationId)
    if (!station) return false
    if (station.nameEnFixed) return false
    return DEFAULT_EN_NAME_PATTERN.test(String(station.nameEn || '').trim())
  })
})

const projectDefaultEnglishStationIds = computed(() => {
  return (store.project?.stations || [])
    .filter((station) => !station?.nameEnFixed && DEFAULT_EN_NAME_PATTERN.test(String(station?.nameEn || '').trim()))
    .map((station) => station.id)
})

const selectedRangeStationIds = computed(() => {
  const startIdx = orderedStationIds.value.indexOf(selectedStartId.value)
  const endIdx = orderedStationIds.value.indexOf(selectedEndId.value)
  if (startIdx === -1 || endIdx === -1) return []
  const lo = Math.min(startIdx, endIdx)
  const hi = Math.max(startIdx, endIdx)
  return orderedStationIds.value.slice(lo, hi + 1)
})

watch(() => props.visible, (v) => {
  if (v) {
    selectedLineId.value = store.activeLineId || lines.value[0]?.id || ''
  }
})

watch(selectedLineId, () => {
  const ids = orderedStationIds.value
  selectedStartId.value = ids[0] || ''
  selectedEndId.value = ids[ids.length - 1] || ''
})

function displayLine(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function doStart() {
  if (!selectedLineId.value || !selectedStartId.value || !selectedEndId.value) return
  startEnglishReview(selectedLineId.value, selectedStartId.value, selectedEndId.value)
  emit('close')
}

async function translateDefaultEnglishStations() {
  if (!defaultEnglishStationIds.value.length || store.isStationEnglishRetranslating) return
  try {
    await store.retranslateStationEnglishNamesByIdsWithAi(defaultEnglishStationIds.value)
    emit('close')
  } catch {
    // Keep the dialog open so the user can retry or adjust the range.
  }
}

async function translateAllDefaultEnglishStations() {
  if (!projectDefaultEnglishStationIds.value.length || store.isStationEnglishRetranslating) return
  try {
    await store.retranslateStationEnglishNamesByIdsWithAi(projectDefaultEnglishStationIds.value)
    emit('close')
  } catch {
    // Keep the dialog open so the user can retry or adjust the range.
  }
}

function doClose() {
  emit('close')
}
</script>

<template>
  <NModal :show="visible" preset="card" title="批量审查AI英文站名" style="width:420px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <div class="er-dialog__body">
      <p class="er-hint">选择需要处理的线路区间。可以 Enter 逐站审查，也可以一键翻译所有仍使用默认英文名 `Station X` 且未锁定的站。</p>
      <div class="er-field">
        <label class="er-label">线路</label>
        <select v-model="selectedLineId" class="er-select">
          <option v-for="line in lines" :key="line.id" :value="line.id">{{ displayLine(line) }}</option>
        </select>
      </div>
      <div class="er-field">
        <label class="er-label">起始站</label>
        <select v-model="selectedStartId" class="er-select">
          <option v-for="s in stationOptions" :key="s.id" :value="s.id">
            {{ s.name }}{{ s.hasEn ? ' ✍️' : '' }}
          </option>
        </select>
      </div>
      <div class="er-field">
        <label class="er-label">结束站</label>
        <select v-model="selectedEndId" class="er-select">
          <option v-for="s in stationOptions" :key="s.id" :value="s.id">
            {{ s.name }}{{ s.hasEn ? ' ✍️' : '' }}
          </option>
        </select>
      </div>
      <div v-if="selectedRangeStationIds.length" class="er-count">
        当前区间: {{ selectedRangeStationIds.length }} 个站点
      </div>
      <div v-if="stationOptions.length" class="er-count">
        需审查: {{ reviewCount }} 个站点
      </div>
      <div v-if="stationOptions.length" class="er-count">
        默认英文占位名: {{ defaultEnglishStationIds.length }} 个站点
      </div>
      <div class="er-count">
        全图默认英文占位名: {{ projectDefaultEnglishStationIds.length }} 个站点
      </div>
      <div v-if="!stationOptions.length" class="er-hint">该线路暂无站点</div>
    </div>

    <template #footer>
      <div class="er-footer">
        <button class="er-btn" type="button" @click="doClose">取消</button>
        <button
          class="er-btn"
          type="button"
          :disabled="!projectDefaultEnglishStationIds.length || store.isStationEnglishRetranslating"
          @click="translateAllDefaultEnglishStations"
        >
          {{ store.isStationEnglishRetranslating ? '翻译中...' : `翻译全图默认英文站 (${projectDefaultEnglishStationIds.length})` }}
        </button>
        <button
          class="er-btn"
          type="button"
          :disabled="!defaultEnglishStationIds.length || store.isStationEnglishRetranslating"
          @click="translateDefaultEnglishStations"
        >
          {{ store.isStationEnglishRetranslating ? '翻译中...' : `翻译默认英文站 (${defaultEnglishStationIds.length})` }}
        </button>
        <button class="er-btn er-btn--primary" type="button" :disabled="!reviewCount" @click="doStart">
          开始审查 ({{ reviewCount }})
        </button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.er-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.er-hint {
  padding: 8px 12px;
  background: rgba(255, 45, 120, 0.08);
  border: 1px solid rgba(255, 45, 120, 0.2);
  border-radius: 6px;
  color: var(--ark-pink);
  font-size: 12px;
  line-height: 1.5;
}

.er-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.er-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--toolbar-muted);
}

.er-select {
  padding: 7px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 13px;
  outline: none;
}

.er-select:focus {
  border-color: var(--ark-pink);
}

.er-count {
  padding: 8px 12px;
  background: rgba(255, 45, 120, 0.1);
  border-radius: 6px;
  color: var(--ark-pink);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.er-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.er-btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--toolbar-button-border);
  background: var(--toolbar-button-bg);
  color: var(--toolbar-button-text);
  transition: all var(--transition-normal);
}

.er-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.er-btn--primary {
  background: var(--ark-pink);
  border-color: var(--ark-pink);
  color: #fff;
}

.er-btn--primary:hover:not(:disabled) {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

.er-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
