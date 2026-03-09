<script setup>
import { computed, useTemplateRef } from 'vue'
import { LAYOUT_REDUCTION_AXES } from '../lib/layout/paramReduction'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()
const presetFileInput = useTemplateRef('presetFileInput')

const displayConfig = computed(() => store.project?.layoutConfig?.displayConfig || {})
const paramReductionEnabled = computed(() => Boolean(store.project?.layoutConfig?.paramReduction?.enabled))
const layoutPresets = computed(() => store.project?.layoutConfig?.presets || [])
const activePresetId = computed(() => store.project?.layoutConfig?.activePresetId || '')
const activePresetName = computed(() => {
  return layoutPresets.value.find((preset) => preset.id === activePresetId.value)?.name || '未选择预设'
})
const reductionAxes = LAYOUT_REDUCTION_AXES

const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})

const canEditControls = computed(() => Boolean(store.project) && !store.isLayoutRunning)

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
  <div class="pp-inspector schematic-controls">
    <section class="pp-summary">
      <span class="pp-summary__eyebrow">Auto Layout Studio</span>
      <h2 class="pp-summary__title">官方风排版</h2>
      <p class="pp-summary__subtitle">调整显示、布局参数和预设。</p>

      <div class="pp-chip-row">
        <span class="pp-chip pp-chip--accent">{{ paramReductionEnabled ? '语义降维模式' : '地理种子模式' }}</span>
        <span class="pp-chip pp-chip--muted">{{ activePresetName }}</span>
        <span class="pp-chip pp-chip--muted">{{ store.project?.stations?.length || 0 }} 个站点</span>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">显示层</h3>
          <p class="pp-card__subtitle">调整站点和线路显示。</p>
        </div>
      </div>

      <div class="pp-field-stack">
        <div class="pp-card pp-card--muted">
          <div class="pp-card__header">
            <div>
              <h4 class="pp-card__title">站点显示</h4>
              <p class="pp-card__subtitle">调整站点显示。</p>
            </div>
          </div>

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

          <label class="pp-field">
            <span class="pp-field__label">站点图标大小</span>
            <div class="pp-range-row">
              <input
                class="pp-range"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                :value="displayConfig.stationIconSize ?? 1"
                @input="updateConfig('stationIconSize', parseFloat($event.target.value))"
              />
              <span class="pp-range-value">{{ (displayConfig.stationIconSize ?? 1).toFixed(1) }}x</span>
            </div>
          </label>

          <label class="pp-field">
            <span class="pp-field__label">站点样式</span>
            <select
              class="pp-select"
              :value="displayConfig.stationIconStyle ?? 'circle'"
              @change="updateConfig('stationIconStyle', $event.target.value)"
            >
              <option value="circle">圆形</option>
              <option value="square">方形</option>
            </select>
          </label>
        </div>

        <div class="pp-card pp-card--muted">
          <div class="pp-card__header">
            <div>
              <h4 class="pp-card__title">线路显示</h4>
              <p class="pp-card__subtitle">调整线路显示。</p>
            </div>
          </div>

          <label class="pp-checkbox">
            <input
              type="checkbox"
              :checked="displayConfig.showLineBadges ?? true"
              @change="updateConfig('showLineBadges', $event.target.checked)"
            />
            <span>显示线路编号</span>
          </label>

          <label class="pp-field">
            <span class="pp-field__label">线条粗细</span>
            <div class="pp-range-row">
              <input
                class="pp-range"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                :value="displayConfig.edgeWidthScale ?? 1"
                @input="updateConfig('edgeWidthScale', parseFloat($event.target.value))"
              />
              <span class="pp-range-value">{{ (displayConfig.edgeWidthScale ?? 1).toFixed(1) }}x</span>
            </div>
          </label>

          <label class="pp-field">
            <span class="pp-field__label">线条透明度</span>
            <div class="pp-range-row">
              <input
                class="pp-range"
                type="range"
                min="0.3"
                max="1"
                step="0.05"
                :value="displayConfig.edgeOpacity ?? 1"
                @input="updateConfig('edgeOpacity', parseFloat($event.target.value))"
              />
              <span class="pp-range-value">{{ Math.round((displayConfig.edgeOpacity ?? 1) * 100) }}%</span>
            </div>
          </label>
        </div>
      </div>
    </section>

    <section class="pp-card">
      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">布局引擎</h3>
          <p class="pp-card__subtitle">调整布局参数。</p>
        </div>
      </div>

      <div class="pp-field-stack">
        <label class="pp-field">
          <span class="pp-field__label">转角圆滑度</span>
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
          <p class="pp-field__help">值越大，转角越圆。</p>
        </label>

        <label class="pp-checkbox">
          <input
            type="checkbox"
            :checked="paramReductionEnabled"
            :disabled="!canEditControls"
            @change="setParamReductionEnabled($event.target.checked)"
          />
          <span>启用语义降维参数</span>
        </label>

        <label class="pp-field">
          <span class="pp-field__label">地理种子缩放</span>
          <div class="pp-range-row">
            <input
              v-model.number="layoutGeoSeedScale"
              class="pp-range"
              type="range"
              min="0.1"
              max="16"
              step="0.1"
              :disabled="!canEditControls || paramReductionEnabled"
            />
            <span class="pp-range-value">{{ layoutGeoSeedScale.toFixed(1) }}</span>
          </div>
          <p class="pp-field__help">
            <template v-if="paramReductionEnabled">当前由语义轴控制。</template>
            <template v-else>值越大，展开越明显。</template>
          </p>
        </label>

        <div v-if="paramReductionEnabled" class="schematic-controls__axis-list">
          <div class="pp-card pp-card--muted">
            <div class="pp-card__header">
              <div>
                <h4 class="pp-card__title">语义轴</h4>
                <p class="pp-card__subtitle">调整语义轴。</p>
              </div>
              <button class="pp-btn pp-btn--ghost" type="button" :disabled="!canEditControls" @click="resetAxes">
                归零
              </button>
            </div>

            <div class="pp-field-stack">
              <label
                v-for="(axis, index) in reductionAxes"
                :key="axis.key"
                class="pp-field"
              >
                <div class="pp-field__head">
                  <span class="pp-field__label">{{ axis.label }}</span>
                  <span class="pp-field__meta">{{ getAxisValue(index).toFixed(1) }}</span>
                </div>
                <input
                  class="pp-range"
                  type="range"
                  min="-3"
                  max="3"
                  step="0.1"
                  :value="getAxisValue(index)"
                  :disabled="!canEditControls"
                  @input="updateAxisValue(index, parseFloat($event.target.value))"
                />
                <p class="pp-field__help">{{ axis.hint }}</p>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="pp-card">
      <input
        ref="presetFileInput"
        type="file"
        accept=".json,.layout-preset.json,application/json"
        class="schematic-controls__file-input"
        @change="importPreset"
      />

      <div class="pp-card__header">
        <div>
          <h3 class="pp-card__title">预设库</h3>
          <p class="pp-card__subtitle">管理排版预设。</p>
        </div>
      </div>

      <label class="pp-field">
        <span class="pp-field__label">当前预设</span>
        <select
          class="pp-select"
          :value="activePresetId"
          :disabled="!canEditControls || !layoutPresets.length"
          @change="handlePresetChange"
        >
          <option value="">{{ layoutPresets.length ? '选择已保存预设' : '暂无已保存预设' }}</option>
          <option v-for="preset in layoutPresets" :key="preset.id" :value="preset.id">
            {{ preset.name }}
          </option>
        </select>
      </label>

      <div class="pp-toolbar">
        <button class="pp-btn pp-btn--primary" type="button" :disabled="!canEditControls" @click="savePreset">
          另存预设
        </button>
        <button class="pp-btn" type="button" :disabled="!activePresetId || store.isLayoutRunning" @click="overwritePreset">
          覆盖保存
        </button>
        <button class="pp-btn pp-btn--ghost" type="button" :disabled="!store.project" @click="exportPreset">
          导出
        </button>
        <button class="pp-btn pp-btn--ghost" type="button" :disabled="!canEditControls" @click="openPresetImport">
          导入
        </button>
        <button class="pp-btn pp-btn--danger" type="button" :disabled="!activePresetId || store.isLayoutRunning" @click="deletePreset">
          删除
        </button>
      </div>

      <p class="pp-note">预设会随工程保存，也可导出为 JSON。</p>
    </section>
  </div>
</template>

<style scoped>
.schematic-controls__axis-list {
  display: flex;
  flex-direction: column;
}

.schematic-controls__file-input {
  display: none;
}
</style>
