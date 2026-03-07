<script setup>
import { computed, useTemplateRef } from 'vue'
import { NCollapse, NCollapseItem } from 'naive-ui'
import { LAYOUT_REDUCTION_AXES } from '../lib/layout/paramReduction'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const presetFileInput = useTemplateRef('presetFileInput')

const displayConfig = computed(() => store.project?.layoutConfig?.displayConfig || {})
const paramReductionEnabled = computed(() => Boolean(store.project?.layoutConfig?.paramReduction?.enabled))
const layoutPresets = computed(() => store.project?.layoutConfig?.presets || [])
const activePresetId = computed(() => store.project?.layoutConfig?.activePresetId || '')

const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})

const reductionAxes = LAYOUT_REDUCTION_AXES

function getAxisValue(index) {
  return Number(store.project?.layoutConfig?.paramReduction?.deltas?.[index] ?? 0)
}

function setParamReductionEnabled(value) {
  store.setLayoutParamReductionEnabled(value)
}

function updateAxisValue(index, value) {
  if (!paramReductionEnabled.value) {
    store.setLayoutParamReductionEnabled(true)
  }
  store.setLayoutParamReductionAxisDelta(index, value)
}

function resetAxes() {
  store.resetLayoutParamReductionAxisDeltas()
}

function handlePresetChange(event) {
  const presetId = String(event.target.value || '')
  if (!presetId) return
  store.applyLayoutPreset(presetId)
}

function savePreset() {
  const suggested = layoutPresets.value.length
    ? `参数预设 ${layoutPresets.value.length + 1}`
    : '参数预设 1'
  const name = window.prompt('输入新预设名称', suggested)
  if (!name) return
  store.saveCurrentLayoutPreset(name)
}

function overwritePreset() {
  if (!activePresetId.value) return
  const activePreset = layoutPresets.value.find((preset) => preset.id === activePresetId.value)
  if (!activePreset) return
  store.saveCurrentLayoutPreset(activePreset.name, { overwriteId: activePreset.id })
}

function deletePreset() {
  if (!activePresetId.value) return
  const activePreset = layoutPresets.value.find((preset) => preset.id === activePresetId.value)
  if (!activePreset) return
  const confirmed = window.confirm(`删除预设“${activePreset.name}”？`)
  if (!confirmed) return
  store.deleteLayoutPreset(activePreset.id)
}

function exportPreset() {
  store.exportLayoutPreset(activePresetId.value || null)
}

function openPresetImport() {
  presetFileInput.value?.click()
}

async function importPreset(event) {
  const [file] = event.target.files || []
  if (!file) return
  try {
    await store.importLayoutPresetFile(file)
  } catch (error) {
    store.statusText = `导入预设失败: ${error.message || 'unknown error'}`
  } finally {
    event.target.value = ''
  }
}

function updateConfig(key, value) {
  if (!store.project?.layoutConfig?.displayConfig) return
  store.project.layoutConfig.displayConfig[key] = value
}
</script>

<template>
  <div class="schematic-controls">
    <NCollapse :default-expanded-names="['station', 'line', 'layout']">
      <NCollapseItem title="站点显示" name="station">
        <label class="pp-checkbox">
          <input
            type="checkbox"
            :checked="displayConfig.showStationNumbers ?? false"
            @change="updateConfig('showStationNumbers', $event.target.checked)"
          />
          <span>显示站点编号</span>
        </label>
        <label class="pp-checkbox">
          <input
            type="checkbox"
            :checked="displayConfig.showInterchangeMarkers ?? true"
            @change="updateConfig('showInterchangeMarkers', $event.target.checked)"
          />
          <span>显示换乘站标记</span>
        </label>
        <label class="pp-label">站点图标大小</label>
        <div class="pp-range-row">
          <input
            class="pp-range"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            :value="displayConfig.stationIconSize ?? 1.0"
            @input="updateConfig('stationIconSize', parseFloat($event.target.value))"
          />
          <span class="pp-range-value">{{ (displayConfig.stationIconSize ?? 1.0).toFixed(1) }}x</span>
        </div>
        <label class="pp-label">站点样式</label>
        <select
          class="pp-select"
          :value="displayConfig.stationIconStyle ?? 'circle'"
          @change="updateConfig('stationIconStyle', $event.target.value)"
        >
          <option value="circle">圆形</option>
          <option value="square">方形</option>
        </select>
      </NCollapseItem>

      <NCollapseItem title="线路显示" name="line">
        <label class="pp-checkbox">
          <input
            type="checkbox"
            :checked="displayConfig.showLineBadges ?? true"
            @change="updateConfig('showLineBadges', $event.target.checked)"
          />
          <span>显示线路编号</span>
        </label>
        <label class="pp-label">线条粗细</label>
        <div class="pp-range-row">
          <input
            class="pp-range"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            :value="displayConfig.edgeWidthScale ?? 1.0"
            @input="updateConfig('edgeWidthScale', parseFloat($event.target.value))"
          />
          <span class="pp-range-value">{{ (displayConfig.edgeWidthScale ?? 1.0).toFixed(1) }}x</span>
        </div>
        <label class="pp-label">线条透明度</label>
        <div class="pp-range-row">
          <input
            class="pp-range"
            type="range"
            min="0.3"
            max="1.0"
            step="0.05"
            :value="displayConfig.edgeOpacity ?? 1.0"
            @input="updateConfig('edgeOpacity', parseFloat($event.target.value))"
          />
          <span class="pp-range-value">{{ Math.round((displayConfig.edgeOpacity ?? 1.0) * 100) }}%</span>
        </div>
      </NCollapseItem>

      <NCollapseItem title="布局参数" name="layout">
        <label class="pp-label">转角圆滑度</label>
        <div class="pp-range-row">
          <input
            class="pp-range"
            type="range"
            min="0"
            max="30"
            step="1"
            :value="displayConfig.cornerRadius ?? 10"
            @input="updateConfig('cornerRadius', parseInt($event.target.value, 10))"
          />
          <span class="pp-range-value">{{ displayConfig.cornerRadius ?? 10 }}px</span>
        </div>
        <p class="pp-hint">值越大，线路转角越圆滑。设为 0 时为直角。</p>
        <label class="pp-checkbox">
          <input
            type="checkbox"
            :checked="paramReductionEnabled"
            :disabled="!store.project || store.isLayoutRunning"
            @change="setParamReductionEnabled($event.target.checked)"
          />
          <span>启用语义降维参数</span>
        </label>
        <p class="pp-hint">
          开启后使用 5 个语义轴映射到底层排版参数，适合手动调风格；关闭后仅使用地理种子缩放。
        </p>
        <label class="pp-label">地理种子缩放</label>
        <div class="pp-range-row">
          <input
            class="pp-range"
            v-model.number="layoutGeoSeedScale"
            type="range"
            min="0.1"
            max="16"
            step="0.1"
            :disabled="!store.project || store.isLayoutRunning || paramReductionEnabled"
          />
          <span class="pp-range-value">{{ layoutGeoSeedScale.toFixed(1) }}</span>
        </div>
        <p class="pp-hint">
          <template v-if="paramReductionEnabled">已由“骨架展开 / 紧凑程度”共同接管。</template>
          <template v-else>值越大，初始地理骨架展开越明显。</template>
        </p>
        <div class="pp-preset-block">
          <input
            ref="presetFileInput"
            type="file"
            accept=".json,.layout-preset.json,application/json"
            class="pp-file-input"
            @change="importPreset"
          />
          <label class="pp-label">参数预设</label>
          <select
            class="pp-select"
            :value="activePresetId"
            :disabled="!store.project || store.isLayoutRunning || !layoutPresets.length"
            @change="handlePresetChange"
          >
            <option value="">{{ layoutPresets.length ? '选择已保存预设' : '暂无已保存预设' }}</option>
            <option
              v-for="preset in layoutPresets"
              :key="preset.id"
              :value="preset.id"
            >
              {{ preset.name }}
            </option>
          </select>
          <div class="pp-preset-actions">
            <button class="pp-action-btn" type="button" :disabled="!store.project || store.isLayoutRunning" @click="savePreset">
              另存预设
            </button>
            <button class="pp-action-btn" type="button" :disabled="!activePresetId || store.isLayoutRunning" @click="overwritePreset">
              覆盖保存
            </button>
            <button class="pp-action-btn" type="button" :disabled="!store.project" @click="exportPreset">
              导出预设
            </button>
            <button class="pp-action-btn" type="button" :disabled="!store.project || store.isLayoutRunning" @click="openPresetImport">
              导入预设
            </button>
            <button class="pp-action-btn" type="button" :disabled="!activePresetId || store.isLayoutRunning" @click="deletePreset">
              删除预设
            </button>
          </div>
          <p class="pp-hint">预设会跟随工程保存，也可单独导出/导入 JSON 文件。</p>
        </div>
        <div v-if="paramReductionEnabled" class="pp-reduction">
          <div class="pp-reduction__header">
            <span class="pp-label">语义轴</span>
            <button
              class="pp-reset-btn"
              type="button"
              :disabled="!store.project || store.isLayoutRunning"
              @click="resetAxes"
            >
              归零
            </button>
          </div>
          <div
            v-for="(axis, index) in reductionAxes"
            :key="axis.key"
            class="pp-reduction__axis"
          >
            <div class="pp-reduction__axis-head">
              <span>{{ axis.label }}</span>
              <span class="pp-range-value">{{ getAxisValue(index).toFixed(1) }}</span>
            </div>
            <input
              class="pp-range"
              type="range"
              min="-3"
              max="3"
              step="0.1"
              :value="getAxisValue(index)"
              :disabled="!store.project || store.isLayoutRunning"
              @input="updateAxisValue(index, parseFloat($event.target.value))"
            />
            <p class="pp-hint">{{ axis.hint }}</p>
          </div>
        </div>
      </NCollapseItem>
    </NCollapse>
  </div>
</template>

<style scoped>
.schematic-controls {
  background: var(--toolbar-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 8px 12px;
  overflow-y: auto;
}

.pp-reduction {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--toolbar-border) 72%, transparent);
}

.pp-preset-block {
  margin-top: 12px;
}

.pp-preset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.pp-action-btn,
.pp-reset-btn {
  border: 1px solid var(--toolbar-border);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
}

.pp-file-input {
  display: none;
}

.pp-reduction__header,
.pp-reduction__axis-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pp-reduction__axis {
  margin-top: 10px;
}

</style>
