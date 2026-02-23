<script setup>
import { computed } from 'vue'
import { NCollapse, NCollapseItem } from 'naive-ui'
import { useProjectStore } from '../stores/projectStore'

const store = useProjectStore()

const displayConfig = computed(() => store.project?.layoutConfig?.displayConfig || {})

const layoutGeoSeedScale = computed({
  get: () => Number(store.project?.layoutConfig?.geoSeedScale ?? 6),
  set: (value) => store.setLayoutGeoSeedScale(value),
})

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
        <label class="pp-label">地理种子缩放</label>
        <div class="pp-range-row">
          <input
            class="pp-range"
            v-model.number="layoutGeoSeedScale"
            type="range"
            min="0.1"
            max="16"
            step="0.1"
            :disabled="!store.project || store.isLayoutRunning"
          />
          <span class="pp-range-value">{{ layoutGeoSeedScale.toFixed(1) }}</span>
        </div>
        <p class="pp-hint">值越大，初始地理骨架展开越明显。</p>
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
  max-height: 500px;
  overflow-y: auto;
}
</style>
