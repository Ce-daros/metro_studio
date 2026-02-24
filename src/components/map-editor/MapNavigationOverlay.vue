<script setup>
defineProps({
  navPrompt: { type: [String, null], default: null },
  navResultVisible: { type: Boolean, required: true },
  navigationResult: { type: [Object, null], default: null },
  formatNavDistance: { type: Function, required: true },
})

const emit = defineEmits(['exit-navigation'])
</script>

<template>
  <div v-if="navPrompt" class="map-editor__nav-prompt">
    <span style="font-size:14px;color:var(--ark-pink);line-height:1;">▣</span>
    <span>{{ navPrompt }}</span>
    <button class="map-editor__nav-prompt-close" @click="emit('exit-navigation')">Esc 退出</button>
  </div>

  <div v-if="navResultVisible" class="map-editor__nav-panel">
    <div class="map-editor__nav-panel-header">
      <h3>导航结果</h3>
      <button class="map-editor__nav-panel-close" @click="emit('exit-navigation')" aria-label="关闭导航">
        <span style="font-size:14px;color:var(--ark-pink);line-height:1;">▣</span>
      </button>
    </div>
    <div v-if="navigationResult" class="map-editor__nav-panel-body">
      <div class="map-editor__nav-summary">
        <span class="map-editor__nav-total">总距离 {{ formatNavDistance(navigationResult.totalMeters) }}</span>
        <span class="map-editor__nav-detail">
          步行 {{ formatNavDistance(navigationResult.walkToOriginMeters) }}
          → 地铁 {{ formatNavDistance(navigationResult.transitMeters) }}
          → 步行 {{ formatNavDistance(navigationResult.walkFromDestMeters) }}
        </span>
      </div>
      <div
        v-for="(seg, i) in navigationResult.segments"
        :key="i"
        class="map-editor__nav-segment"
      >
        <span class="map-editor__nav-seg-color" :style="{ background: seg.lineColor }"></span>
        <span class="map-editor__nav-seg-text">
          {{ seg.lineName }}：{{ seg.fromStation }} → {{ seg.toStation }}（{{ seg.stationCount }}站，{{ formatNavDistance(seg.distanceMeters) }}）
        </span>
      </div>
    </div>
    <div v-else class="map-editor__nav-panel-body">
      <p class="map-editor__nav-no-route">未找到可达路径，请尝试更近的位置</p>
    </div>
  </div>
</template>

<style scoped>
.map-editor__nav-prompt {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border: 1px solid var(--toolbar-border);
  border-radius: 999px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  font-size: 12px;
  font-weight: 500;
  z-index: 20;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}

.map-editor__nav-prompt-close {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.map-editor__nav-prompt-close:hover {
  color: var(--toolbar-text);
  background: rgba(255, 255, 255, 0.08);
}

.map-editor__nav-panel {
  position: absolute;
  top: 12px;
  right: 56px;
  width: 280px;
  max-height: calc(100% - 24px);
  overflow: auto;
  border: 1px solid var(--toolbar-border);
  border-radius: 12px;
  background: var(--toolbar-card-bg);
  color: var(--toolbar-text);
  padding: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  z-index: 20;
}

.map-editor__nav-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.map-editor__nav-panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.map-editor__nav-panel-close {
  border: none;
  background: transparent;
  color: var(--toolbar-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.map-editor__nav-panel-close:hover {
  color: var(--toolbar-text);
  background: rgba(255, 255, 255, 0.08);
}

.map-editor__nav-panel-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-editor__nav-summary {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--toolbar-divider);
}

.map-editor__nav-total {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.map-editor__nav-detail {
  font-size: 11px;
  color: var(--toolbar-muted);
  line-height: 1.4;
}

.map-editor__nav-segment {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}

.map-editor__nav-seg-color {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
  margin-top: 1px;
}

.map-editor__nav-seg-text {
  font-size: 12px;
  line-height: 1.4;
}

.map-editor__nav-no-route {
  margin: 0;
  font-size: 12px;
  color: var(--toolbar-muted);
  text-align: center;
  padding: 12px 0;
}
</style>
