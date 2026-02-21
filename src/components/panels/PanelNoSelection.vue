<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import { NCollapse, NCollapseItem } from 'naive-ui'
import IconBase from '../IconBase.vue'
import { NTooltip } from 'naive-ui'
import { useProjectStore } from '../../stores/projectStore'
import { getDisplayLineName } from '../../lib/lineNaming'
import { LINE_STYLE_OPTIONS, normalizeLineStyle } from '../../lib/lineStyles'
import { isTrial, TRIAL_LIMITS } from '../../composables/useLicense'

const store = useProjectStore()
const showUpgradeDialog = inject('showUpgradeDialog', () => {})

const activeLine = computed(() => {
  if (!store.project || !store.activeLineId) return null
  return store.project.lines.find((l) => l.id === store.activeLineId) || null
})

const lineForm = reactive({
  nameZh: '',
  nameEn: '',
  color: '#005BBB',
  status: 'open',
  style: 'solid',
})

function displayLineName(line) {
  return getDisplayLineName(line, 'zh') || line?.nameZh || ''
}

function addLine() {
  if (isTrial.value && store.project?.lines?.length >= TRIAL_LIMITS.maxLines) {
    showUpgradeDialog(`试用版最多创建 ${TRIAL_LIMITS.maxLines} 条线路，请激活正式版以解除限制。`)
    return
  }
  store.addLine({})
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

function deleteActiveLine() {
  if (!activeLine.value) return
  store.deleteLine(activeLine.value.id)
}

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
</script>

<template>
  <div class="panel-no-sel">
    <NCollapse :default-expanded-names="['line-mgmt']">
    <NCollapseItem title="线路管理" name="line-mgmt">
      <NTooltip placement="bottom">
        <template #trigger>
          <button class="add-line-btn" @click="addLine">
            <IconBase name="plus-circle" :size="14" />
            新增线路
          </button>
        </template>
        新增线路
      </NTooltip>
      <ul class="line-list">
        <li v-for="line in store.project?.lines || []" :key="line.id">
          <button
            class="line-item"
            :class="{ active: store.activeLineId === line.id }"
            @click="store.setActiveLine(line.id)"
          >
            <span class="line-swatch" :style="{ backgroundColor: line.color }" />
            <span>{{ displayLineName(line) }}</span>
          </button>
        </li>
      </ul>

      <template v-if="activeLine">
        <div class="pp-divider" />
        <p class="pp-hint">当前线路: {{ displayLineName(activeLine) }}</p>
        <input v-model="lineForm.nameZh" class="pp-input" placeholder="中文线路名" />
        <input v-model="lineForm.nameEn" class="pp-input" placeholder="English line name" />
        <input v-model="lineForm.color" type="color" class="pp-color" />
        <div class="pp-row">
          <select v-model="lineForm.status" class="pp-select">
            <option value="open">运营</option>
            <option value="construction">在建</option>
            <option value="proposed">规划</option>
          </select>
          <select v-model="lineForm.style" class="pp-select">
            <option v-for="s in LINE_STYLE_OPTIONS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </div>
        <div class="pp-row">
          <NTooltip placement="bottom">
            <template #trigger>
              <button class="pp-btn pp-btn--primary" @click="applyLineChanges">保存线路</button>
            </template>
            保存线路属性
          </NTooltip>
          <NTooltip placement="bottom">
            <template #trigger>
              <button class="pp-btn pp-btn--danger" @click="deleteActiveLine">删除线路</button>
            </template>
            删除当前线路
          </NTooltip>
        </div>
      </template>
    </NCollapseItem>
    </NCollapse>

  </div>
</template>

<style scoped>
.panel-no-sel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.add-line-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: 1.5px dashed var(--ark-pink);
  background: transparent;
  color: var(--ark-pink);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.add-line-btn:hover {
  background: rgba(255, 45, 120, 0.08);
}

.line-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.line-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px 6px 12px;
  border: 1px solid var(--toolbar-input-border);
  background: var(--toolbar-input-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.line-item:hover {
  border-color: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.line-item:hover::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: var(--ark-pink);
}

.line-item.active {
  background: var(--toolbar-tab-active-bg);
  border-color: var(--ark-pink);
}

.line-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  background: var(--ark-pink);
  box-shadow: 0 0 6px var(--ark-pink-glow);
}

.line-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
  pointer-events: none;
}

.line-item > span {
  pointer-events: none;
}
</style>
