<script setup>
import { computed, reactive, watch } from 'vue'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS, normalizeLineStyle } from '../../lib/lineStyles'
import { useProjectStore } from '../../stores/projectStore'

const store = useProjectStore()

const activeLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find((line) => line.id === store.activeLineId) || null
})

const lineForm = reactive({
  nameZh: '',
  nameEn: '',
  color: '#005BBB',
  status: 'open',
  style: 'solid',
})

const projectStats = computed(() => {
  if (!store.project) {
    return { lines: 0, stations: 0, edges: 0 }
  }
  return {
    lines: store.project.lines.length,
    stations: store.project.stations.length,
    edges: store.project.edges.length,
  }
})

const lineOptions = computed(() => {
  return (store.project?.lines || []).map((line) => ({
    id: line.id,
    color: line.color || '#005BBB',
    label: displayLineName(line) || line.id,
    edgeCount: line.edgeIds?.length || 0,
  }))
})

const hasUnsavedLineChanges = computed(() => {
  if (!activeLine.value) return false
  return (
    lineForm.nameZh !== (activeLine.value.nameZh || '') ||
    lineForm.nameEn !== (activeLine.value.nameEn || '') ||
    lineForm.color !== (activeLine.value.color || '#005BBB') ||
    lineForm.status !== (activeLine.value.status || 'open') ||
    lineForm.style !== normalizeLineStyle(activeLine.value.style)
  )
})

watch(
  activeLine,
  (line) => {
    lineForm.nameZh = line?.nameZh || ''
    lineForm.nameEn = line?.nameEn || ''
    lineForm.color = line?.color || '#005BBB'
    lineForm.status = line?.status || 'open'
    lineForm.style = normalizeLineStyle(line?.style)
  },
  { immediate: true },
)

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function addLine() {
  store.addLine({})
}

function handleActiveLineChange(event) {
  const nextLineId = String(event.target.value || '')
  if (!nextLineId) return
  store.setActiveLine(nextLineId)
}

function applyLineChanges() {
  if (!activeLine.value) return
  store.updateLine(activeLine.value.id, {
    nameZh: lineForm.nameZh,
    nameEn: lineForm.nameEn,
    color: lineForm.color,
    status: lineForm.status,
    style: lineForm.style,
  })
}

function resetLineForm() {
  if (!activeLine.value) return
  lineForm.nameZh = activeLine.value.nameZh || ''
  lineForm.nameEn = activeLine.value.nameEn || ''
  lineForm.color = activeLine.value.color || '#005BBB'
  lineForm.status = activeLine.value.status || 'open'
  lineForm.style = normalizeLineStyle(activeLine.value.style)
}

function deleteActiveLine() {
  if (!activeLine.value) return
  store.deleteLine(activeLine.value.id)
}
</script>

<template>
  <div class="pp-inspector panel-no-sel">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Project Workspace</span>
      <h2 class="pp-summary__title">工程侧栏</h2>
      <p class="pp-summary__subtitle">未选中对象时，在这里管理线路与工程信息。</p>

      <div class="pp-stat-grid">
        <div class="pp-stat">
          <span class="pp-stat__label">线路</span>
          <span class="pp-stat__value">{{ projectStats.lines }}</span>
        </div>
        <div class="pp-stat">
          <span class="pp-stat__label">站点</span>
          <span class="pp-stat__value">{{ projectStats.stations }}</span>
        </div>
        <div class="pp-stat">
          <span class="pp-stat__label">线段</span>
          <span class="pp-stat__value">{{ projectStats.edges }}</span>
        </div>
        <div class="pp-stat">
          <span class="pp-stat__label">当前线路</span>
          <span class="pp-stat__value">{{ activeLine ? displayLineName(activeLine) : '未选择' }}</span>
        </div>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">线路库</h3>
          <p class="pp-card__subtitle">在这里查看和切换线路，下方编辑当前线路。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--primary" type="button" @click="addLine">
          新增线路
        </button>
      </div>

      <div v-if="lineOptions.length" class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">选择线路</span>
          <div class="panel-no-sel__line-select-wrap">
            <span
              v-if="activeLine"
              class="panel-no-sel__line-select-swatch"
              :style="{ backgroundColor: activeLine.color || '#005BBB' }"
            />
            <select
              class="pp-select panel-no-sel__line-select"
              :value="store.activeLineId || ''"
              @change="handleActiveLineChange"
            >
              <option v-for="line in lineOptions" :key="line.id" :value="line.id">
                {{ line.label }} · {{ line.edgeCount }} 段
              </option>
            </select>
          </div>
          <p class="pp-field__help">在线路库中快速切换当前线路，下方同步显示并编辑该线路属性。</p>
        </label>
      </div>
      <div v-else class="pp-empty">当前还没有线路。</div>
    </section>

    <section v-if="activeLine" class="pp-card pp-card--muted">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">当前线路</h3>
          <p class="pp-card__subtitle">编辑当前线路。</p>
        </div>
        <span class="pp-chip" :class="hasUnsavedLineChanges ? 'pp-chip--accent' : 'pp-chip--muted'">
          {{ hasUnsavedLineChanges ? '已修改' : '已同步' }}
        </span>
      </div>

      <div class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">中文线路名</span>
          <input v-model="lineForm.nameZh" class="pp-input" placeholder="例如：2号线" />
        </label>

        <label class="pp-field">
          <span class="pp-field__label">英文线路名</span>
          <input v-model="lineForm.nameEn" class="pp-input" placeholder="For example: Line 2" />
        </label>

        <div class="pp-split">
          <label class="pp-field">
            <span class="pp-field__label">线路状态</span>
            <select v-model="lineForm.status" class="pp-select">
              <option value="open">运营</option>
              <option value="construction">在建</option>
              <option value="proposed">规划</option>
            </select>
          </label>

          <label class="pp-field">
            <span class="pp-field__label">默认线型</span>
            <select v-model="lineForm.style" class="pp-select">
              <option v-for="style in LINE_STYLE_OPTIONS" :key="style.id" :value="style.id">
                {{ style.label }}
              </option>
            </select>
          </label>
        </div>

        <label class="pp-field">
          <span class="pp-field__label">线路色</span>
          <input v-model="lineForm.color" type="color" class="pp-color" />
        </label>
      </div>

      <div class="pp-card__footer">
        <div class="pp-row">
          <button class="pp-btn pp-btn--primary" type="button" :disabled="!hasUnsavedLineChanges" @click="applyLineChanges">
            保存线路
          </button>
          <button class="pp-btn pp-btn--ghost" type="button" :disabled="!hasUnsavedLineChanges" @click="resetLineForm">
            放弃修改
          </button>
        </div>
      </div>
    </section>

    <section v-if="activeLine" class="pp-card pp-card--danger">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">危险操作</h3>
          <p class="pp-card__subtitle">删除当前线路。</p>
        </div>
      </div>

      <div class="pp-row">
        <button class="pp-btn pp-btn--danger" type="button" @click="deleteActiveLine">
          删除当前线路
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel-no-sel__line-select-wrap {
  position: relative;
}

.panel-no-sel__line-select-swatch {
  position: absolute;
  left: 12px;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  transform: translateY(-50%);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28);
}

.panel-no-sel__line-select {
  padding-left: 30px;
}
</style>
