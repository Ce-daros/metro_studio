<script setup>
import { computed, reactive, watch } from 'vue'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS } from '../../lib/lineStyles'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const selectedEdgeCount = computed(() => store.selectedEdgeIds.length)
const edgeReassignTargets = computed(() => store.project?.lines || [])

const selectedEdges = computed(() => {
  if (!store.project) return []
  const edgeMap = new Map(store.project.edges.map((edge) => [edge.id, edge]))
  return (store.selectedEdgeIds || []).map((id) => edgeMap.get(id)).filter(Boolean)
})

const involvedLines = computed(() => {
  if (!store.project) return []
  const lineMap = new Map(store.project.lines.map((line) => [line.id, line]))
  const lineIds = new Set(selectedEdges.value.flatMap((edge) => edge.sharedByLineIds || []))
  return [...lineIds].map((lineId) => lineMap.get(lineId)).filter(Boolean)
})

const edgeBatchForm = reactive({
  targetLineId: '',
  lineStyle: '',
  curveMode: 'keep',
  openingYear: '',
  phase: '',
})

const canApplyBatch = computed(() => {
  return selectedEdgeCount.value > 0 && (
    Boolean(edgeBatchForm.targetLineId) ||
    Boolean(edgeBatchForm.lineStyle) ||
    edgeBatchForm.curveMode !== 'keep' ||
    edgeBatchForm.openingYear !== '' ||
    edgeBatchForm.phase !== ''
  )
})

watch(
  [() => store.selectedEdgeIds, () => store.project?.lines],
  () => {
    edgeBatchForm.targetLineId = ''
    edgeBatchForm.lineStyle = ''
    edgeBatchForm.curveMode = 'keep'
    edgeBatchForm.openingYear = ''
    edgeBatchForm.phase = ''
  },
  { immediate: true },
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
  if (edgeBatchForm.curveMode === 'curved') patch.isCurved = true
  if (edgeBatchForm.curveMode === 'straight') patch.isCurved = false

  if (edgeBatchForm.openingYear !== '') {
    const parsed = Number(edgeBatchForm.openingYear)
    patch.openingYear = Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null
  }

  if (edgeBatchForm.phase !== '') {
    patch.phase = edgeBatchForm.phase.trim() || null
  }

  if (!Object.keys(patch).length) {
    store.statusText = '请先填写至少一个批量变更项'
    return
  }

  const { updatedCount } = store.updateEdgesBatch(edgeIds, patch)
  if (!updatedCount) {
    store.statusText = '所选线段未发生变化'
  }
}

function resetBatchForm() {
  edgeBatchForm.targetLineId = ''
  edgeBatchForm.lineStyle = ''
  edgeBatchForm.curveMode = 'keep'
  edgeBatchForm.openingYear = ''
  edgeBatchForm.phase = ''
}
</script>

<template>
  <div class="pp-inspector panel-edge-multi">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Batch Edge Inspector</span>
      <h2 class="pp-summary__title">{{ selectedEdgeCount }} 条线段</h2>
      <p class="pp-summary__subtitle">批量编辑已选线段。</p>

      <div class="pp-chip-row">
        <span class="pp-chip pp-chip--accent">批量操作</span>
        <span class="pp-chip pp-chip--muted">{{ involvedLines.length }} 条涉及线路</span>
      </div>

      <div class="pp-chip-row" v-if="involvedLines.length">
        <span
          v-for="line in involvedLines"
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
          <h3 class="pp-card__title">批量属性</h3>
          <p class="pp-card__subtitle">留空表示不修改。</p>
        </div>
      </div>

      <div class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">迁移到线路</span>
          <select v-model="edgeBatchForm.targetLineId" class="pp-select" :disabled="!edgeReassignTargets.length">
            <option value="">不修改所属线路</option>
            <option v-for="line in edgeReassignTargets" :key="`edge-batch-line-${line.id}`" :value="line.id">
              {{ displayLineName(line) }}
            </option>
          </select>
        </label>

        <div class="pp-split">
          <label class="pp-field">
            <span class="pp-field__label">线型</span>
            <select v-model="edgeBatchForm.lineStyle" class="pp-select">
              <option value="">不修改线型</option>
              <option v-for="style in LINE_STYLE_OPTIONS" :key="`edge-batch-style-${style.id}`" :value="style.id">
                {{ style.label }}
              </option>
            </select>
          </label>

          <label class="pp-field">
            <span class="pp-field__label">曲线状态</span>
            <select v-model="edgeBatchForm.curveMode" class="pp-select">
              <option value="keep">保持原状</option>
              <option value="curved">统一设为曲线</option>
              <option value="straight">统一设为直线</option>
            </select>
          </label>
        </div>

        <div class="pp-split">
          <label class="pp-field">
            <span class="pp-field__label">开通年份</span>
            <input
              v-model="edgeBatchForm.openingYear"
              type="number"
              class="pp-input"
              min="1900"
              max="2100"
              step="1"
              placeholder="留空表示不修改"
            />
          </label>

          <label class="pp-field">
            <span class="pp-field__label">分期标签</span>
            <input
              v-model="edgeBatchForm.phase"
              type="text"
              class="pp-input"
              placeholder="留空表示不修改"
            />
          </label>
        </div>
      </div>

      <div class="pp-card__footer">
        <div class="pp-row">
          <button class="pp-btn pp-btn--primary" type="button" :disabled="!canApplyBatch" @click="applyBatch">
            应用到 {{ selectedEdgeCount }} 条线段
          </button>
          <button class="pp-btn pp-btn--ghost" type="button" :disabled="!canApplyBatch" @click="resetBatchForm">
            清空批量项
          </button>
        </div>
      </div>
    </section>

    <section class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除已选线段。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" @click="store.deleteSelectedEdge()">
          删除已选线段
        </button>
      </div>
    </section>
  </div>
</template>
