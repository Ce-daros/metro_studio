<script setup>
import { ref, computed, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { getOrderedStationIds } from '../lib/lineGraph'
import { getDisplayLineName } from '../lib/lineNaming'
import { startQuickNaming } from '../composables/useSequentialStationReview'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useProjectStore()

const selectedLineId = ref('')
const selectedStartId = ref('')
const selectedEndId = ref('')

const DEFAULT_ZH_NAME_PATTERN = /^新站\s+\d+$/

const lines = computed(() => store.project?.lines || [])

const orderedStationIds = computed(() => {
  const line = lines.value.find((l) => l.id === selectedLineId.value)
  if (!line) return []
  const edgeMap = new Map(store.project.edges.map((e) => [e.id, e]))
  return getOrderedStationIds(line, edgeMap)
})

const stationOptions = computed(() => {
  const stationMap = new Map(store.project?.stations?.map((s) => [s.id, s]) || [])
  return orderedStationIds.value.map((id) => {
    const s = stationMap.get(id)
    return { id, name: s?.nameZh || s?.nameEn || '未命名' }
  })
})

const selectedRangeStationIds = computed(() => {
  const startIdx = orderedStationIds.value.indexOf(selectedStartId.value)
  const endIdx = orderedStationIds.value.indexOf(selectedEndId.value)
  if (startIdx === -1 || endIdx === -1) return []
  const lo = Math.min(startIdx, endIdx)
  const hi = Math.max(startIdx, endIdx)
  return orderedStationIds.value.slice(lo, hi + 1)
})

const defaultNamedStationCount = computed(() => {
  const stationMap = new Map(store.project?.stations?.map((station) => [station.id, station]) || [])
  return selectedRangeStationIds.value.filter((stationId) => {
    const station = stationMap.get(stationId)
    return DEFAULT_ZH_NAME_PATTERN.test(String(station?.nameZh || '').trim())
  }).length
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
  startQuickNaming(selectedLineId.value, selectedStartId.value, selectedEndId.value)
  emit('close')
}

function startDefaultNamedStationsOnly() {
  if (!selectedRangeStationIds.value.length) return
  startQuickNaming(selectedLineId.value, selectedStartId.value, selectedEndId.value, {
    filterStations: (stationIds, innerStore) => {
      const stationMap = new Map(innerStore.project?.stations?.map((station) => [station.id, station]) || [])
      return stationIds.filter((stationId) => {
        const station = stationMap.get(stationId)
        return DEFAULT_ZH_NAME_PATTERN.test(String(station?.nameZh || '').trim())
      })
    },
    emptyFilterMessage: '该区间没有仍使用默认中文名（新站 X）的站点',
  })
  emit('close')
}

function doClose() {
  emit('close')
}
</script>

<template>
  <NModal :show="visible" preset="card" title="快速站点命名" style="width:420px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <div class="qn-dialog__body">
      <p class="qn-hint">可以按区间逐站命名，也可以一键进入“只处理默认中文名 `新站 X`”的快速命名流。</p>
      <div class="qn-field">
        <label class="qn-label">线路</label>
        <select v-model="selectedLineId" class="qn-select">
          <option v-for="line in lines" :key="line.id" :value="line.id">{{ displayLine(line) }}</option>
        </select>
      </div>
      <div class="qn-field">
        <label class="qn-label">起始站</label>
        <select v-model="selectedStartId" class="qn-select">
          <option v-for="s in stationOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div class="qn-field">
        <label class="qn-label">结束站</label>
        <select v-model="selectedEndId" class="qn-select">
          <option v-for="s in stationOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div v-if="selectedRangeStationIds.length" class="qn-count">
        当前区间: {{ selectedRangeStationIds.length }} 个站点
      </div>
      <div v-if="selectedRangeStationIds.length" class="qn-count">
        默认中文名: {{ defaultNamedStationCount }} 个站点
      </div>
      <div v-if="!stationOptions.length" class="qn-hint">该线路暂无站点</div>
    </div>

    <template #footer>
      <div class="qn-footer">
        <button class="qn-btn" type="button" @click="doClose">取消</button>
        <button class="qn-btn" type="button" :disabled="!defaultNamedStationCount" @click="startDefaultNamedStationsOnly">
          只命名默认站 ({{ defaultNamedStationCount }})
        </button>
        <button class="qn-btn qn-btn--primary" type="button" :disabled="!selectedRangeStationIds.length" @click="doStart">
          开始逐站命名
        </button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.qn-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qn-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qn-hint {
  padding: 8px 12px;
  background: rgba(255, 45, 120, 0.08);
  border: 1px solid rgba(255, 45, 120, 0.2);
  border-radius: 6px;
  color: var(--ark-pink);
  font-size: 12px;
  line-height: 1.5;
}

.qn-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--toolbar-muted);
}

.qn-select {
  padding: 7px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 13px;
  outline: none;
}

.qn-select:focus {
  border-color: var(--ark-pink);
}

.qn-count {
  padding: 8px 12px;
  background: rgba(255, 45, 120, 0.1);
  border-radius: 6px;
  color: var(--ark-pink);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.qn-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.qn-btn {
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

.qn-btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.qn-btn--primary {
  background: var(--ark-pink);
  border-color: var(--ark-pink);
  color: #fff;
}

.qn-btn--primary:hover:not(:disabled) {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

.qn-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
