<script setup>
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS } from '../../lib/lineStyles'
import { NTooltip } from 'naive-ui'

const store = useProjectStore()

const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)
const edgeReassignTargets = computed(() => store.project?.lines || [])


const edgeBatchForm = reactive({
  targetLineId: '',
  lineStyle: '',
  openingYear: '',
  phase: '',
})

const canApplyBatch = computed(
  () => selectedEdgeCount.value > 0 && (Boolean(edgeBatchForm.targetLineId) || Boolean(edgeBatchForm.lineStyle) || edgeBatchForm.openingYear !== '' || edgeBatchForm.phase !== ''),
)

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function applyBatch() {
  const edgeIds = store.selectedEdgeIds || []
  if (!edgeIds.length) return

  const patch = {}
  if (edgeBatchForm.targetLineId) patch.targetLineId = edgeBatchForm.targetLineId
  if (edgeBatchForm.lineStyle) patch.lineStyle = edgeBatchForm.lineStyle
  if (edgeBatchForm.openingYear !== '') {
    const parsed = Number(edgeBatchForm.openingYear)
    patch.openingYear = Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null
  }
  if (edgeBatchForm.phase !== '') patch.phase = edgeBatchForm.phase

  if (!Object.keys(patch).length) {
    store.statusText = '请先选择至少一个批量变更项'
    return
  }

  const { updatedCount } = store.updateEdgesBatch(edgeIds, patch)
  if (!updatedCount) {
    store.statusText = '所选线段未发生变化'
    return
  }
  store.statusText = `已批量更新 ${updatedCount} 条线段`
}

const latestOpeningYear = computed(() => {
  let max = -Infinity
  for (const e of store.project?.edges || []) {
    if (Number.isFinite(e.openingYear) && e.openingYear > max) max = e.openingYear
  }
  return max === -Infinity ? '' : max
})

function resetBatchForm() {
  edgeBatchForm.targetLineId = ''
  edgeBatchForm.lineStyle = ''
  edgeBatchForm.openingYear = latestOpeningYear.value
  edgeBatchForm.phase = ''
}

watch(
  [() => store.selectedEdgeIds, () => store.project?.lines],
  () => { resetBatchForm() },
  { immediate: true },
)
</script>

<template>
  <div class="panel-edge-multi">
    <div class="pp-context">
      <div class="pp-kv">
        <span class="pp-kv-label">已选</span>
        <span class="pp-kv-value">{{ selectedEdgeCount }} 条线段</span>
      </div>
    </div>

    <div class="pp-fields">
      <select v-model="edgeBatchForm.targetLineId" class="pp-select" :disabled="!edgeReassignTargets.length">
        <option value="">目标线路（保持不变）</option>
        <option v-for="line in edgeReassignTargets" :key="`ebm_line_${line.id}`" :value="line.id">
          {{ displayLineName(line) }}
        </option>
      </select>
      <select v-model="edgeBatchForm.lineStyle" class="pp-select">
        <option value="">线型（保持不变）</option>
        <option v-for="s in LINE_STYLE_OPTIONS" :key="`ebm_style_${s.id}`" :value="s.id">{{ s.label }}</option>
      </select>
      <input v-model="edgeBatchForm.openingYear" type="number" class="pp-input" placeholder="开通年份" min="1900" max="2100" step="1" />
      <input v-model="edgeBatchForm.phase" type="text" class="pp-input" placeholder="分期标签，如：一期" />
    </div>

    <div class="pp-actions">
      <div class="pp-row" style="margin-top:0">
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--primary" style="flex:1" :disabled="!canApplyBatch" @click="applyBatch">应用</button>
          </template>
          应用批量属性
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn" @click="resetBatchForm">重置</button>
          </template>
          重置
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <button class="pp-btn pp-btn--danger" @click="store.deleteSelectedEdge()">删除</button>
          </template>
          删除选中线段
        </NTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-edge-multi {
  display: flex;
  flex-direction: column;
}
</style>
