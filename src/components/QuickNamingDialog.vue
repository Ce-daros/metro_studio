<script setup>
import { ref, computed, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'
import { getOrderedStationIds } from '../lib/lineGraph'
import { getDisplayLineName } from '../lib/lineNaming'
import { startQuickNaming } from '../composables/useQuickNaming'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useProjectStore()

const selectedLineId = ref('')
const selectedStartId = ref('')
const selectedEndId = ref('')

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

function doClose() {
  emit('close')
}
</script>

<template>
  <NModal :show="visible" preset="card" title="快速站点命名" style="width:420px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <div class="qn-dialog__body">
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
      <div v-if="!stationOptions.length" class="qn-hint">该线路暂无站点</div>
    </div>

    <template #footer>
      <div class="qn-footer">
        <button class="qn-btn" type="button" @click="doClose">取消</button>
        <button class="qn-btn qn-btn--primary" type="button" :disabled="!stationOptions.length" @click="doStart">开始</button>
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

.qn-hint {
  padding: 12px 0;
  text-align: center;
  color: var(--toolbar-muted);
  font-size: 13px;
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
