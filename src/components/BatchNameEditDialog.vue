<script setup>
import { ref, computed, watch } from 'vue'
import { NModal } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useProjectStore()
const searchQuery = ref('')

const stations = computed(() => {
  if (!store.project?.stations) return []
  return store.project.stations.map((s) => ({
    id: s.id,
    nameZh: s.nameZh,
    nameEn: s.nameEn,
  }))
})

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return stations.value
  return stations.value.filter(
    (s) => s.nameZh.toLowerCase().includes(q) || s.nameEn.toLowerCase().includes(q),
  )
})

// Local editable copy
const edits = ref(new Map())

watch(
  () => props.visible,
  (v) => {
    if (v) {
      edits.value = new Map()
      searchQuery.value = ''
    }
  },
)

function getZh(s) {
  return edits.value.get(s.id)?.nameZh ?? s.nameZh
}
function getEn(s) {
  return edits.value.get(s.id)?.nameEn ?? s.nameEn
}

function onZhInput(s, val) {
  const cur = edits.value.get(s.id) || {}
  edits.value.set(s.id, { ...cur, nameZh: val })
}
function onEnInput(s, val) {
  const cur = edits.value.get(s.id) || {}
  edits.value.set(s.id, { ...cur, nameEn: val })
}

const changeCount = computed(() => {
  let count = 0
  for (const s of stations.value) {
    const e = edits.value.get(s.id)
    if (!e) continue
    if (e.nameZh !== undefined && e.nameZh !== s.nameZh) count++
    else if (e.nameEn !== undefined && e.nameEn !== s.nameEn) count++
  }
  return count
})

function doSave() {
  const updates = []
  for (const s of stations.value) {
    const e = edits.value.get(s.id)
    if (!e) continue
    const zh = e.nameZh !== undefined ? e.nameZh : s.nameZh
    const en = e.nameEn !== undefined ? e.nameEn : s.nameEn
    if (zh !== s.nameZh || en !== s.nameEn) {
      updates.push({ stationId: s.id, nameZh: zh, nameEn: en })
    }
  }
  if (updates.length) {
    store.updateStationNamesBatch(updates, { reason: `批量编辑站名: ${updates.length} 站` })
  }
  emit('close')
}

function doClose() {
  emit('close')
}
</script>

<template>
  <NModal :show="visible" preset="card" title="批量编辑站名" style="width:720px;max-width:calc(100vw - 32px)" @close="doClose" @mask-click="doClose">
    <template #header-extra>
      <input
        v-model="searchQuery"
        class="bne-dialog__search"
        type="text"
        placeholder="搜索站名..."
      />
    </template>

    <div class="bne-dialog__body">
            <div v-if="!stations.length" class="bne-dialog__empty">暂无站点</div>
            <div v-else-if="!filtered.length" class="bne-dialog__empty">无匹配站点</div>
            <table v-else class="bne-table">
              <thead>
                <tr>
                  <th class="bne-table__th bne-table__th--idx">#</th>
                  <th class="bne-table__th">中文名</th>
                  <th class="bne-table__th">英文名</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(s, i) in filtered" :key="s.id">
                  <td class="bne-table__td bne-table__td--idx">{{ i + 1 }}</td>
                  <td class="bne-table__td">
                    <input
                      class="bne-table__input"
                      :value="getZh(s)"
                      @input="onZhInput(s, $event.target.value)"
                    />
                  </td>
                  <td class="bne-table__td">
                    <input
                      class="bne-table__input"
                      :value="getEn(s)"
                      @input="onEnInput(s, $event.target.value)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

    <template #footer>
      <div class="bne-dialog__footer">
        <span class="bne-dialog__hint">共 {{ stations.length }} 站，已修改 {{ changeCount }} 项</span>
        <button class="bne-dialog__btn" type="button" @click="doClose">取消</button>
        <button
          class="bne-dialog__btn bne-dialog__btn--primary"
          type="button"
          :disabled="!changeCount"
          @click="doSave"
        >
          保存
        </button>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.bne-dialog__search {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--toolbar-input-border);
  border-radius: 6px;
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 13px;
  outline: none;
}

.bne-dialog__search:focus {
  border-color: var(--ark-pink);
}

.bne-dialog__body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  max-height: 60vh;
}

.bne-dialog__empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--toolbar-muted);
  font-size: 13px;
}

.bne-table {
  width: 100%;
  border-collapse: collapse;
}

.bne-table__th {
  position: sticky;
  top: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--toolbar-muted);
  text-align: left;
  background: var(--toolbar-input-bg);
  border-bottom: 1px solid var(--toolbar-divider);
}

.bne-table__th--idx {
  width: 40px;
  text-align: center;
}

.bne-table__td {
  padding: 3px 4px;
  border-bottom: 1px solid var(--toolbar-divider);
}

.bne-table__td--idx {
  text-align: center;
  font-size: 11px;
  color: var(--toolbar-muted);
  width: 40px;
}

.bne-table__input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--toolbar-text);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.bne-table__input:focus {
  border-color: var(--ark-pink);
  background: var(--toolbar-input-bg);
}

.bne-dialog__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--toolbar-divider);
}

.bne-dialog__hint {
  flex: 1;
  font-size: 12px;
  color: var(--toolbar-muted);
}

.bne-dialog__btn {
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

.bne-dialog__btn:hover {
  border-color: var(--toolbar-button-hover-border);
}

.bne-dialog__btn--primary {
  background: var(--ark-pink);
  border-color: var(--ark-pink);
  color: #fff;
}

.bne-dialog__btn--primary:hover:not(:disabled) {
  box-shadow: 0 2px 8px var(--ark-pink-glow);
}

.bne-dialog__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
